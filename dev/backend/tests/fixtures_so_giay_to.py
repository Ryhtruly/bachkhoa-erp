"""Dựng dữ liệu cho kiểm thử sổ giấy tờ trên DB THẬT.

Vì sao tự dựng thay vì mượn dữ liệu sẵn có: mượn thì test phụ thuộc vào việc ai
đó đã bấm gì trên môi trường, chạy hôm nay xanh mai đỏ mà không ai hiểu vì sao.
Mỗi test tự dựng phần mình cần rồi rollback — chạy được trên DB trống, và không
để lại dấu vết.

DB test được dựng bằng ``dev/backend/scripts/dung_schema_test.py`` (dump schema
từ live, chỉ đọc, rồi chồng migration EXPAND). Không có script đó thì mọi test
dưới đây sẽ tự SKIP có nêu lý do, chứ không báo xanh giả.
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


def _ma(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def build_test_context(db, *, item_count: int = 1, version: int = 2) -> dict:
    """Một hợp đồng + N Hạng mục, mỗi Hạng mục một Dạng hồ sơ riêng.

    Trả về dict gồm ``contract_id``, ``goi_id`` và danh sách ``hang_muc``
    (mỗi phần tử có ``id`` và ``task_type_id``).
    """
    package_id = _ma("P")
    db.execute(text("insert into public.service_packages (id, name) values (:id, :name)"),
               {"id": package_id, "name": "Gói thử nghiệm"})

    contract_id = _ma("HD")
    db.execute(text("insert into public.contracts (id) values (:id)"), {"id": contract_id})

    service_lines = []
    for i in range(item_count):
        task_type_id = _ma("T")
        db.execute(
            text("insert into public.task_types (id, name, service_package_id) "
                 "values (:id, :name, :package_id)"),
            {"id": task_type_id, "name": f"Thủ tục thử {i + 1}", "package_id": package_id},
        )
        service_line_id = _ma("SL")
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

    return {"contract_id": contract_id, "goi_id": package_id, "hang_muc": service_lines}


def insert_template(db, *, name: str, source: str = "KHACH_HANG", required: bool = True,
             scope: str = "GLOBAL", package_id=None, task_type_id=None,
             is_default: bool = True) -> str:
    """Một loại giấy trong bộ mẫu, kèm phạm vi áp dụng."""
    tpl = _ma("TPL")
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
    """Một ô giấy runtime. ``service_line_id`` None = ô cấp Hợp đồng (legacy)."""
    slot_id = _ma("S")
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
    """Một tài liệu trong kho nguồn của hợp đồng — CHƯA gắn vào ô nào."""
    document_id = _ma("D")
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
    """Một user có sẵn — phiếu miễn có FK tới users."""
    uid = db.execute(text("select id from public.users limit 1")).scalar()
    if uid:
        return uid
    uid = _ma("U")
    db.execute(
        text("insert into public.users (id, username, password_hash, is_active) "
             "values (:id, :u, 'x', true)"),
        {"id": uid, "u": f"thu-nghiem-{uid[:8]}"},
    )
    return uid


def insert_k01_node(db, *, service_line_id: str, checklist=None) -> str:
    """Một workflow_instance + task_node K01 tối thiểu.

    Cần cho các test chốt phiếu miễn theo quyết định nghiệm thu: helper đi từ
    task_node → workflow_instance → service_line, nên không có chuỗi này thì
    không kiểm được gì.
    """
    wi = _ma("WI")
    db.execute(
        text("insert into public.workflow_instances (id, service_line_id, status) "
             "values (:id, :sl, 'running')"),
        {"id": wi, "sl": service_line_id},
    )
    # task_nodes.defined_by_revision_id là NOT NULL, nên phải có revision thật.
    rev = _ma("REV")
    db.execute(
        # graph phải có khoá 'nodes' — review_task_node_acceptance đọc
        # graph["nodes"][node_key] để lấy transitions.
        text("insert into public.workflow_instance_revisions"
             " (id, workflow_instance_id, revision_no, graph)"
             " values (:id, :wi, 1, cast(:g as jsonb))"),
        {"id": rev, "wi": wi,
         "g": json.dumps({"nodes": {"k01": {"checklist": checklist or []}}})},
    )
    # task_nodes.node_code có FK sang danh mục workflow_nodes. DB test dựng từ
    # schema thuần nên danh mục rỗng — thêm đúng dòng K01 nếu chưa có.
    db.execute(
        text("insert into public.workflow_nodes (code, name) values ('K01', 'Tiếp nhận')"
             " on conflict (code) do nothing"),
    )
    node = _ma("TN")
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
    """Gán một nhân viên vào bước — `submit_task_node_for_acceptance` đòi có
    phân công trước khi xét tới cổng giấy tờ."""
    employee_id = db.execute(
        text("select id from public.employees where user_id = :u limit 1"),
        {"u": user_id},
    ).scalar()
    if not employee_id:
        employee_id = _ma("E")
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
    """Một mục checklist của bước, đặt thẳng trạng thái muốn kiểm."""
    rid = _ma("CR")
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
    """Mục checklist khớp với khoá đã khai trong graph.

    ``_NODE_OUTPUT_STATE_QUERY`` nối graph với runtime bằng
    ``item->>'key' = r.checklist_key`` — sai khoá là truy vấn trả rỗng và test
    xanh giả.
    """
    rid = _ma("CR")
    db.execute(
        text("""
            insert into public.task_node_checklist_results
                (id, task_node_id, checklist_key, checklist_name, status, is_required)
            values (:id, :node_id, :checklist_key, :name, :status, true)
        """),
        {"id": rid, "node_id": task_node_id, "checklist_key": checklist_key, "name": name, "status": status},
    )
    return rid
