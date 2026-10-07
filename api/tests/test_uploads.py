"""Tests for POST /api/uploads - the one write path in the API.

Every test redirects the depot to a tmp directory, so the deployment's real
depot is never touched by a test run.
"""

from __future__ import annotations

import json

import pytest

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.4\n" + b"\x00" * 64


PASSWORD = "mot-de-passe-de-test"


@pytest.fixture(autouse=True)
def configured(tmp_path, monkeypatch):
    """Give every test a known password and a throwaway depot, whatever the .env says."""
    from app.routers import uploads

    monkeypatch.setattr(uploads, "PASSWORD", PASSWORD)
    monkeypatch.setattr(uploads, "DEPOT", tmp_path)


@pytest.fixture
def depot(tmp_path, monkeypatch):
    """Point the router at a throwaway directory and hand it back."""
    from app.routers import uploads

    monkeypatch.setattr(uploads, "DEPOT", tmp_path)
    return tmp_path


def _batches(depot):
    return sorted(p for p in depot.iterdir() if p.is_dir())


def test_auth_rejects_wrong_password(client):
    """The gate says no before anything else happens."""
    r = client.post("/api/uploads/auth", data={"password": "pas-le-bon"})
    assert r.status_code == 401


def test_auth_accepts_the_password(client):
    """The password can be checked without sending a file with it."""
    r = client.post("/api/uploads/auth", data={"password": PASSWORD})
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_upload_writes_files_and_meta(client, depot):
    """A batch lands as numbered files plus a meta.json holding the originals."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD, "sender": "Jeanne", "note": "Registre paroissial"},
        files=[
            ("files", ("IMG_4312.JPG", JPEG, "image/jpeg")),
            ("files", ("acte scanné (2).png", PNG, "image/png")),
        ],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["files"] == 2
    assert body["bytes"] == len(JPEG) + len(PNG)

    (batch,) = _batches(depot)
    assert batch.name == body["batch"]

    # Stored names are numbered in send order and stripped to ASCII; the
    # originals survive only in meta.json.
    stored = sorted(p.name for p in batch.iterdir())
    assert stored == ["01-IMG_4312.jpg", "02-acte-scanne-2.png", "meta.json"]
    assert (batch / "01-IMG_4312.jpg").read_bytes() == JPEG

    meta = json.loads((batch / "meta.json").read_text(encoding="utf-8"))
    assert meta["sender"] == "Jeanne"
    assert meta["note"] == "Registre paroissial"
    assert [f["original_name"] for f in meta["files"]] == ["IMG_4312.JPG", "acte scanné (2).png"]
    assert meta["total_bytes"] == len(JPEG) + len(PNG)


def test_upload_appends_the_message_to_the_journal(client, depot):
    """What the sender wrote is the whole point: it must be readable in one place."""
    from app.routers import uploads

    for note in ("Mariage d'Adam, 1641", "Baptême trouvé aux AD70"):
        r = client.post(
            "/api/uploads",
            data={"password": PASSWORD, "sender": "Jeanne", "note": note},
            files=[("files", ("a.jpg", JPEG, "image/jpeg"))],
        )
        assert r.status_code == 200, r.text

    journal = (depot / uploads.JOURNAL_NAME).read_text(encoding="utf-8")
    assert journal.count("# Journal des dépôts") == 1  # header written once
    assert "> Mariage d'Adam, 1641" in journal
    assert "> Baptême trouvé aux AD70" in journal
    assert journal.count("- [ ] trié") == 2
    for batch in _batches(depot):
        assert batch.name in journal


def test_upload_accepts_pdf(client, depot):
    """Archives hand out PDFs as often as images."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[("files", ("releve.pdf", PDF, "application/pdf"))],
    )
    assert r.status_code == 200, r.text
    (batch,) = _batches(depot)
    assert (batch / "01-releve.pdf").exists()


def test_upload_rejects_wrong_password_before_writing(client, depot):
    """A bad password must not leave a directory behind."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD + "x"},
        files=[("files", ("a.jpg", JPEG, "image/jpeg"))],
    )
    assert r.status_code == 401
    assert _batches(depot) == []


def test_upload_rejects_a_disallowed_extension(client, depot):
    """Only images and PDFs get in."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[("files", ("script.sh", b"#!/bin/sh\nrm -rf /\n", "text/x-sh"))],
    )
    assert r.status_code == 400
    assert _batches(depot) == []


def test_upload_rejects_content_that_is_not_what_it_claims(client, depot):
    """A .jpg holding a shell script is refused on its magic bytes."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[("files", ("deguise.jpg", b"#!/bin/sh\nid\n", "image/jpeg"))],
    )
    assert r.status_code == 400
    assert _batches(depot) == []


def test_a_refused_file_takes_the_whole_batch_with_it(client, depot):
    """Half a batch on disk would be mistaken for a complete one at triage."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[
            ("files", ("bon.jpg", JPEG, "image/jpeg")),
            ("files", ("mauvais.exe", b"MZ" + b"\x00" * 32, "application/octet-stream")),
        ],
    )
    assert r.status_code == 400
    assert _batches(depot) == []


def test_upload_sanitises_a_traversing_filename(client, depot):
    """A path in the filename is flattened, never followed."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[("files", ("../../../../etc/cron.d/pwn.png", PNG, "image/png"))],
    )
    assert r.status_code == 200, r.text
    (batch,) = _batches(depot)
    assert [p.name for p in batch.iterdir() if p.name != "meta.json"] == ["01-pwn.png"]


def test_upload_rejects_an_empty_file(client, depot):
    """An empty file is a failed pick, not a document."""
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[("files", ("vide.jpg", b"", "image/jpeg"))],
    )
    assert r.status_code == 400
    assert _batches(depot) == []


def test_upload_rejects_too_many_files(client, depot):
    """The per-batch file count is capped."""
    from app.routers import uploads

    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[("files", (f"{i}.jpg", JPEG, "image/jpeg")) for i in range(uploads.MAX_FILES + 1)],
    )
    assert r.status_code == 400
    assert _batches(depot) == []


def test_upload_rejects_a_file_over_the_size_cap(client, depot, monkeypatch):
    """The size cap is enforced while streaming, not from a declared length."""
    from app.routers import uploads

    monkeypatch.setattr(uploads, "MAX_FILE_BYTES", 32)
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD},
        files=[("files", ("gros.jpg", JPEG, "image/jpeg"))],
    )
    assert r.status_code == 413
    assert _batches(depot) == []


@pytest.mark.parametrize("unset", ["PASSWORD", "DEPOT"])
def test_unconfigured_deployment_refuses(client, monkeypatch, tmp_path, unset):
    """No password or no depot configured means uploads are off, not open."""
    from app.routers import uploads

    monkeypatch.setattr(uploads, "DEPOT", None if unset == "DEPOT" else tmp_path)
    if unset == "PASSWORD":
        monkeypatch.setattr(uploads, "PASSWORD", "")
    r = client.post("/api/uploads/auth", data={"password": PASSWORD})
    assert r.status_code == 503


def test_a_message_alone_is_a_valid_batch(client, depot):
    """A correction from a person's page may carry no file at all."""
    r = client.post(
        "/api/uploads",
        data={
            "password": PASSWORD,
            "sender": "Papa",
            "note": "Le mariage est en 1898, pas en 1899.",
            "person_id": "I42",
            "person_label": "Prénom NOM (1870-1940)",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["files"] == 0

    (batch,) = _batches(depot)
    assert sorted(p.name for p in batch.iterdir()) == ["meta.json"]
    meta = json.loads((batch / "meta.json").read_text(encoding="utf-8"))
    assert meta["about"] == {"id": "I42", "label": "Prénom NOM (1870-1940)"}
    assert meta["files"] == []

    journal = (depot / "JOURNAL.md").read_text(encoding="utf-8")
    assert "**Au sujet de :** Prénom NOM (1870-1940) (`I42`)" in journal
    assert "aucun, message seul" in journal
    assert "> Le mariage est en 1898, pas en 1899." in journal


def test_files_can_also_name_the_person(client, depot):
    r = client.post(
        "/api/uploads",
        data={"password": PASSWORD, "person_id": "I7"},
        files=[("files", ("acte.jpg", JPEG, "image/jpeg"))],
    )
    assert r.status_code == 200, r.text
    (batch,) = _batches(depot)
    meta = json.loads((batch / "meta.json").read_text(encoding="utf-8"))
    assert meta["about"] == {"id": "I7", "label": None}


def test_nothing_to_send_is_refused(client, depot):
    """No file and no message: nothing would be worth triaging."""
    for note in ("", "   \n "):
        r = client.post("/api/uploads", data={"password": PASSWORD, "note": note})
        assert r.status_code == 400
    assert _batches(depot) == []


def test_a_malformed_person_id_is_refused(client, depot):
    for bad in ("F12", "I", "I12; rm", "../I1", "I12345678"):
        r = client.post(
            "/api/uploads",
            data={"password": PASSWORD, "note": "x", "person_id": bad},
        )
        assert r.status_code == 400, bad
    assert _batches(depot) == []
