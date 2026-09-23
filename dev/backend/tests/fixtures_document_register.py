"""Test fixtures for document register and live database verification.

Provides clean fixtures and helpers for testing document slots, templates,
and checklist output documents with rollback-safe isolation.
"""
import json
import uuid

from sqlalchemy import text

REQUIRED_TABLES = (
    "contracts", "service_lines", "task_types", "service_packages",
    "dossier_document_slots", "dossier_documents", "dossier_document_links",
    "document_checklist_templates", "document_template_applicabilities",
    "document_slot_change_requests",
)


def get_missing_documents(db) -> list[str]:
    try:
        if db.bind and db.bind.dialect.name == "sqlite":
            return list(REQUIRED_TABLES)
        return [
            table_name for table_name in REQUIRED_TABLES
            if not db.execute(text("select to_regclass(:table_name)"), {"table_name": f"public.{table_name}"}).scalar()
        ]
    except Exception:
        return list(REQUIRED_TABLES)


def generate_test_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


# Backward compatibility alias
_ma = generate_test_id


def build_test_context(db, *, item_count: int = 1, version: int = 2) -> dict:
    """Create test contract with N service lines and distinct task types.

    Returns dict with contract_id, package_id, and service_lines (as well as legacy
    aliases goi_id and hang_muc).
    """
    package_id = generate_test_id("P")
    db.execute(text("insert into public.service_packages (id, name) values (:id, :name)"),
               {"id": package_id, "name": f"Gói thử nghiệm {package_id}"})

    contract_id = generate_test_id("HD")
    db.execute(text("insert into public.contracts (id, completion_override) values (:id, false)"), {"id": contract_id})

    service_lines = []
    for i in range(item_count):
        task_type_id = generate_test_id("T")
        db.execute(
            text("insert into public.task_types (id, name, service_package_id) "
                 "values (:id, :name, :package_id)"),
            {"id": task_type_id, "name": f"Thủ tục thử {task_type_id}", "package_id": package_id},
        )
        service_line_id = generate_test_id("SL")
        db.execute(
            text("""
                insert into public.service_lines
                    (id, contract_id, task_type_id, service_package_id, document_register_version)
                values (:id, :contract_id, :task_type_id, :package_id, :version)
            """),
            {
                "id": service_line_id,
                "contract_id": contract_id,
                "task_type_id": task_type_id,
                "package_id": package_id,
                "version": version,
            },
        )
        service_lines.append({"id": service_line_id, "task_type_id": task_type_id})

    return {
        "contract_id": contract_id,
        "package_id": package_id,
        "service_lines": service_lines,
        # Legacy compatibility
        "goi_id": package_id,
        "hang_muc": service_lines,
    }


def insert_template(db, *, name: str, source: str = "KHACH_HANG", required: bool = True,
                    scope: str = "GLOBAL", package_id=None, task_type_id=None,
                    is_default: bool = True) -> str:
    """Insert a template in catalog with its applicability scope."""
    tpl = generate_test_id("TPL")
    db.execute(
        text("""
            insert into public.document_checklist_templates
                (id, name, source, is_required, needs_original, default_quantity, is_active)
            values (:id, :name, :source, :required, false, 1, true)
        """),
        {"id": tpl, "name": name, "source": source, "required": required},
    )
    db.execute(
        text("""
            insert into public.document_template_applicabilities
                (template_id, applicability_type, service_package_id, task_type_id, is_default)
            values (:template_id, :scope, :package_id, :task_type_id, :is_default)
        """),
        {
            "template_id": tpl,
            "scope": scope,
            "package_id": package_id if scope == "PACKAGE" else None,
            "task_type_id": task_type_id if scope == "TASK_TYPE" else None,
            "is_default": is_default,
        },
    )
    return tpl


def insert_document_slot(db, *, contract_id: str, service_line_id=None, name: str,
                         source: str = "KHACH_HANG", required: bool = True) -> str:
    """Insert a runtime document slot."""
    slot_id = generate_test_id("S")
    db.execute(
        text("""
            insert into public.dossier_document_slots
                (id, scope, contract_id, service_line_id, name, source,
                 is_required, needs_original, quantity, status, sort_order)
            values (:id, :scope, :contract_id, :service_line_id, :name, :source, :required, false, 1, 'CHUA_CO', 100)
        """),
        {
            "id": slot_id,
            "scope": "SERVICE_LINE" if service_line_id else "CONTRACT",
            "contract_id": contract_id,
            "service_line_id": service_line_id,
            "name": name,
            "source": source,
            "required": required,
        },
    )
    return slot_id


def insert_document(db, *, contract_id: str, file_name: str = "giay.pdf") -> str:
    """Insert a source document in contract vault (unlinked)."""
    document_id = generate_test_id("D")
    db.execute(
        text("""
            insert into public.dossier_documents
                (id, contract_id, scope, stage, object_key, file_name,
                 content_type, size_bytes, doc_status)
            values (:id, :contract_id, 'CONTRACT', 'ho-so-goc', :object_key, :file_name,
                    'application/pdf', 1024, 'DANG_DUNG')
        """),
        {
            "id": document_id,
            "contract_id": contract_id,
            "object_key": f"thu-nghiem/{document_id}",
            "file_name": file_name,
        },
    )
    return document_id


def link_document_to_slot(db, *, contract_id: str, slot_id: str, document_id: str) -> None:
    db.execute(
        text("""
            insert into public.dossier_document_links
                (id, contract_id, slot_id, document_id, link_status)
            values (gen_random_uuid()::text, :contract_id, :slot_id, :document_id, 'DANG_DUNG')
        """),
        {"contract_id": contract_id, "slot_id": slot_id, "document_id": document_id},
    )


def create_test_user(db) -> str:
    """Create a unique test user for FK references."""
    uid = generate_test_id("U")
    db.execute(
        text("insert into public.users (id, username, password_hash, is_active) "
             "values (:id, :u, 'x', true)"),
        {"id": uid, "u": f"thu-nghiem-{uid}"},
    )
    return uid


def insert_k01_node(db, *, service_line_id: str, checklist=None) -> str:
    """Insert minimal workflow_instance + task_node K01."""
    wi = generate_test_id("WI")
    db.execute(
        text("insert into public.workflow_instances (id, service_line_id, status) "
             "values (:id, :sl, 'running')"),
        {"id": wi, "sl": service_line_id},
    )
    rev = generate_test_id("REV")
    db.execute(
        text("insert into public.workflow_instance_revisions"
             " (id, workflow_instance_id, revision_no, graph)"
             " values (:id, :wi, 1, cast(:g as jsonb))"),
        {"id": rev, "wi": wi,
         "g": json.dumps({"nodes": {"k01": {"checklist": checklist or []}}})},
    )
    db.execute(
        text("insert into public.workflow_nodes (code, name) values ('K01', 'Tiếp nhận')"
             " on conflict (code) do nothing"),
    )
    node = generate_test_id("TN")
    db.execute(
        text("""
            insert into public.task_nodes
                (id, workflow_instance_id, defined_by_revision_id, node_key, node_code, status)
            values (:id, :wi, :rev, 'k01', 'K01', 'submitted')
        """),
        {"id": node, "wi": wi, "rev": rev},
    )
    return node


def assign_node(db, *, task_node_id: str, user_id: str) -> str:
    """Assign an employee to a task node."""
    employee_id = db.execute(
        text("select id from public.employees where user_id = :u limit 1"),
        {"u": user_id},
    ).scalar()
    if not employee_id:
        employee_id = generate_test_id("E")
        db.execute(
            text("insert into public.employees (id, user_id, full_name, is_active) "
                 "values (:id, :user_id, 'Nhân viên thử', true)"),
            {"id": employee_id, "user_id": user_id},
        )
    db.execute(
        text("""
            insert into public.task_node_assignments
                (task_node_id, employee_id, role_code, assignment_status)
            values (:n, :e, 'MAIN', 'accepted')
        """),
        {"n": task_node_id, "e": employee_id},
    )
    return employee_id


def insert_checklist_item(db, *, task_node_id: str, name: str, status: str) -> str:
    """Insert a checklist item with arbitrary status."""
    rid = generate_test_id("CR")
    db.execute(
        text("""
            insert into public.task_node_checklist_results
                (id, task_node_id, checklist_key, checklist_name, status, is_required)
            values (:id, :node_id, :checklist_key, :name, :status, true)
        """),
        {"id": rid, "node_id": task_node_id, "checklist_key": rid.lower(), "name": name, "status": status},
    )
    return rid


def insert_checklist_item_with_document(db, *, task_node_id: str, name: str, checklist_key: str,
                                         status: str = "pending_approval") -> str:
    """Insert a checklist item matching the graph node key."""
    rid = generate_test_id("CR")
    db.execute(
        text("""
            insert into public.task_node_checklist_results
                (id, task_node_id, checklist_key, checklist_name, status, is_required)
            values (:id, :node_id, :checklist_key, :name, :status, true)
        """),
        {"id": rid, "node_id": task_node_id, "checklist_key": checklist_key, "name": name, "status": status},
    )
    return rid
