import pytest
from sqlalchemy import text


# ---------------------------------------------------------------------------
# Source-code structural assertions
# ---------------------------------------------------------------------------

_ROUTE_PATH = (
    __import__("pathlib").Path(__file__).resolve().parents[1]
    / "src"
    / "routes"
    / "routes_employee_portal.py"
)


def _download_prior_document_source() -> str:
    """Return the full source text of the download_prior_document handler."""
    src = _ROUTE_PATH.read_text(encoding="utf-8")
    # Extract only the handler body between its def-line and the next top-level def/decorator
    lines = src.splitlines()
    start = None
    for i, line in enumerate(lines):
        if line.strip().startswith("def download_prior_document("):
            start = i
            break
    assert start is not None, "download_prior_document not found in route source"
    # Collect lines until the next top-level definition or end-of-file
    body_lines = []
    for line in lines[start + 1 :]:
        if line.startswith(("def ", "async def ", "@")):
            break
        body_lines.append(line)
    return "\n".join([lines[start], *body_lines])


def _extract_valid_prior_sql() -> str:
    """Extract the valid_prior SQL fragment from the handler source."""
    src = _download_prior_document_source()
    # The SQL is inside db.execute(text(""" ... """))
    import re
    m = re.search(
        r"valid_prior\s*=\s*db\.execute\(\s*text\(\s*\"\"\"(.+?)\"\"\"\s*\)\s*(?:,|$)",
        src,
        re.DOTALL,
    )
    assert m is not None, "Could not locate valid_prior SQL in handler source"
    return m.group(1)


def test_prior_document_idor_sql_contract(db_session):
    """Execute the handler predicate against an isolated PostgreSQL fixture.

    The workflow tables are intentionally SQL-only in this repository; there are
    no ORM models to import for them. Temporary tables keep this test independent
    of the restored pg-test data while exercising the actual SQL fragment.
    """
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Test requires PostgreSQL")

    db_session.execute(text("""
        create temporary table task_nodes (
            id text primary key,
            workflow_instance_id text not null,
            node_code text not null,
            occurrence_no integer not null,
            status text not null
        ) on commit drop;
        create temporary table task_node_checklist_results (
            id text primary key,
            task_node_id text not null
        ) on commit drop;
        create temporary table checklist_result_document_links (
            checklist_result_id text not null,
            document_id text not null,
            review_status text not null
        ) on commit drop;
        create temporary table dossier_documents (
            id text primary key,
            doc_status text not null
        ) on commit drop;
    """))
    db_session.execute(text("""
        insert into pg_temp.task_nodes values
            ('n1-idor', 'wi-test-idor', '100', 1, 'accepted'),
            ('n2-idor', 'wi-test-idor', '200', 1, 'processing'),
            ('n3-idor', 'wi-test-idor', '300', 1, 'pending'),
            ('n-other', 'wi-other', '100', 1, 'accepted');
        insert into pg_temp.task_node_checklist_results values
            ('r1-idor', 'n1-idor'), ('r2-idor', 'n2-idor'),
            ('r3-idor', 'n3-idor'), ('r-other', 'n-other');
        insert into pg_temp.checklist_result_document_links values
            ('r1-idor', 'd1-idor', 'approved'),
            ('r1-idor', 'd2-idor', 'rejected'),
            ('r1-idor', 'd3-idor', 'approved'),
            ('r2-idor', 'd4-idor', 'rejected'),
            ('r3-idor', 'd5-idor', 'approved'),
            ('r-other', 'd6-idor', 'approved');
        insert into pg_temp.dossier_documents values
            ('d1-idor', 'DANG_DUNG'), ('d2-idor', 'DANG_DUNG'),
            ('d3-idor', 'THU_HOI'), ('d4-idor', 'DANG_DUNG'),
            ('d5-idor', 'DANG_DUNG'), ('d6-idor', 'DANG_DUNG');
    """))

    sql_check = _extract_valid_prior_sql().replace("public.", "pg_temp.")

    def check_doc(doc_id):
        return db_session.execute(
            text(sql_check),
            {"task_node_id": "n2-idor", "document_id": doc_id},
        ).scalar()

    assert check_doc("d1-idor") is True, "Valid prior document must be accepted"
    assert check_doc("d2-idor") is False, "Rejected document must be blocked"
    assert check_doc("d3-idor") is False, "Revoked document must be blocked"
    assert check_doc("d4-idor") is True, "Current-node document remains viewable"
    assert check_doc("d5-idor") is False, "Later-node document must be blocked"
    assert check_doc("d6-idor") is False, "Wrong-workflow document must be blocked"
    db_session.rollback()


def test_download_prior_sql_includes_workflow_instance_join():
    """CTE 'moc' must resolve workflow_instance_id from task_nodes and join back on it."""
    sql = _extract_valid_prior_sql()
    assert "workflow_instance_id" in sql
    assert "moc.workflow_instance_id" in sql


def test_download_prior_sql_enforces_strict_prior_tuple():
    """Document must come from a strictly earlier (node_code, occurrence_no) pair."""
    sql = _extract_valid_prior_sql()
    assert "(n.node_code, n.occurrence_no) < (moc.node_code, moc.occurrence_no)" in sql


def test_download_prior_sql_requires_accepted_completed_source():
    """Source task_node must be accepted or completed — no in-progress or pending."""
    sql = _extract_valid_prior_sql()
    assert "n.status in ('accepted', 'completed')" in sql


def test_download_prior_sql_rejects_rejected_review():
    """Documents with review_status 'rejected' must be excluded."""
    sql = _extract_valid_prior_sql()
    assert "review_status <> 'rejected'" in sql


def test_download_prior_sql_requires_dang_dung():
    """Only DANG_DUNG (currently valid) documents may be served."""
    sql = _extract_valid_prior_sql()
    assert "doc_status = 'DANG_DUNG'" in sql


def test_download_prior_sql_uses_bind_parameter_for_document_id():
    """The query must use a bind parameter :document_id — never a hardcoded or f-string literal."""
    sql = _extract_valid_prior_sql()
    assert ":document_id" in sql, (
        "valid_prior SQL must reference :document_id bind parameter to prevent IDOR"
    )


def test_read_scan_called_after_valid_prior_gate():
    """read_scan must be reached only after valid_prior returns truthy — never before."""
    import re

    src = _download_prior_document_source()
    vp_pos = src.find("valid_prior")
    read_scan_call = re.search(r"(?m)^\s*row, body = read_scan\(", src)
    assert vp_pos != -1, "valid_prior not found in handler"
    assert read_scan_call is not None, "read_scan call not found in handler"
    assert vp_pos < read_scan_call.start(), (
        "read_scan must appear AFTER valid_prior check in handler source"
    )


def test_read_scan_gated_by_valid_prior_check():
    """There must be an explicit truthiness check on valid_prior before read_scan."""
    src = _download_prior_document_source()
    # Look for "if not valid_prior:" followed by raise … before read_scan
    import re
    m = re.search(
        r"if\s+not\s+valid_prior\s*:\s*\n\s*raise",
        src,
    )
    assert m is not None, (
        "Handler must have 'if not valid_prior: raise' guard before read_scan"
    )
    guard_end = m.end()
    read_scan_call = re.search(r"(?m)^\s*row, body = read_scan\(", src)
    assert read_scan_call is not None, "read_scan call not found in handler"
    assert guard_end < read_scan_call.start(), (
        "The valid_prior guard must precede the read_scan call"
    )


def test_shortage_route_requires_workflow_membership_or_contract_read():
    """A guessed task node must not reveal its document shortage to another employee."""
    src = _ROUTE_PATH.read_text(encoding="utf-8")
    lines = src.splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip().startswith("def node_shortage("))
    body = []
    for line in lines[start + 1:]:
        if line and not line.startswith((" ", "\t")) and line.strip():
            break
        body.append(line)
    handler = "\n".join(lines[start:start + 80])
    assert "workflow_instance_id" in handler
    assert "is_workflow_instance_member" in handler
    assert 'check_user_permission(db, user, "contract", "read")' in handler
    assert "if not duoc_xem:" in handler
    assert "node_shortage_report" in handler
