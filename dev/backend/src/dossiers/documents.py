"""Kho giấy tờ của Hồ sơ pháp lý — xếp theo giai đoạn của chuỗi K.

Nghiệp vụ: từ K04 trở đi, mỗi bước sinh ra một bộ giấy tờ khác nhau và nhân viên
phải scan lưu lại. Bước soạn hồ sơ lưu bộ hồ sơ đã soạn; bước nộp cơ quan lưu
biên nhận và giấy hẹn; bước nhận kết quả lưu sổ và biên bản bàn giao. Trộn chung
một chỗ thì đến lúc tra cứu không ai biết tờ nào thuộc lần nộp nào.
"""

import io
import json
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.files.references import (
    DOSSIER_STAGES, STAGE_BY_NODE_CODE, STAGE_BY_UPPER_NODE_CODE, DossierFileReference,
)
from src.services.storage_service import ensure_bucket, get_file, upload_file

MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

# Giấy tờ nhà đất trong thực tế: bản scan (pdf/ảnh) và bản soạn (word/excel).
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "binary/octet-stream",
    "image/jpg",
}
ALLOWED_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic",
    ".doc", ".docx", ".xls", ".xlsx",
}

STAGE_LABELS = {
    "ho-so-goc": "Khách hàng cung cấp",
    "do-hien-truong": "Đo tại hiện trường",
    "chuan-hoa-ky-thuat": "Sau khi chuẩn hoá kỹ thuật",
    "soan-ho-so": "Sau khi soạn hồ sơ",
    "nop-co-quan": "Khi nộp cơ quan",
    "ket-qua": "Khi nhận kết quả",
}

STAGE_NODE_LABELS = {
    "ho-so-goc": "Sổ gốc hợp đồng",
    "do-hien-truong": "K02 · Khảo sát & đo hiện trường",
    "chuan-hoa-ky-thuat": "K03 · Chuẩn hoá tài liệu kỹ thuật",
    "soan-ho-so": "K04 · Soạn bộ hồ sơ pháp lý",
    "nop-co-quan": "K05 · Nộp & theo dõi hồ sơ",
    "ket-qua": "K06 · Nhận kết quả & bàn giao",
}

# Bước nào mở những trường nào trong tab Hồ sơ pháp lý. Đây là điều kiện kích
# hoạt mà nghiệp vụ yêu cầu: đang ở K04 thì chỉ điền được thứ có sau khi soạn,
# chưa nộp cơ quan thì chưa thể có số biên nhận hay ngày hẹn trả.
STAGE_FIELDS = {
    # Đo vẽ: chỉ khi chuẩn hoá tài liệu kỹ thuật xong mới có bản vẽ để nạp vào
    # hồ sơ. Trước đó chỉ có số liệu đo thô, chưa phải tài liệu bàn giao được.
    # K02 chỉ sinh tài liệu thô, chưa mở trường nào của tab Hồ sơ pháp lý.
    "do-hien-truong": (),
    "chuan-hoa-ky-thuat": ("dossier_file_url", "note"),
    "soan-ho-so": ("dossier_file_url", "case_description", "contact_phone", "note"),
    "nop-co-quan": (
        "receipt_code", "submitted_agency", "received_date",
        "expected_return_date", "receipt_photo_url", "note",
    ),
    "ket-qua": ("payment_status", "legacy_gov_status", "note"),
}


def stage_for_node_code(node_code: str | None) -> str | None:
    return STAGE_BY_UPPER_NODE_CODE.get(str(node_code or "").strip().upper())


def _validate_upload(file_name: str, content_type: str | None, data: bytes) -> None:
    if not data:
        raise HTTPException(status_code=400, detail="Tệp rỗng.")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Tệp vượt quá {MAX_DOCUMENT_BYTES // (1024 * 1024)}MB.",
        )
    suffix = ("." + file_name.rsplit(".", 1)[-1].lower()) if "." in file_name else ""
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Chỉ nhận PDF, ảnh (jpg/png/webp/heic) hoặc Word/Excel.",
        )
    # Content-type do trình duyệt khai nên chỉ dùng để chặn thêm, không tin tuyệt
    # đối; phần đuôi tệp ở trên mới là hàng rào chính.
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Định dạng {content_type} không được phép.")


def _dossier_or_404(db: Session, dossier_id: str) -> dict:
    row = db.execute(
        text("""
            select d.id, d.service_line_id, d.contract_id, d.dossier_name, d.status
            from public.legal_dossiers d
            where d.id = :id
        """),
        {"id": dossier_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ pháp lý.")
    return dict(row)


def active_stage(db: Session, service_line_id: str) -> dict[str, Any]:
    """Giai đoạn đang mở của hạng mục, suy từ bước đang chạy trong chuỗi.

    Không có bước pháp lý nào đang chạy thì không mở trường nào cho sửa — hồ sơ
    chỉ ở chế độ đọc, tránh việc sửa số biên nhận của một hồ sơ đã đóng.
    """
    row = db.execute(
        text("""
            select n.id, n.node_code, n.status
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            where wi.service_line_id = :service_line_id
              and n.node_code = any(:codes)
              and n.status in ('ready', 'in_progress', 'rework_required')
            order by n.node_code
            limit 1
        """),
        {"service_line_id": service_line_id, "codes": list(STAGE_BY_NODE_CODE.keys())},
    ).mappings().first()
    if not row:
        return {"stage": None, "task_node_id": None, "node_code": None, "editable_fields": []}
    stage = stage_for_node_code(row["node_code"])
    return {
        "stage": stage,
        "task_node_id": row["id"],
        "node_code": row["node_code"],
        "editable_fields": list(STAGE_FIELDS.get(stage, ())),
    }


def list_documents(db: Session, dossier_id: str) -> dict[str, Any]:
    dossier = _dossier_or_404(db, dossier_id)
    # Đọc theo HẠNG MỤC qua ô giấy, không theo cột dossier_id.
    #
    # dossier_id chỉ chứa được MỘT giá trị. Một tờ giấy dùng chung cho hai Hạng
    # mục pháp lý thì gán cột đó là lần gán sau đá tài liệu ra khỏi hồ sơ trước —
    # im lặng, không ai thấy. Quan hệ nhiều-nhiều phải đọc bằng bảng nối.
    #
    # Tệp của đề xuất chưa duyệt không có link DANG_DUNG nào nên tự nó không lọt
    # vào đây; không chỗ nào phải nhớ lọc.
    rows = db.execute(
        text("""
            with ho_so as (
                select id, service_line_id from public.legal_dossiers where id = :dossier_id
            ),
            tai_lieu as (
                select l.document_id as id
                from ho_so h
                join public.dossier_document_slots s on s.service_line_id = h.service_line_id
                join public.dossier_document_links l
                  on l.slot_id = s.id and l.link_status = 'DANG_DUNG'
                union   -- UNION, không ALL: một tệp nối nhiều ô vẫn là một dòng
                select d.id
                from public.dossier_documents d, ho_so h
                where d.dossier_id = h.id
            )
            select distinct d.id, d.stage, d.slot_key, d.task_node_id, d.object_key,
                   d.file_name, d.content_type, d.size_bytes, d.note,
                   d.uploaded_at, u.username as uploaded_by_name
            from tai_lieu t
            join public.dossier_documents d on d.id = t.id
            left join public.users u on u.id = d.uploaded_by
            where d.doc_status = 'DANG_DUNG'
            order by d.uploaded_at desc
        """),
        {"dossier_id": dossier_id},
    ).mappings().all()

    by_stage: dict[str, list[dict]] = {stage: [] for stage in DOSSIER_STAGES}
    for row in rows:
        by_stage.setdefault(row["stage"], []).append({
            "id": row["id"],
            "stage": row["stage"],
            "slot_key": row["slot_key"],
            "file_name": row["file_name"],
            "content_type": row["content_type"],
            "size_bytes": int(row["size_bytes"] or 0),
            "note": row["note"],
            "uploaded_at": row["uploaded_at"].isoformat() if row["uploaded_at"] else None,
            "uploaded_by_name": row["uploaded_by_name"],
        })

    current = active_stage(db, dossier["service_line_id"])
    return {
        "dossier_id": dossier_id,
        "dossier_name": dossier["dossier_name"],
        "contract_id": dossier["contract_id"],
        "service_line_id": dossier["service_line_id"],
        "folders": [
            {
                "stage": stage,
                "label": STAGE_LABELS[stage],
                "node_label": STAGE_NODE_LABELS[stage],
                "is_active": current["stage"] == stage,
                "documents": by_stage.get(stage, []),
            }
            for stage in DOSSIER_STAGES
        ],
        "active": current,
        "total": len(rows),
    }


def create_document(
    db: Session,
    dossier_id: str,
    *,
    stage: str,
    file_name: str,
    content_type: str | None,
    data: bytes,
    actor_id: str,
    slot_key: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """Nhận một tệp scan vào đúng ngăn giai đoạn của hồ sơ."""
    if stage not in DOSSIER_STAGES:
        raise HTTPException(status_code=400, detail="Giai đoạn hồ sơ không hợp lệ.")
    _validate_upload(file_name, content_type, data)
    dossier = _dossier_or_404(db, dossier_id)

    current = active_stage(db, dossier["service_line_id"])
    if current["stage"] != stage:
        # Chặn ở máy chủ chứ không chỉ ẩn nút: nộp biên nhận khi chưa đi nộp là
        # sai trình tự hồ sơ, và sau này không ai truy được vì sao có tờ đó.
        mo = STAGE_NODE_LABELS.get(current["stage"]) if current["stage"] else None
        raise HTTPException(
            status_code=409,
            detail=(
                f"Hạng mục đang ở {mo}, chưa mở ngăn “{STAGE_LABELS[stage]}”."
                if mo else
                "Hạng mục không có bước pháp lý nào đang chạy nên chưa nhận thêm giấy tờ."
            ),
        )

    # Sinh id trước để đặt khoá lưu trữ: khoá gắn với document_id nên tệp nằm yên
    # một chỗ dù sau này đổi giai đoạn hay đổi phân loại bao nhiêu lần.
    document_id = uuid.uuid4().hex
    reference = DossierFileReference.build(
        contract_id=dossier["contract_id"],
        document_id=document_id,
        filename=file_name,
    )
    ensure_bucket()
    upload_file(io.BytesIO(data), reference.object_key)

    try:
        db.execute(
            text("""
                insert into public.dossier_documents
                    (id, dossier_id, service_line_id, contract_id, stage, slot_key,
                     task_node_id, object_key, file_name, content_type, size_bytes,
                     note, uploaded_by)
                values (:id, :dossier_id, :service_line_id, :contract_id, :stage, :slot_key,
                        :task_node_id, :object_key, :file_name, :content_type, :size_bytes,
                        :note, :uploaded_by)
            """),
            {
                "id": document_id,
                "dossier_id": dossier_id,
                "service_line_id": dossier["service_line_id"],
                "contract_id": dossier["contract_id"],
                "stage": stage,
                "slot_key": (slot_key or "").strip() or None,
                "task_node_id": current["task_node_id"],
                "object_key": reference.object_key,
                "file_name": file_name,
                "content_type": content_type,
                "size_bytes": len(data),
                "note": (note or "").strip() or None,
                "uploaded_by": actor_id,
            },
        )
        db.execute(
            text("""
                insert into public.legal_dossier_events
                    (dossier_id, from_status, to_status, note, actor_user_id)
                values (:d, null, null, :n, :a)
            """),
            {
                "d": dossier_id,
                "n": f"Lưu giấy tờ [{STAGE_LABELS[stage]}]: {file_name}",
                "a": actor_id,
            },
        )
    except Exception:
        # Object storage là append-only theo luật tài liệu: không xoá object để
        # chữa một transaction DB lỗi. Việc dọn trạng thái phải đi qua DB/audit,
        # còn object vẫn giữ nguyên để không mất dấu scan đã nhận.
        raise

    return {
        "id": document_id,
        "stage": stage,
        "file_name": file_name,
        "size_bytes": len(data),
    }


def read_document(db: Session, document_id: str) -> tuple[dict, bytes]:
    row = db.execute(
        text("""
            select id, object_key, file_name, content_type
            from public.dossier_documents where id = :id
        """),
        {"id": document_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp.")
    return dict(row), get_file(row["object_key"])["Body"].read()


def delete_document(db: Session, document_id: str, *, actor_id: str) -> dict[str, Any]:
    row = db.execute(
        text("""
            select id, dossier_id, object_key, file_name, stage, doc_status
            from public.dossier_documents where id = :id
        """),
        {"id": document_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp.")
    if row["doc_status"] == "DA_GO":
        raise HTTPException(status_code=404, detail="Tệp đã được gỡ khỏi hồ sơ.")

    db.execute(
        text("""
            update public.dossier_documents
            set doc_status = 'DA_GO'
            where id = :id and doc_status <> 'DA_GO'
        """),
        {"id": document_id},
    )
    db.execute(
        text("""
            update public.dossier_document_links
            set link_status = 'DA_GO', unlinked_by = :actor, unlinked_at = now()
            where document_id = :id and link_status = 'DANG_DUNG'
        """),
        {"id": document_id, "actor": actor_id},
    )
    db.execute(
        text("""
            insert into public.legal_dossier_events
                (dossier_id, from_status, to_status, note, actor_user_id)
            values (:d, null, null, :n, :a)
        """),
        {
            "d": row["dossier_id"],
            "n": f"Gỡ giấy tờ [{STAGE_LABELS.get(row['stage'], row['stage'])}]: {row['file_name']}",
            "a": actor_id,
        },
    )
    # Không bao giờ xoá object: đây chỉ là một chuyển trạng thái DB có audit.
    return {"id": document_id, "deleted": True, "doc_status": "DA_GO"}


# ── Tài liệu đầu ra theo Checklist ───────────────────────────────────────────
#
# Giám đốc cấu hình ở từng checklist: "bước này phải nộp Bản kỹ thuật gốc". Cấu
# hình nằm trong graph theo template_id — graph dùng chung cho mọi Hạng mục nên
# không thể nhúng slot_id của một Hạng mục cụ thể vào đó.
#
# Chỉ checklist CÓ khai output_documents mới đi qua các hàm dưới đây. Checklist
# minh chứng thông thường (ảnh gọi khách, ảnh chấm công) giữ nguyên đường cũ và
# không sinh dòng dossier_documents nào.

_OUTPUT_SLOT_QUERY = text("""
    select s.id, s.scope, s.name
    from public.dossier_document_slots s
    where s.template_id = :template_id
      and s.contract_id = :contract_id
      and (
        (:service_line_id is not null and s.scope = 'SERVICE_LINE'
           and s.service_line_id = :service_line_id)
        or s.scope = 'CONTRACT'
      )
""")


def resolve_output_slot(
    db: Session, *, template_id: str, service_line_id: str | None, contract_id: str
) -> dict[str, Any]:
    """Phân giải template_id của graph thành ô giấy THẬT của Hạng mục.

    Ưu tiên ô riêng của Hạng mục, không có mới lấy ô dùng chung của Hợp đồng.
    Hai trường hợp đều phải kêu chứ không được đoán:

    - Không tìm thấy ô nào: quy trình đòi một loại giấy mà sổ của Hạng mục không
      có chỗ để đựng. Im lặng bỏ qua thì checklist tưởng đã đủ trong khi hồ sơ
      trống.
    - Tìm thấy nhiều ô cùng mức ưu tiên: ``limit 1`` ở đây là chọn ngẫu nhiên một
      trong hai, và lần chạy sau có thể ra ô khác.
    """
    rows = db.execute(
        _OUTPUT_SLOT_QUERY,
        {
            "template_id": template_id,
            "contract_id": contract_id,
            "service_line_id": service_line_id,
        },
    ).mappings().all()

    for scope in ("SERVICE_LINE", "CONTRACT"):
        cung_muc = [row for row in rows if row["scope"] == scope]
        if not cung_muc:
            continue
        if len(cung_muc) > 1:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Sổ giấy tờ đang có {len(cung_muc)} ô giấy cùng loại "
                    f"“{cung_muc[0]['name']}”. Gộp lại rồi hãy nộp tài liệu."
                ),
            )
        return dict(cung_muc[0])

    raise HTTPException(
        status_code=409,
        detail=(
            "Hạng mục này chưa có ô giấy cho loại tài liệu quy trình yêu cầu. "
            "Báo Giám đốc bổ sung vào sổ giấy tờ hoặc sửa cấu hình bước."
        ),
    )


_CHECKLIST_OUTPUT_CONFIG_QUERY = text("""
    select coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->'checklist' as checklist,
           r.checklist_key,
           n.id as task_node_id,
           wi.service_line_id,
           sl.contract_id
    from public.task_node_checklist_results r
    join public.task_nodes n on n.id = r.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    where r.id = :checklist_result_id
""")


_CHECKLIST_OUTPUT_COUNT_QUERY = text("""
    with hang_muc as (
        -- Hạng mục suy từ chính mục checklist. KHÔNG nhận từ client, và KHÔNG
        -- lấy theo hợp đồng: một hợp đồng có nhiều Hạng mục dùng chung template,
        -- đếm theo hợp đồng là checklist của Hạng mục A đủ điều kiện nhờ tệp
        -- người khác nộp ở Hạng mục B.
        select wi.service_line_id
        from public.task_node_checklist_results r
        join public.task_nodes n on n.id = r.task_node_id
        join public.workflow_instances wi on wi.id = n.workflow_instance_id
        where r.id = :checklist_result_id
    ),
    tai_lieu as (
        -- Đường CHÍNH: qua bảng nối tài liệu ↔ ô giấy. Một tệp phục vụ nhiều ô
        -- nên không đọc được bằng cột dossier_documents.slot_id.
        select l.document_id, dl.slot_id
        from public.checklist_result_document_links l
        join public.dossier_documents d on d.id = l.document_id
        join public.dossier_document_links dl
          on dl.document_id = d.id and dl.link_status = 'DANG_DUNG'
        join public.dossier_document_slots s on s.id = dl.slot_id
        cross join hang_muc hm
        where l.checklist_result_id = :checklist_result_id
          and d.doc_status = 'DANG_DUNG'
          and s.scope = 'SERVICE_LINE'
          and s.service_line_id = hm.service_line_id

        union   -- UNION (không ALL): tự khử trùng cặp (document_id, slot_id)

        -- Đường CŨ: cột slot_id, giữ để dữ liệu trước Nhóm A vẫn đếm được —
        -- nhưng cũng phải đúng Hạng mục.
        select l.document_id, d.slot_id
        from public.checklist_result_document_links l
        join public.dossier_documents d on d.id = l.document_id
        join public.dossier_document_slots s on s.id = d.slot_id
        cross join hang_muc hm
        where l.checklist_result_id = :checklist_result_id
          and d.doc_status = 'DANG_DUNG'
          and d.slot_id is not null
          and s.scope = 'SERVICE_LINE'
          and s.service_line_id = hm.service_line_id
    )
    select s.template_id, s.name as slot_name,
           -- distinct theo document_id: một tệp nối vào cùng một ô bằng cả hai
           -- đường vẫn chỉ là MỘT bản.
           count(distinct t.document_id) as so_ban
    from tai_lieu t
    join public.dossier_document_slots s on s.id = t.slot_id
    group by s.template_id, s.name
""")


def _output_config(db: Session, checklist_result_id: str) -> tuple[list[dict], dict]:
    """Đọc cấu hình tài liệu đầu ra của một checklist result từ graph đang chạy."""
    row = db.execute(
        _CHECKLIST_OUTPUT_CONFIG_QUERY, {"checklist_result_id": checklist_result_id}
    ).mappings().first()
    if not row:
        return [], {}
    if "output_documents" in row:
        # Đường dùng cho test đơn vị: đã có sẵn cấu hình, không phải dò trong graph.
        return list(row.get("output_documents") or []), dict(row)
    for item in list(row.get("checklist") or []):
        if isinstance(item, dict) and item.get("key") == row["checklist_key"]:
            return list(item.get("output_documents") or []), dict(row)
    return [], dict(row)


def checklist_output_status(db: Session, checklist_result_id: str) -> dict[str, Any]:
    """Tình trạng tài liệu đầu ra của một mục checklist — dùng chung cho UI và cổng chặn.

    Một nguồn sự thật: nút nộp trên giao diện và hàng rào phía máy chủ đọc cùng
    hàm này, nên không có cảnh UI báo nộp được mà backend chặn.
    """
    output_config, checklist_context = _output_config(db, checklist_result_id)
    if not output_config:
        return {"can_submit": True, "missing": [], "documents": []}

    existing_by_template = {
        row["template_id"]: row
        for row in db.execute(
            _CHECKLIST_OUTPUT_COUNT_QUERY, {"checklist_result_id": checklist_result_id}
        ).mappings().all()
    }

    documents: list[dict[str, Any]] = []
    missing: list[str] = []
    for config in output_config:
        template_id = config.get("template_id")
        existing = existing_by_template.get(template_id) or {}
        current_count = int(existing.get("so_ban") or 0)
        required_count = int(config.get("min_count") or 1)
        resolved_name = existing.get("slot_name")
        if not resolved_name:
            try:
                resolved_name = resolve_output_slot(
                    db,
                    template_id=template_id,
                    service_line_id=checklist_context.get("service_line_id"),
                    contract_id=checklist_context.get("contract_id"),
                )["name"]
            except HTTPException:
                # Chưa có ô giấy là lỗi CẤU HÌNH, không phải lỗi của nhân viên —
                # vẫn hiện ra để họ biết mà báo, thay vì thấy một dòng trống.
                resolved_name = template_id
        documents.append({
            "template_id": template_id,
            "slot_name": resolved_name,
            "min_count": required_count,
            "current_count": current_count,
            "required_before_submit": bool(config.get("required_before_submit", True)),
            "needs_director_approval": bool(config.get("needs_director_approval")),
        })
        if config.get("required_before_submit") and current_count < required_count:
            missing.append(f"{resolved_name} (cần {required_count}, đang có {current_count})")

    return {"can_submit": not missing, "missing": missing, "documents": documents}


def checklist_output_blockers(db: Session, checklist_result_id: str) -> list[str]:
    """Cổng NỘP của nhân viên — chỉ xét ``required_before_submit``.

    Cố ý KHÔNG xét ``needs_director_approval``: bắt nhân viên đợi Giám đốc duyệt
    mới cho nộp là khoá vòng tròn — Giám đốc chỉ duyệt được sau khi đã có cái để
    duyệt. Việc duyệt thuộc cổng đóng Node.
    """
    return checklist_output_status(db, checklist_result_id)["missing"]


_NODE_OUTPUT_STATE_QUERY = text("""
    select r.id as checklist_result_id,
           r.checklist_name,
           r.status as checklist_status,
           r.approver_role,
           coalesce(cr_graph.item->'output_documents', '[]'::jsonb) as output_documents,
           coalesce(jsonb_object_agg(s.template_id, cnt.so_ban)
                    filter (where s.template_id is not null), '{}'::jsonb) as dang_co,
           -- Phán quyết của Giám đốc cho tờ mới nhất ở mỗi loại giấy. Giao diện
           -- đọc cái này để bày "đã duyệt" / "đã từ chối kèm lý do" thay vì để
           -- nút Duyệt sáng lên trên một tờ đã xử rồi.
            coalesce(jsonb_object_agg(s.template_id, jsonb_build_object(
                       'document_id',      cnt.document_id,
                       'file_name',        cnt.file_name,
                       'review_status',    cnt.review_status,
                       'rejection_reason', cnt.rejection_reason))
                    filter (where s.template_id is not null), '{}'::jsonb) as review_by_template
    from public.task_node_checklist_results r
    join public.task_nodes n on n.id = r.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    cross join lateral (
      select item
      from jsonb_array_elements(coalesce(
             coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->'checklist',
             '[]'::jsonb)) item
      where item->>'key' = r.checklist_key
      limit 1
    ) cr_graph
    left join lateral (
      -- Đếm bản hợp lệ, và lấy phán quyết của bản MỚI NHẤT. Nhiều bản cùng loại
      -- thì bản mới là bản nhân viên vừa nộp lại sau khi bị trả — bày phán quyết
      -- của bản cũ là hiện lý do từ chối đã hết hiệu lực.
      select d.slot_id, count(*) as so_ban,
              (array_agg(l.document_id      order by d.uploaded_at desc, d.id desc))[1] as document_id,
              (array_agg(d.file_name        order by d.uploaded_at desc, d.id desc))[1] as file_name,
             (array_agg(l.review_status    order by d.uploaded_at desc, d.id desc))[1] as review_status,
             (array_agg(l.rejection_reason order by d.uploaded_at desc, d.id desc))[1] as rejection_reason
      from public.checklist_result_document_links l
      join public.dossier_documents d on d.id = l.document_id
      where l.checklist_result_id = r.id and d.doc_status = 'DANG_DUNG'
      group by d.slot_id
    ) cnt on true
    left join public.dossier_document_slots s on s.id = cnt.slot_id
    where r.task_node_id = :task_node_id
      and cr_graph.item ? 'output_documents'
    group by r.id, r.checklist_name, r.status, r.approver_role, cr_graph.item
""")


_RUNTIME_TYPE_SHORTAGE_QUERY = text("""
    select cr.id as checklist_result_id,
           cr.checklist_name,
           t.template_id,
           t.name,
           count(d.id) as file_count
    from public.task_node_checklist_results cr
    join public.checklist_result_document_types t
      on t.checklist_result_id = cr.id and t.is_active
    left join public.checklist_result_document_type_files f
      on f.document_type_id = t.id and f.is_active
    left join public.dossier_documents d
      on d.id = f.document_id and d.doc_status = 'DANG_DUNG'
    where cr.task_node_id = :task_node_id
    group by cr.id, cr.checklist_name, t.id, t.template_id, t.name, t.created_at
    order by cr.id, t.created_at, t.id
""")


def node_output_document_blockers(db: Session, task_node_id: str) -> list[str]:
    """Cổng ĐÓNG NODE — tài liệu đầu ra phải CÒN hợp lệ tại thời điểm đóng.

    Vì sao không kiểm "đã được duyệt chưa" ở đây: ``auto_finalize_node_if_ready``
    đã đòi MỌI checklist của bước ở trạng thái approved/late_approved trước khi
    chạm tới hàm này. Kiểm lại trạng thái checklist là hỏi một câu đã có đáp án —
    một cổng không bao giờ đóng, tức là code chết.

    Việc "Giám đốc duyệt" được bảo đảm ở tầng CẤU HÌNH: khai
    ``needs_director_approval`` mà người duyệt checklist không phải Giám đốc thì
    graph không lưu được (xem ``_normalize_output_documents``). Nên duyệt
    checklist CHÍNH LÀ duyệt tài liệu.

    Cái hàm này bắt là chuyện xảy ra SAU khi duyệt: Giám đốc gạt một tệp sang
    ``KHONG_HOP_LE``, hoặc tệp bị thay bởi bản mới, hoặc bị gỡ nối. Lúc đó
    checklist vẫn "đã duyệt" nhưng hồ sơ đã hụt — bước không được đóng.
    """
    missing_messages: list[str] = []
    for row in db.execute(
        _NODE_OUTPUT_STATE_QUERY, {"task_node_id": task_node_id}
    ).mappings().all():
        existing_counts = dict(row["dang_co"] or {})
        for config in list(row["output_documents"] or []):
            required_count = int(config.get("min_count") or 1)
            current_count = int(existing_counts.get(config.get("template_id")) or 0)
            if current_count < required_count:
                missing_messages.append(
                    f"“{row['checklist_name']}” thiếu tài liệu đầu ra "
                    f"(cần {required_count}, còn hợp lệ {current_count})"
                )
    return missing_messages


def node_shortage_report(db: Session, task_node_id: str) -> list[dict[str, Any]]:
    """Thiếu những gì, của mục checklist nào, cần mấy bản, đang có mấy bản.

    Một hàm cho ba nơi dùng, để ba nơi không bao giờ nói khác nhau:
      - Modal cảnh báo trước khi nhân viên bấm Nộp nghiệm thu
      - Ảnh chụp ghi vào missing_at_submit ngay lúc nộp
      - Danh sách Giám đốc đọc khi quyết chấp nhận thiếu

    Khác ``node_output_document_blockers``: hàm kia trả câu chữ để chặn, hàm này
    trả dữ liệu có cấu trúc để hiển thị và lưu vết.
    """
    # Checklist đời mới materialize danh sách LOẠI GIẤY riêng cho đúng Node.
    # Danh sách này thay thế hoàn toàn output_documents + ô sổ K01 đời cũ:
    # một loại có thể giữ nhiều file nhưng chỉ cần ít nhất một file hiện hành.
    # Nếu tiếp tục đếm graph cũ, file vừa tải vào loại runtime vẫn bị báo là
    # "đã có 0", đồng thời cùng một loại còn bị kể thêm lần nữa từ sổ K01.
    runtime_rows = [dict(row) for row in db.execute(
        _RUNTIME_TYPE_SHORTAGE_QUERY, {"task_node_id": task_node_id}
    ).mappings().all()]
    if runtime_rows:
        runtime_report: list[dict[str, Any]] = []
        groups: dict[str, dict[str, Any]] = {}
        for row in runtime_rows:
            if int(row["file_count"] or 0) > 0:
                continue
            checklist_id = row["checklist_result_id"]
            group = groups.get(checklist_id)
            if group is None:
                group = {
                    "checklist_result_id": checklist_id,
                    "checklist_name": row["checklist_name"],
                    "thieu": [],
                }
                groups[checklist_id] = group
                runtime_report.append(group)
            group["thieu"].append({
                "template_id": row["template_id"],
                "name": row["name"],
                "can": 1,
                "da_co": 0,
                "con_thieu": 1,
            })
        return runtime_report

    template_names = dict(
        db.execute(
            text("select id, name from public.document_checklist_templates")
        ).all()
    )
    report: list[dict[str, Any]] = []
    for row in db.execute(
        _NODE_OUTPUT_STATE_QUERY, {"task_node_id": task_node_id}
    ).mappings().all():
        existing_counts = dict(row["dang_co"] or {})
        missing_items = []
        for config in list(row["output_documents"] or []):
            # required_before_submit=false nghĩa là loại này không bắt buộc lúc
            # nộp — không đưa vào danh sách thiếu, nếu không Giám đốc phải đọc
            # một danh sách toàn thứ vốn dĩ không cần.
            if not config.get("required_before_submit", True):
                continue
            template_id = config.get("template_id")
            required_count = int(config.get("min_count") or 1)
            current_count = int(existing_counts.get(template_id) or 0)
            if current_count < required_count:
                missing_items.append({
                    "template_id": template_id,
                    "name": template_names.get(template_id, template_id),
                    "can": required_count,
                    "da_co": current_count,
                    "con_thieu": required_count - current_count,
                })
        if missing_items:
            report.append({
                "checklist_result_id": row["checklist_result_id"],
                "checklist_name": row["checklist_name"],
                "thieu": missing_items,
            })

    # Bước K01 còn một nguồn thiếu thứ hai: ô giấy bắt buộc trong SỔ TÀI LIỆU
    # của Hạng mục mà chưa ai gắn tệp vào. Nó không đi qua output_documents nên
    # phải gộp riêng — nếu không, Giám đốc duyệt K01 mà không biết hồ sơ đang
    # khuyết sổ đỏ.
    node_context = db.execute(
        text("""
            select n.node_code, wi.service_line_id
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            where n.id = :n
        """),
        {"n": task_node_id},
    ).mappings().first()
    if node_context and node_context["node_code"] == "K01" and node_context["service_line_id"]:
        from src.dossiers.register import k01_blockers

        blockers = k01_blockers(db, node_context["service_line_id"])
        # Khử trùng: loại nào checklist đã đòi rồi thì thôi kể lại. Cùng một tờ
        # giấy hiện hai lần chỉ làm Giám đốc đọc nhiễu, trong khi nạp một tệp là
        # cả hai chỗ cùng hết thiếu (submit_output_document nối vào chính ô đó).
        already_reported = {item["name"] for group in report for item in group["thieu"]}
        missing_slots = [
            {"template_id": None, "name": slot_name, "can": 1, "da_co": 0, "con_thieu": 1}
            for slot_name in blockers.get("required_missing", []) if slot_name not in already_reported
        ]
        if missing_slots:
            report.append({
                "checklist_result_id": None,
                "checklist_name": "Sổ giấy tờ khách cung cấp",
                "thieu": missing_slots,
            })

    return report


def submit_output_document(
    db: Session,
    *,
    checklist_result_id: str,
    template_id: str,
    file_name: str,
    content_type: str | None,
    data: bytes,
    actor_id: str,
) -> dict[str, Any]:
    """Nộp một tài liệu đầu ra tại checklist — MỘT object, nhiều quan hệ.

    Đây là chỗ luật "một tệp một object" được thực thi: gọi ``upload_file`` đúng
    một lần, rồi sinh các quan hệ trỏ về cùng ``document_id``:

      dossier_documents            tệp nằm ở đây, đúng một dòng
      dossier_document_links       tệp ↔ ô giấy   (hồ sơ có cấu trúc)
      checklist_result_document_links  tệp ↔ checklist (minh chứng)
      evidence_data.files[]        chỉ ghi document_id, KHÔNG ghi URL

    Không có nhánh nào upload lần thứ hai. Link xem/tải do backend sinh lúc đọc.
    """
    _validate_upload(file_name, content_type, data)

    context_row = db.execute(
        text("""
            select r.id, r.task_node_id, r.evidence_data,
                   n.node_code, wi.service_line_id, sl.contract_id
            from public.task_node_checklist_results r
            join public.task_nodes n on n.id = r.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where r.id = :id
        """),
        {"id": checklist_result_id},
    ).mappings().first()
    if not context_row:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist.")

    # Loại tài liệu phải nằm trong cấu hình CỦA CHÍNH checklist này. Không kiểm
    # thì nhân viên nộp một tệp gắn nhãn bất kỳ và nó vẫn chui vào hồ sơ — chỗ
    # kiểm này phải đứng TRƯỚC upload, để tệp sai không kịp chạm tới kho lưu trữ.
    output_config, _ = _output_config(db, checklist_result_id)
    allowed_template_ids = {config.get("template_id") for config in output_config}
    if template_id not in allowed_template_ids:
        raise HTTPException(
            status_code=409,
            detail=(
                "Mục checklist này không nhận loại tài liệu đó."
                if allowed_template_ids
                else "Mục checklist này không yêu cầu tài liệu đầu ra nào."
            ),
        )

    slot = resolve_output_slot(
        db,
        template_id=template_id,
        service_line_id=context_row["service_line_id"],
        contract_id=context_row["contract_id"],
    )

    # Giai đoạn suy từ mã bước, không ghi cứng theo K02/K03: quy trình tự do không
    # có mã K nào thì rơi về kho hồ sơ gốc thay vì vỡ.
    stage = STAGE_BY_UPPER_NODE_CODE.get(
        str(context_row["node_code"] or "").strip().upper()) or "ho-so-goc"

    document_id = uuid.uuid4().hex
    reference = DossierFileReference.build(
        contract_id=context_row["contract_id"], document_id=document_id, filename=file_name,
    )
    ensure_bucket()
    upload_file(io.BytesIO(data), reference.object_key)

    try:
        db.execute(
            text("""
                insert into public.dossier_documents
                    (id, service_line_id, contract_id, scope, stage, task_node_id,
                     slot_id, object_key, file_name, content_type, size_bytes, uploaded_by)
                values (:id, :service_line_id, :contract_id, 'SERVICE_LINE', :stage,
                        :task_node_id, :slot_id, :object_key, :file_name, :content_type,
                        :size_bytes, :uploaded_by)
            """),
            {
                "id": document_id,
                "service_line_id": context_row["service_line_id"],
                "contract_id": context_row["contract_id"],
                "stage": stage,
                "task_node_id": context_row["task_node_id"],
                "slot_id": slot["id"],
                "object_key": reference.object_key,
                "file_name": file_name,
                "content_type": content_type,
                "size_bytes": len(data),
                "uploaded_by": actor_id,
            },
        )
        db.execute(
            text("""
                insert into public.dossier_document_links
                    (contract_id, document_id, slot_id, linked_by)
                values (:contract_id, :document_id, :slot_id, :actor)
                on conflict (document_id, slot_id) do nothing
            """),
            {
                "contract_id": context_row["contract_id"],
                "document_id": document_id,
                "slot_id": slot["id"],
                "actor": actor_id,
            },
        )
        _lock_checklist_and_reject_overwrite(
            db, checklist_result_id=checklist_result_id, document_id=document_id
        )
        db.execute(
            text("""
                insert into public.checklist_result_document_links
                    (contract_id, checklist_result_id, document_id, created_by)
                values (:contract_id, :checklist_result_id, :document_id, :actor)
                on conflict (checklist_result_id, document_id) do nothing
            """),
            {
                "contract_id": context_row["contract_id"],
                "checklist_result_id": checklist_result_id,
                "document_id": document_id,
                "actor": actor_id,
            },
        )

        # Minh chứng chỉ TRỎ tới tài liệu. Không lưu URL: URL tạm hết hạn, và đổi
        # MinIO sang R2 thì mọi dòng cũ thành rác.
        evidence = dict(context_row["evidence_data"] or {})
        files = list(evidence.get("files") or [])
        files.append({"document_id": document_id, "name": file_name})
        evidence["files"] = files
        db.execute(
            text("""
                update public.task_node_checklist_results
                set evidence_data = cast(:evidence as jsonb), updated_at = now()
                where id = :id
            """),
            {"id": checklist_result_id, "evidence": json.dumps(evidence, ensure_ascii=False)},
        )
    except Exception:
        # Không xoá object sau khi upload; object immutable và mọi vòng đời nằm
        # trong trạng thái/liên kết DB.
        raise

    return {
        "document_id": document_id,
        "slot_id": slot["id"],
        "slot_name": slot["name"],
        "stage": stage,
        "file_name": file_name,
    }


def _lock_checklist_and_reject_overwrite(
    db: Session, *, checklist_result_id: str, document_id: str
) -> None:
    """Khoá mục checklist, rồi chặn gán đè lên ô giấy Giám đốc ĐÃ DUYỆT.

    ── Vì sao phải chặn ─────────────────────────────────────────────────────────
    Quy tắc hiển thị là "bản mới nhất thắng". Nên gán một tệp khác vào ô giấy đã
    được duyệt đạt sẽ đẩy phán quyết cũ ra rìa, tờ quay về chờ duyệt — tức tệp đã
    duyệt bị thay SAU LƯNG người duyệt. Muốn thay thì Giám đốc phải từ chối tờ đó
    trước; đó là đường duy nhất có ghi vết ai quyết.

    ── Vì sao phải KHOÁ, không chỉ kiểm ────────────────────────────────────────
    Postgres mặc định READ COMMITTED. Giám đốc bấm duyệt trong một giao dịch chưa
    commit, nhân viên bấm gán trong giao dịch khác: phép kiểm của nhân viên đọc
    ảnh chụp CŨ, không thấy trạng thái 'approved' chưa commit, nên cho qua. Hai
    bên commit xong là tồn tại đồng thời một dòng đã duyệt và một dòng mới.

    Khoá chính hàng mục checklist là điểm hẹn chung: đường duyệt tờ
    (``review_node_document``) cũng khoá đúng hàng này, nên hai bên xếp hàng thay
    vì chạy song song. Khoá một bên là khoá một chiều, vô dụng.
    """
    db.execute(
        text("select 1 from public.task_node_checklist_results where id = :i for update"),
        {"i": checklist_result_id},
    )
    da_duyet = db.execute(
        text("""
            select coalesce(s.name, d.file_name) as ten
            from public.checklist_result_document_links l
            join public.dossier_documents d on d.id = l.document_id
            left join public.dossier_document_slots s on s.id = d.slot_id
            where l.checklist_result_id = :checklist_result_id
              and l.review_status = 'approved'
              and l.document_id <> :document_id
              -- Cùng Ô GIẤY nhưng khác tệp mới là gán đè. Tệp của ô khác thì
              -- không liên quan.
              and d.slot_id is not null
              and d.slot_id = (
                select d2.slot_id from public.dossier_documents d2 where d2.id = :document_id
              )
            limit 1
        """),
        {"checklist_result_id": checklist_result_id, "document_id": document_id},
    ).scalar()
    if da_duyet:
        raise HTTPException(
            status_code=409,
            detail=(
                f"“{da_duyet}” đã được Giám đốc duyệt đạt nên không thay được. "
                "Cần thay thì Giám đốc phải từ chối tờ đó trước."
            ),
        )


def reuse_document_for_checklist(
    db: Session,
    *,
    checklist_result_id: str,
    document_id: str,
    contract_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Dùng lại một tài liệu đã có cho checklist khác — chỉ thêm QUAN HỆ.

    K03 dùng lại bản kỹ thuật gốc của K02 là chuyện thường. Không gọi storage,
    không sinh dòng dossier_documents mới: tệp vẫn là tệp cũ, chỉ thêm một dòng
    nối. Khoá ngoại ghép lo phần chặn nối chéo Hợp đồng.
    """
    from src.dossiers.slot_requests import assert_document_not_reserved

    assert_document_not_reserved(db, document_id)
    _lock_checklist_and_reject_overwrite(
        db, checklist_result_id=checklist_result_id, document_id=document_id
    )
    db.execute(
        text("""
            insert into public.checklist_result_document_links
                (contract_id, checklist_result_id, document_id, created_by)
            values (:contract_id, :checklist_result_id, :document_id, :actor)
            on conflict (checklist_result_id, document_id) do nothing
        """),
        {
            "contract_id": contract_id,
            "checklist_result_id": checklist_result_id,
            "document_id": document_id,
            "actor": actor_id,
        },
    )
    return {"checklist_result_id": checklist_result_id, "document_id": document_id}


def attach_existing_document(
    db: Session,
    *,
    checklist_result_id: str,
    document_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Dùng lại một tài liệu đã có trong ĐÚNG Hợp đồng cho mục checklist này.

    Không chạm tới kho lưu trữ: tệp vẫn là tệp cũ, chỉ thêm một dòng quan hệ.
    Đây là cách K03 dùng lại bản kỹ thuật gốc của K02 mà không sinh object thứ hai.
    """
    context_row = db.execute(
        text("""
            select r.id, wi.service_line_id, sl.contract_id
            from public.task_node_checklist_results r
            join public.task_nodes n on n.id = r.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where r.id = :id
        """),
        {"id": checklist_result_id},
    ).mappings().first()
    if not context_row:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist.")

    # Tài liệu phải thuộc ĐÚNG Hợp đồng. Khoá ngoại ghép cũng chặn, nhưng bắt ở
    # đây thì người dùng nhận được câu tiếng Việt thay vì lỗi ràng buộc thô.
    document = db.execute(
        text("""
            select id, slot_id, doc_status from public.dossier_documents
            where id = :id and contract_id = :contract_id
        """),
        {"id": document_id, "contract_id": context_row["contract_id"]},
    ).mappings().first()
    if not document:
        raise HTTPException(status_code=409, detail="Tài liệu không thuộc hợp đồng này.")
    if document["doc_status"] != "DANG_DUNG":
        raise HTTPException(status_code=409, detail="Tài liệu này không còn hiệu lực.")

    # Tệp còn nằm trong một đề xuất chưa duyệt thì chưa phải tài liệu chính thức.
    from src.dossiers.slot_requests import assert_document_not_reserved

    assert_document_not_reserved(db, document_id)

    return reuse_document_for_checklist(
        db,
        checklist_result_id=checklist_result_id,
        document_id=document_id,
        contract_id=context_row["contract_id"],
        actor_id=actor_id,
    )


def classify_source_document_for_checklist(
    db: Session,
    *,
    checklist_result_id: str,
    document_id: str,
    template_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Phân loại một tệp nguyên bản vào đúng loại giấy của checklist, nguyên tử.

    Một transaction đồng thời neo tệp vào ô giấy và mục checklist. Làm hai API
    rời nhau có thể để lại trạng thái nửa vời: tệp đã biến khỏi kho nguyên bản
    nhưng checklist vẫn chưa nhận được.
    """
    output_config, context = _output_config(db, checklist_result_id)
    allowed_template_ids = {
        config.get("template_id") for config in output_config if isinstance(config, dict)
    }
    if template_id not in allowed_template_ids:
        raise HTTPException(status_code=409, detail="Mục checklist này không nhận loại tài liệu đó.")

    slot = resolve_output_slot(
        db,
        template_id=template_id,
        service_line_id=context.get("service_line_id"),
        contract_id=context.get("contract_id"),
    )
    document = db.execute(
        text("""
            select d.id, d.file_name, d.doc_status, d.scope, d.slot_id,
                   exists (
                     select 1 from public.dossier_document_links l
                     where l.document_id = d.id and l.link_status = 'DANG_DUNG'
                   ) as has_active_links
            from public.dossier_documents d
            where d.id = :document_id and d.contract_id = :contract_id
            for update
        """),
        {"document_id": document_id, "contract_id": context.get("contract_id")},
    ).mappings().first()
    if not document:
        raise HTTPException(status_code=409, detail="Tài liệu không thuộc hợp đồng này.")
    if document["doc_status"] != "DANG_DUNG":
        raise HTTPException(status_code=409, detail="Tài liệu này không còn hiệu lực.")
    if document["scope"] != "CONTRACT" or document["slot_id"] or document["has_active_links"]:
        raise HTTPException(status_code=409, detail="Tài liệu này đã được phân loại.")

    # Dùng lại đúng nghiệp vụ phân loại của Sổ giấy tờ để không mở một đường
    # tắt bỏ qua kiểm tra nguồn KHACH_HANG, phiếu đề xuất đang chờ và audit.
    # Hàm này không commit, nên toàn bộ vẫn nằm trong transaction của route.
    from src.dossiers import register

    register.link_source_document(
        db, slot["id"], document_id, actor_id=actor_id,
    )
    db.execute(
        text("""
            update public.dossier_documents
            set slot_id = :slot_id, task_node_id = :task_node_id
            where id = :document_id
        """),
        {
            "slot_id": slot["id"], "task_node_id": context.get("task_node_id"),
            "document_id": document_id,
        },
    )
    _lock_checklist_and_reject_overwrite(
        db, checklist_result_id=checklist_result_id, document_id=document_id
    )
    db.execute(
        text("""
            insert into public.checklist_result_document_links
                (contract_id, checklist_result_id, document_id, created_by)
            values (:contract_id, :checklist_result_id, :document_id, :actor)
            on conflict (checklist_result_id, document_id) do nothing
        """),
        {
            "contract_id": context.get("contract_id"),
            "checklist_result_id": checklist_result_id,
            "document_id": document_id,
            "actor": actor_id,
        },
    )
    return {
        "checklist_result_id": checklist_result_id,
        "document_id": document_id,
        "template_id": template_id,
        "slot_id": slot["id"],
        "slot_name": slot["name"],
        "file_name": document["file_name"],
    }
