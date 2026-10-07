"""Upload endpoints: POST /api/uploads, POST /api/uploads/auth.

The **only** write path in this API, and it deliberately writes nowhere near the
database: a batch lands as plain files in `$GENEALOGY_DEPOT_DIR/<batch>/` next to
a `meta.json`, and a human triages it from there with a proper name and a
transcription. Nothing here touches PostgreSQL, so the "the app never writes to
the DB" rule of the CLAUDE.md still holds.

The gate is one shared password, `$GENEALOGY_UPLOAD_PASSWORD`. It keeps a public
URL from being a free file drop for passers-by; it is not account security, and
it is not meant to be. Both variables are deployment config with no default: a
deployment that sets neither has uploads switched off (503), never open.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import unicodedata
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.limiter import client_ip, limiter

router = APIRouter(prefix="/api", tags=["uploads"])

_DEPOT_ENV = os.environ.get("GENEALOGY_DEPOT_DIR")
DEPOT: Path | None = Path(_DEPOT_ENV) if _DEPOT_ENV else None

PASSWORD: str = os.environ.get("GENEALOGY_UPLOAD_PASSWORD") or ""

MAX_FILES = 20
MAX_FILE_BYTES = 40 * 1024 * 1024  # a full-resolution scan or a phone photo
MAX_BATCH_BYTES = 250 * 1024 * 1024
CHUNK = 1024 * 1024
MAX_SENDER = 120
MAX_NOTE = 4000
MAX_PERSON_LABEL = 160

# What a correction is about: an individual's GEDCOM id, as the person page
# sends it. Only the shape is checked - this route never reads the database.
PERSON_ID = re.compile(r"I\d{1,7}")

# One running log across all batches. `meta.json` is the record of an envelope;
# this is the thing a human actually reads, because what the sender wrote is the
# only context that lets an image be named - and it is useless if it has to be
# hunted for one directory at a time.
JOURNAL_NAME = "JOURNAL.md"

# Extensions are what decides how a file is later opened, so the whitelist is on
# the extension - the magic-byte sniff below only rejects things that are not
# what they claim.
ALLOWED_EXT = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".heic",
    ".heif",  # iPhone default
    ".tif",
    ".tiff",  # archive scans
    ".pdf",
}


def _sniff_ok(head: bytes) -> bool:
    """True if the first bytes look like an image or a PDF."""
    if head.startswith(
        (
            b"\xff\xd8\xff",  # JPEG
            b"\x89PNG\r\n\x1a\n",  # PNG
            b"GIF87a",
            b"GIF89a",
            b"%PDF-",
            b"II*\x00",  # TIFF little-endian
            b"MM\x00*",  # TIFF big-endian
        )
    ):
        return True
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return True
    return head[4:8] == b"ftyp"  # HEIC / HEIF / AVIF


def _safe_stem(name: str) -> str:
    """ASCII, path-free, bounded stem for an uploaded filename."""
    stem = Path(Path(name or "").name).stem
    stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode()
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-._")
    return stem[:60] or "image"


def _check_password(password: str) -> Path:
    """Refuse the request unless uploads are configured and the password matches.

    Returns the depot directory, so callers never handle an unconfigured one.
    """
    if not PASSWORD or DEPOT is None:
        raise HTTPException(status_code=503, detail="Le dépôt n'est pas ouvert")
    if not secrets.compare_digest(password.strip(), PASSWORD):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    return DEPOT


def _append_journal(depot: Path, meta: dict) -> None:
    """Add one entry to `depot/JOURNAL.md`, the running log of what came in.

    Failing to log must not fail an upload that already landed on disk: the
    files and their `meta.json` are the record, this is the convenience copy.
    """
    lines = [
        f"\n## {meta['received_at'][:16].replace('T', ' ')} UTC - `{meta['batch']}`\n",
        f"**De :** {meta['sender'] or 'non précisé'}\n",
    ]
    if meta["about"]:
        about = meta["about"]
        label = f"{about['label']} " if about["label"] else ""
        lines.append(f"**Au sujet de :** {label}(`{about['id']}`)\n")
    if meta["files"]:
        lines.append("**Fichiers :**\n")
        lines += [
            f"- `{f['stored_as']}` ({f['bytes'] // 1024} ko, envoyé sous « {f['original_name']} »)\n"
            for f in meta["files"]
        ]
    else:
        lines.append("**Fichiers :** aucun, message seul\n")
    if meta["note"]:
        lines.append("\n" + "\n".join(f"> {line}" for line in meta["note"].splitlines()) + "\n")
    lines.append("\n- [ ] trié : renommé à la règle et rangé avec sa transcription\n")

    try:
        journal = depot / JOURNAL_NAME
        header = "" if journal.exists() else "# Journal des dépôts\n"
        with journal.open("a", encoding="utf-8") as fh:
            fh.write(header + "".join(lines))
    except OSError:
        pass


@router.post("/uploads/auth")
@limiter.limit("20/hour")
def check_password(request: Request, password: str = Form(...)):
    """Validate the shared password without sending any file with it."""
    _check_password(password)
    return {"ok": True}


@router.post("/uploads")
@limiter.limit("30/hour")
async def create_upload(
    request: Request,
    password: str = Form(...),
    files: list[UploadFile] | None = File(None),
    sender: str = Form(""),
    note: str = Form(""),
    person_id: str = Form(""),
    person_label: str = Form(""),
):
    """
    Accept a batch of act scans / family photos into `$GENEALOGY_DEPOT_DIR`.

    Each batch gets its own timestamped directory holding the files plus a
    `meta.json` recording who sent them, what they said about them, and the
    original filenames (which often carry the only clue about the source).

    A batch may also be a message alone, with no file: a correction sent from a
    person's page ("this date is wrong"). `person_id` / `person_label` then say
    who it is about; they are recorded as given, for the human doing the triage.
    """
    depot = _check_password(password)

    files = files or []
    person_id = person_id.strip()
    if person_id and not PERSON_ID.fullmatch(person_id):
        raise HTTPException(status_code=400, detail="Identifiant de personne invalide")
    if not files and not note.strip():
        raise HTTPException(status_code=400, detail="Ni fichier ni message : rien à envoyer")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"{MAX_FILES} fichiers au maximum par envoi")

    stamp = datetime.now(UTC)
    batch = f"{stamp:%Y-%m-%d_%H%M%S}-{secrets.token_hex(3)}"
    dest = depot / batch
    dest.mkdir(parents=True, exist_ok=False)

    written: list[dict] = []
    total = 0
    try:
        for index, upload in enumerate(files, start=1):
            ext = Path(Path(upload.filename or "").name).suffix.lower()
            if ext not in ALLOWED_EXT:
                raise HTTPException(
                    status_code=400,
                    detail=f"Format non accepté : {upload.filename or '?'} (images et PDF seulement)",
                )

            target = dest / f"{index:02d}-{_safe_stem(upload.filename or '')}{ext}"
            size = 0
            head = b""
            with target.open("wb") as fh:
                while chunk := await upload.read(CHUNK):
                    if not head:
                        head = chunk[:16]
                        if not _sniff_ok(head):
                            raise HTTPException(
                                status_code=400,
                                detail=f"Fichier illisible ou non conforme : {upload.filename or '?'}",
                            )
                    size += len(chunk)
                    total += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"{upload.filename or '?'} dépasse {MAX_FILE_BYTES // (1024 * 1024)} Mo",
                        )
                    if total > MAX_BATCH_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Envoi trop lourd (max {MAX_BATCH_BYTES // (1024 * 1024)} Mo)",
                        )
                    fh.write(chunk)

            if size == 0:
                raise HTTPException(
                    status_code=400, detail=f"Fichier vide : {upload.filename or '?'}"
                )

            written.append(
                {
                    "stored_as": target.name,
                    "original_name": upload.filename,
                    "content_type": upload.content_type,
                    "bytes": size,
                }
            )

        meta = {
            "batch": batch,
            "received_at": stamp.isoformat(),
            "sender": sender.strip()[:MAX_SENDER] or None,
            "note": note.strip()[:MAX_NOTE] or None,
            "about": (
                {"id": person_id, "label": person_label.strip()[:MAX_PERSON_LABEL] or None}
                if person_id
                else None
            ),
            "remote_addr": client_ip(request),
            "files": written,
            "total_bytes": total,
        }
        (dest / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        _append_journal(depot, meta)
    except Exception:
        # A half-written batch is worse than none: the triage step would take it
        # for a complete one.
        for leftover in sorted(dest.iterdir(), reverse=True):
            leftover.unlink(missing_ok=True)
        dest.rmdir()
        raise

    return {"ok": True, "batch": batch, "files": len(written), "bytes": total}
