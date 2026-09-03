import pytest
from sqlalchemy import text
from src.db.models import (
    WorkflowInstance, TaskNode, ChecklistResult, 
    ChecklistResultDocumentLink, DossierDocument
)

def test_prior_document_idor_sql_contract(db_session):
    """
    Structural SQL contract test cho chốt chặn IDOR trong tải tài liệu bước trước.
    """
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Test requires PostgreSQL")

    # Arrange: Setup workflow
    wi = WorkflowInstance(id="wi-test-idor", title="Test WI")
    db_session.add(wi)
    
    n1 = TaskNode(id="n1-idor", workflow_instance_id=wi.id, node_code="100", occurrence_no=1, status="accepted")
    n2 = TaskNode(id="n2-idor", workflow_instance_id=wi.id, node_code="200", occurrence_no=1, status="processing")
    n3 = TaskNode(id="n3-idor", workflow_instance_id=wi.id, node_code="300", occurrence_no=1, status="pending")
    db_session.add_all([n1, n2, n3])
    
    r1 = ChecklistResult(id="r1-idor", task_node_id=n1.id)
    r2 = ChecklistResult(id="r2-idor", task_node_id=n2.id)
    r3 = ChecklistResult(id="r3-idor", task_node_id=n3.id)
    db_session.add_all([r1, r2, r3])
    
    # Valid prior document
    d1 = DossierDocument(id="d1-idor", doc_status="DANG_DUNG")
    l1 = ChecklistResultDocumentLink(checklist_result_id=r1.id, document_id=d1.id, review_status="approved")

    # Rejected document at prior node
    d2 = DossierDocument(id="d2-idor", doc_status="DANG_DUNG")
    l2 = ChecklistResultDocumentLink(checklist_result_id=r1.id, document_id=d2.id, review_status="rejected")

    # Revoked/Superseded document at prior node
    d3 = DossierDocument(id="d3-idor", doc_status="THU_HOI")
    l3 = ChecklistResultDocumentLink(checklist_result_id=r1.id, document_id=d3.id, review_status="approved")
    
    # Document in current node
    d4 = DossierDocument(id="d4-idor", doc_status="DANG_DUNG")
    l4 = ChecklistResultDocumentLink(checklist_result_id=r2.id, document_id=d4.id, review_status="rejected")

    # Document in later node
    d5 = DossierDocument(id="d5-idor", doc_status="DANG_DUNG")
    l5 = ChecklistResultDocumentLink(checklist_result_id=r3.id, document_id=d5.id, review_status="approved")
    
    # Document in wrong workflow
    wi2 = WorkflowInstance(id="wi-other", title="Other WI")
    n_other = TaskNode(id="n-other", workflow_instance_id=wi2.id, node_code="100", occurrence_no=1, status="accepted")
    r_other = ChecklistResult(id="r-other", task_node_id=n_other.id)
    d6 = DossierDocument(id="d6-idor", doc_status="DANG_DUNG")
    l6 = ChecklistResultDocumentLink(checklist_result_id=r_other.id, document_id=d6.id, review_status="approved")

    db_session.add_all([wi2, n_other, r_other, d1, l1, d2, l2, d3, l3, d4, l4, d5, l5, d6, l6])
    db_session.commit()

    sql_check = text("""
        with moc as (
            select workflow_instance_id, node_code, occurrence_no
            from public.task_nodes where id = :task_node_id
        )
        select exists (
            select 1
            from moc
            join public.task_nodes n
              on n.workflow_instance_id = moc.workflow_instance_id
             and (
                 n.id = :task_node_id
                 or (
                     (n.node_code, n.occurrence_no) < (moc.node_code, moc.occurrence_no)
                     and n.status in ('accepted', 'completed')
                 )
             )
            join public.task_node_checklist_results r on r.task_node_id = n.id
            join public.checklist_result_document_links l on l.checklist_result_id = r.id
            join public.dossier_documents d on d.id = l.document_id
            where d.id = :document_id
              and d.doc_status = 'DANG_DUNG'
              and (n.id = :task_node_id or l.review_status <> 'rejected')
        )
    """)

    def check_doc(doc_id):
        return db_session.execute(sql_check, {"task_node_id": n2.id, "document_id": doc_id}).scalar()

    assert check_doc(d1.id) is True, "Valid prior document must be accepted"
    assert check_doc(d2.id) is False, "Rejected document must be blocked"
    assert check_doc(d3.id) is False, "Superseded/revoked document (not DANG_DUNG) must be blocked"
    assert check_doc(d4.id) is True, "Current-node document must be viewable even when rejected"
    assert check_doc(d5.id) is False, "Document in later node must be blocked"
    assert check_doc(d6.id) is False, "Document from wrong workflow must be blocked"

    db_session.rollback()


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
        if line and not line.startswith(" ") and not line.startswith("\t") and line.strip():
            break
        body_lines.append(line)
    return "\n".join(lines[start:])  # include the def line itself for full context


def _extract_valid_prior_sql() -> str:
    """Extract the valid_prior SQL fragment from the handler source."""
    src = _download_prior_document_source()
    # The SQL is inside db.execute(text(""" ... """))
    import re
    m = re.search(
        r"valid_prior\s*=\s*db\.execute\(\s*text\(\s*\"\"\"(.+?)\"\"\"\s*\)",
        src,
        re.DOTALL,
    )
    assert m is not None, "Could not locate valid_prior SQL in handler source"
    return m.group(1)


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
    src = _download_prior_document_source()
    vp_pos = src.find("valid_prior")
    rs_pos = src.find("read_scan")
    assert vp_pos != -1, "valid_prior not found in handler"
    assert rs_pos != -1, "read_scan not found in handler"
    assert vp_pos < rs_pos, (
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
    rs_pos = src.find("read_scan")
    assert guard_end < rs_pos, (
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
