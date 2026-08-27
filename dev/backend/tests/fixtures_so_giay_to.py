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

BANG_CAN_CO = (
    "contracts", "service_lines", "task_types", "service_packages",
    "dossier_document_slots", "dossier_documents", "dossier_document_links",
    "document_checklist_templates", "document_template_applicabilities",
    "document_slot_change_requests",
)


def thieu_bang(db) -> list[str]:
    try:
        if db.bind and db.bind.dialect.name == "sqlite":
            return list(BANG_CAN_CO)
        return [
            ten for ten in BANG_CAN_CO
            if not db.execute(text("select to_regclass(:t)"), {"t": f"public.{ten}"}).scalar()
        ]
    except Exception:
        return list(BANG_CAN_CO)


def _ma(tien_to: str) -> str:
    return f"{tien_to}-{uuid.uuid4().hex[:10]}"


def dung_boi_canh(db, *, so_hang_muc: int = 1, version: int = 2) -> dict:
    """Một hợp đồng + N Hạng mục, mỗi Hạng mục một Dạng hồ sơ riêng.

    Trả về dict gồm ``contract_id``, ``goi_id`` và danh sách ``hang_muc``
    (mỗi phần tử có ``id`` và ``task_type_id``).
    """
    goi = _ma("P")
    db.execute(text("insert into public.service_packages (id, name) values (:id, :ten)"),
               {"id": goi, "ten": "Gói thử nghiệm"})

    hd = _ma("HD")
    db.execute(text("insert into public.contracts (id) values (:id)"), {"id": hd})

    hang_muc = []
    for i in range(so_hang_muc):
        tt = _ma("T")
        db.execute(
            text("insert into public.task_types (id, name, service_package_id) "
                 "values (:id, :ten, :goi)"),
            {"id": tt, "ten": f"Thủ tục thử {i + 1}", "goi": goi},
        )
        sl = _ma("SL")
        db.execute(
            text("""
                insert into public.service_lines
                    (id, contract_id, task_type_id, service_package_id, document_register_version)
                values (:id, :hd, :tt, :goi, :ver)
            """),
            {"id": sl, "hd": hd, "tt": tt, "goi": goi, "ver": version},
        )
        hang_muc.append({"id": sl, "task_type_id": tt})

    return {"contract_id": hd, "goi_id": goi, "hang_muc": hang_muc}


def them_mau(db, *, ten: str, nguon: str = "KHACH_HANG", bat_buoc: bool = True,
             pham_vi: str = "GLOBAL", goi_id=None, task_type_id=None,
             is_default: bool = True) -> str:
    """Một loại giấy trong bộ mẫu, kèm phạm vi áp dụng."""
    tpl = _ma("TPL")
    db.execute(
        text("""
            insert into public.document_checklist_templates
                (id, name, source, is_required, needs_original, default_quantity, is_active)
            values (:id, :ten, :nguon, :bb, false, 1, true)
        """),
        {"id": tpl, "ten": ten, "nguon": nguon, "bb": bat_buoc},
    )
    db.execute(
        text("""
            insert into public.document_template_applicabilities
                (template_id, applicability_type, service_package_id, task_type_id, is_default)
            values (:tpl, :loai, :goi, :tt, :mac_dinh)
        """),
        {"tpl": tpl, "loai": pham_vi,
         "goi": goi_id if pham_vi == "PACKAGE" else None,
         "tt": task_type_id if pham_vi == "TASK_TYPE" else None,
         "mac_dinh": is_default},
    )
    return tpl


def them_o_giay(db, *, contract_id: str, service_line_id=None, ten: str,
                nguon: str = "KHACH_HANG", bat_buoc: bool = True) -> str:
    """Một ô giấy runtime. ``service_line_id`` None = ô cấp Hợp đồng (legacy)."""
    o = _ma("S")
    db.execute(
        text("""
            insert into public.dossier_document_slots
                (id, scope, contract_id, service_line_id, name, source,
                 is_required, needs_original, quantity, status, sort_order)
            values (:id, :scope, :hd, :sl, :ten, :nguon, :bb, false, 1, 'CHUA_CO', 100)
        """),
        {"id": o, "scope": "SERVICE_LINE" if service_line_id else "CONTRACT",
         "hd": contract_id, "sl": service_line_id, "ten": ten, "nguon": nguon, "bb": bat_buoc},
    )
    return o


def them_tep(db, *, contract_id: str, ten_tep: str = "giay.pdf") -> str:
    """Một tài liệu trong kho nguồn của hợp đồng — CHƯA gắn vào ô nào."""
    tep = _ma("D")
    db.execute(
        text("""
            insert into public.dossier_documents
                (id, contract_id, scope, stage, object_key, file_name,
                 content_type, size_bytes, doc_status)
            values (:id, :hd, 'CONTRACT', 'ho-so-goc', :khoa, :ten,
                    'application/pdf', 1024, 'DANG_DUNG')
        """),
        {"id": tep, "hd": contract_id, "khoa": f"thu-nghiem/{tep}", "ten": ten_tep},
    )
    return tep


def gan_tep_vao_o(db, *, contract_id: str, slot_id: str, document_id: str) -> None:
    db.execute(
        text("""
            insert into public.dossier_document_links
                (id, contract_id, slot_id, document_id, link_status)
            values (gen_random_uuid()::text, :hd, :o, :tep, 'DANG_DUNG')
        """),
        {"hd": contract_id, "o": slot_id, "tep": document_id},
    )


def nguoi_dung(db) -> str:
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


def them_buoc_k01(db, *, service_line_id: str, checklist=None) -> str:
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


def giao_viec(db, *, task_node_id: str, user_id: str) -> str:
    """Gán một nhân viên vào bước — `submit_task_node_for_acceptance` đòi có
    phân công trước khi xét tới cổng giấy tờ."""
    nv = db.execute(
        text("select id from public.employees where user_id = :u limit 1"),
        {"u": user_id},
    ).scalar()
    if not nv:
        nv = _ma("E")
        db.execute(
            text("insert into public.employees (id, user_id, full_name, is_active) "
                 "values (:id, :u, 'Nhân viên thử', true)"),
            {"id": nv, "u": user_id},
        )
    db.execute(
        text("""
            insert into public.task_node_assignments
                (task_node_id, employee_id, role_code, assignment_status)
            values (:n, :e, 'MAIN', 'accepted')
        """),
        {"n": task_node_id, "e": nv},
    )
    return nv


def them_nhiem_vu(db, *, task_node_id: str, ten: str, trang_thai: str) -> str:
    """Một mục checklist của bước, đặt thẳng trạng thái muốn kiểm."""
    rid = _ma("CR")
    db.execute(
        text("""
            insert into public.task_node_checklist_results
                (id, task_node_id, checklist_key, checklist_name, status, is_required)
            values (:id, :n, :k, :ten, :tt, true)
        """),
        {"id": rid, "n": task_node_id, "k": rid.lower(), "ten": ten, "tt": trang_thai},
    )
    return rid


def them_nhiem_vu_co_tai_lieu(db, *, task_node_id: str, ten: str, khoa: str,
                              trang_thai: str = "pending_approval") -> str:
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
            values (:id, :n, :k, :ten, :tt, true)
        """),
        {"id": rid, "n": task_node_id, "k": khoa, "ten": ten, "tt": trang_thai},
    )
    return rid
