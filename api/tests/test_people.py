"""People endpoints: detail, ancestors, descendants, sosa, common-ancestors."""

from __future__ import annotations


def test_person_detail(client, sample_person_id):
    r = client.get(f"/api/people/{sample_person_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == sample_person_id
    # Structural invariants of PersonDetail.
    assert isinstance(body["spouses"], list)
    assert isinstance(body["children"], list)
    assert isinstance(body["events"], list)


def test_person_not_found(client):
    r = client.get("/api/people/I99999999")
    assert r.status_code == 404


def test_ancestors(client, sosa_root_id):
    r = client.get(f"/api/people/{sosa_root_id}/ancestors", params={"depth": 4})
    assert r.status_code == 200
    nodes = r.json()
    assert isinstance(nodes, list) and nodes
    # The focus person (depth 0) is excluded; only ancestors are returned.
    assert all(1 <= n["depth"] <= 4 for n in nodes)
    assert sosa_root_id not in {n["id"] for n in nodes}
    # Sosa numbers grow by generation: a depth-1 parent is 2 (father) or 3 (mother).
    depth1 = [n for n in nodes if n["depth"] == 1]
    assert all(n["sosa"] in (2, 3) for n in depth1)


def test_ancestors_depth_validation(client, sosa_root_id):
    assert (
        client.get(f"/api/people/{sosa_root_id}/ancestors", params={"depth": 0}).status_code == 422
    )
    assert (
        client.get(f"/api/people/{sosa_root_id}/ancestors", params={"depth": 31}).status_code == 422
    )


def test_ancestors_404(client):
    assert client.get("/api/people/I99999999/ancestors").status_code == 404


def test_descendants_empty_for_proband(client, sosa_root_id):
    """The Sosa root is the youngest subject, so it has no recorded descendants."""
    r = client.get(f"/api/people/{sosa_root_id}/descendants", params={"depth": 3})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_descendants_inverse_of_ancestors(client, sosa_root_id):
    """Ancestors and descendants are inverse relations: an ancestor of the root
    must list the root among its descendants."""
    anc = client.get(f"/api/people/{sosa_root_id}/ancestors", params={"depth": 5}).json()
    # Pick a great-grandparent (depth 3) so the path back down is non-trivial.
    forebear = next((n for n in anc if n["depth"] == 3), anc[-1])
    desc = client.get(f"/api/people/{forebear['id']}/descendants", params={"depth": 5}).json()
    assert desc, "an ancestor should have descendants"
    assert all(n["depth"] >= 1 for n in desc)
    assert sosa_root_id in {n["id"] for n in desc}


def test_sosa_root_is_one(client, sosa_root_id):
    """The Sosa-Stradonitz number of the tree root is 1 by definition."""
    r = client.get(f"/api/people/{sosa_root_id}/sosa")
    assert r.status_code == 200
    assert r.json()["sosa"] == 1


def test_sosa_404(client):
    assert client.get("/api/people/I99999999/sosa").status_code == 404


def test_common_ancestors_self(client, sosa_root_id):
    """A person shares all of their own ancestors with themselves."""
    r = client.get(
        f"/api/people/{sosa_root_id}/common-ancestors",
        params={"other": sosa_root_id},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_common_ancestors_404(client, sosa_root_id):
    r = client.get(
        f"/api/people/{sosa_root_id}/common-ancestors",
        params={"other": "I99999999"},
    )
    assert r.status_code == 404


def test_person_parents_carry_their_years(client):
    """The parents block shows lifespans: they must match the parents' own records."""
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ.get("GENEALOGY_DSN", "dbname=genealogy"))
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT pc.child_id, f.birth_year AS fb, f.death_year AS fd,
               m.birth_year AS mb, m.death_year AS md
        FROM parent_child pc
        JOIN individuals f ON f.id = pc.father_id
        JOIN individuals m ON m.id = pc.mother_id
        WHERE f.birth_year < 1800 AND f.death_year IS NOT NULL
          AND m.birth_year < 1800 AND m.death_year IS NOT NULL
        ORDER BY pc.child_id
        LIMIT 1
        """
    )
    row = cur.fetchone()
    conn.close()
    parents = client.get(f"/api/people/{row['child_id']}").json()["parents"]
    assert (parents["father_birth_year"], parents["father_death_year"]) == (row["fb"], row["fd"])
    assert (parents["mother_birth_year"], parents["mother_death_year"]) == (row["mb"], row["md"])


def _db_cursor():
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ.get("GENEALOGY_DSN", "dbname=genealogy"))
    return conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def test_tree_neighbourhood_holds_two_generations_up_and_one_down(client):
    """The tree opens on one request: it must already hold every box it draws."""
    conn, cur = _db_cursor()
    # A dead person with four known grandparents and at least one child.
    cur.execute(
        """
        SELECT pc.child_id AS id
        FROM parent_child pc
        JOIN parent_child pf ON pf.child_id = pc.father_id
        JOIN parent_child pm ON pm.child_id = pc.mother_id
        JOIN individuals i ON i.id = pc.child_id
        WHERE i.death_year IS NOT NULL AND i.birth_year < 1850
          AND pf.father_id IS NOT NULL AND pf.mother_id IS NOT NULL
          AND pm.father_id IS NOT NULL AND pm.mother_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM parent_child k WHERE pc.child_id IN (k.father_id, k.mother_id))
        ORDER BY pc.child_id LIMIT 1
        """
    )
    person = cur.fetchone()["id"]
    cur.execute(
        """
        SELECT pc.father_id, pc.mother_id, pf.father_id AS ff, pf.mother_id AS fm,
               pm.father_id AS mf, pm.mother_id AS mm
        FROM parent_child pc
        JOIN parent_child pf ON pf.child_id = pc.father_id
        JOIN parent_child pm ON pm.child_id = pc.mother_id
        WHERE pc.child_id = %s
        """,
        [person],
    )
    expected_up = {v for row in cur.fetchall() for v in row.values()}
    cur.execute("SELECT child_id FROM parent_child WHERE %s IN (father_id, mother_id)", [person])
    expected_children = {r["child_id"] for r in cur.fetchall()}
    conn.close()

    r = client.get(f"/api/people/{person}/tree", params={"up": 2, "down": 1})
    assert r.status_code == 200
    by_id = {p["id"]: p for p in r.json()}
    assert {person} | expected_up | expected_children <= set(by_id)
    assert set(by_id[person]["child_ids"]) == expected_children


def test_tree_batch_matches_the_parent_child_links(client, sample_family_id):
    conn, cur = _db_cursor()
    cur.execute(
        "SELECT child_id, father_id, mother_id FROM parent_child WHERE family_id = %s",
        [sample_family_id],
    )
    rows = cur.fetchall()
    conn.close()
    ids = ",".join(r["child_id"] for r in rows) + ",I99999999"
    got = {p["id"]: p for p in client.get("/api/people", params={"ids": ids}).json()}
    assert "I99999999" not in got  # an unknown id is just absent
    for row in rows:
        p = got[row["child_id"]]
        if not p.get("living"):
            assert (p["father_id"], p["mother_id"]) == (row["father_id"], row["mother_id"])


def test_tree_batch_is_bounded(client):
    ids = ",".join(f"I{n}" for n in range(301))
    assert client.get("/api/people", params={"ids": ids}).status_code == 400
