"""Đề xuất thêm một LOẠI TÀI LIỆU phát sinh, kèm sẵn tệp nhân viên đã tải.

Nghiệp vụ: đang làm một bước Đo vẽ hay Pháp lý, nhân viên gặp một sản phẩm mà
Giám đốc chưa cấu hình trước trong ``output_documents``. Họ tự đặt tên loại, tải
ngay các tệp vào đó, rồi gửi duyệt.

Luật bất biến của cả tệp này:

    Chưa duyệt hoặc bị từ chối thì tệp KHÔNG vào hồ sơ chính thức dưới bất kỳ
    hình thức nào.

Cách bảo đảm không phải bằng cờ mà bằng CẤU TRÚC: lúc tải lên, tệp thành một dòng
``dossier_documents`` không có ``slot_id``, không có ``dossier_id``, không có
``dossier_document_links``. Mọi API hồ sơ chính thức đều đọc qua ô giấy hoặc qua
``dossier_id``, nên tệp ấy vô hình với chúng — không nơi nào phải nhớ lọc.
Duyệt xong mới sinh ô và nối vào.
"""

import io
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.files.references import DossierFileReference, STAGE_BY_NODE_CODE
from src.services.storage_service import ensure_bucket, upload_file

SOURCES = ("KHACH_HANG", "CONG_TY", "CO_QUAN")

# Nguồn mặc định suy từ mã bước. Nhân viên đề xuất được gợi ý nguồn, nhưng giá
# trị CHÍNH THỨC là cái Giám đốc chốt lúc duyệt — mặc định lấy từ đây.
#
#   K02/K03 (đo vẽ, chuẩn hoá) → sản phẩm do công ty làm ra
#   K04 (soạn hồ sơ)           → công ty soạn
#   K05/K06 (nộp, nhận kết quả)→ giấy cơ quan trả
_DEFAULT_SOURCE_BY_NODE = {
    "K01": "KHACH_HANG",
    "K02": "CONG_TY", "K03": "CONG_TY", "K04": "CONG_TY",
    "K05": "CO_QUAN", "K06": "CO_QUAN",
}


def default_source_for_node(db: Session, task_node_id: str) -> str:
    """Nguồn nghiệp vụ suy từ bước. Bước lạ thì rơi về công ty soạn."""
    node_code = db.execute(
        text("select node_code from public.task_nodes where id = :id"),
        {"id": task_node_id},
    ).scalar()
    return _DEFAULT_SOURCE_BY_NODE.get(str(node_code or "").upper(), "CONG_TY")


# Trạng thái đề xuất mà tài liệu bên trong CHƯA phải tài liệu chính thức.
_TRANG_THAI_CHUA_DUYET = ("draft", "pending", "rejected", "needs_more")


def assert_document_not_reserved(db: Session, document_id: str) -> None:
    """Chặn tài liệu đang nằm trong một đề xuất CHƯA ĐƯỢC DUYỆT.

    Tệp của đề xuất tồn tại thật trong ``dossier_documents`` với
    ``doc_status='DANG_DUNG'`` — nó phải thế để có document_id và khoá lưu trữ ổn
    định. Nhưng nó chưa được Giám đốc chấp nhận, nên không được đi đường vòng vào
    hồ sơ chính thức: ai đó gọi "dùng lại tài liệu có sẵn" và chọn đúng nó là
    lách qua toàn bộ vòng duyệt.

    Gọi ở MỌI chỗ tạo liên kết chính thức. Đề xuất đã duyệt thì tệp thành tài
    liệu bình thường và dùng lại thoải mái.
    """
    row = db.execute(
        text("""
            select r.id, r.status, r.proposed_name
            from public.document_slot_creation_request_documents rd
            join public.document_slot_creation_requests r on r.id = rd.request_id
            where rd.document_id = :document_id
              and r.status = any(:trang_thai)
            limit 1
        """),
        {"document_id": document_id, "trang_thai": list(_TRANG_THAI_CHUA_DUYET)},
    ).mappings().first()
    if row:
        nhan = {
            "draft": "còn là bản nháp",
            "pending": "đang chờ Giám đốc duyệt",
            "rejected": "đã bị từ chối",
            "needs_more": "đang cần bổ sung",
        }[row["status"]]
        raise HTTPException(
            status_code=409,
            detail=(
                f"Tệp này thuộc đề xuất “{row['proposed_name']}” {nhan}. "
                "Chờ Giám đốc duyệt rồi mới dùng cho hồ sơ chính thức được."
            ),
        )


def _checklist_context(db: Session, checklist_result_id: str) -> dict[str, Any]:
    """Ngữ cảnh suy PHÍA MÁY CHỦ từ mục checklist — không nhận từ client.

    contract_id và service_line_id đi qua chuỗi
    checklist → task_node → workflow_instance → service_line, đúng chuỗi mà
    migration dùng để backfill, nên không thể lệch.
    """
    row = db.execute(
        text("""
            select r.id as checklist_result_id, r.checklist_name,
                   n.id as task_node_id, n.node_code,
                   wi.service_line_id, sl.contract_id
            from public.task_node_checklist_results r
            join public.task_nodes n on n.id = r.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where r.id = :id
        """),
        {"id": checklist_result_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist.")
    return dict(row)


def create_request(
    db: Session,
    *,
    checklist_result_id: str,
    proposed_name: str,
    reason: str,
    source: str,
    description: str | None,
    quantity: int,
    actor_id: str,
    kind: str = "OUTPUT",
) -> dict[str, Any]:
    """Mở một đề xuất ở trạng thái ``draft`` — chưa đụng gì tới hồ sơ."""
    proposed_name_text = (proposed_name or "").strip()
    reason_text = (reason or "").strip()
    if len(proposed_name_text) < 3:
        raise HTTPException(status_code=422, detail="Tên loại tài liệu quá ngắn.")
    if len(reason_text) < 5:
        raise HTTPException(status_code=422, detail="Cần ghi rõ lý do phát sinh (tối thiểu 5 ký tự).")
    if source not in SOURCES:
        raise HTTPException(status_code=422, detail="Nguồn tài liệu không hợp lệ.")
    request_kind = str(kind or "").upper()
    if request_kind not in ("INPUT", "OUTPUT"):
        raise HTTPException(status_code=422, detail="Loại đề xuất phải là INPUT hoặc OUTPUT.")

    checklist_context = _checklist_context(db, checklist_result_id)
    request_id = db.execute(
        text("""
            insert into public.document_slot_creation_requests
                (contract_id, service_line_id, task_node_id, checklist_result_id,
                 proposed_name, description, reason, source, quantity, kind, requested_by)
            values (:contract_id, :service_line_id, :task_node_id, :checklist_result_id,
                    :name, :description, :reason, :source, :quantity, :kind, :actor)
            returning id
        """),
        {
            "contract_id": checklist_context["contract_id"],
            "service_line_id": checklist_context["service_line_id"],
            "task_node_id": checklist_context["task_node_id"],
            "checklist_result_id": checklist_result_id,
            "name": proposed_name_text,
            "description": (description or "").strip() or None,
            "reason": reason_text,
            "source": source,
            "quantity": max(1, int(quantity or 1)),
            "kind": request_kind,
            "actor": actor_id,
        },
    ).scalar()
    return {"id": request_id, "status": "draft", "proposed_name": proposed_name_text}


def update_request(
    db: Session,
    request_id: str,
    *,
    proposed_name: str,
    description: str | None,
    reason: str,
    source: str,
    quantity: int,
    actor_id: str,
) -> dict[str, Any]:
    """Sửa metadata trên chính phiếu cũ khi Giám đốc yêu cầu bổ sung.

    Không tạo phiếu mới: lịch sử chuyển trạng thái của cùng một đề xuất được giữ
    nguyên trong audit log. ``actor_id`` nằm trong chữ ký để route không thể vô
    tình gọi đây như một thao tác vô danh; quyền sở hữu được chặn ở route.
    """
    request = _open_request(db, request_id, lock=True)
    if request["status"] not in ("draft", "rejected", "needs_more"):
        raise HTTPException(status_code=409, detail="Đề xuất đang chờ duyệt hoặc đã duyệt — không sửa được.")

    proposed_name_text = (proposed_name or "").strip()
    reason_text = (reason or "").strip()
    if len(proposed_name_text) < 3:
        raise HTTPException(status_code=422, detail="Tên loại tài liệu quá ngắn.")
    if len(reason_text) < 5:
        raise HTTPException(status_code=422, detail="Cần ghi rõ lý do phát sinh (tối thiểu 5 ký tự).")
    if source not in SOURCES:
        raise HTTPException(status_code=422, detail="Nguồn tài liệu không hợp lệ.")

    db.execute(
        text("""
            update public.document_slot_creation_requests
            set proposed_name = :name, description = :description, reason = :reason,
                source = :source, quantity = :quantity, updated_at = now()
            where id = :id
        """),
        {
            "id": request_id,
            "name": proposed_name_text,
            "description": (description or "").strip() or None,
            "reason": reason_text,
            "source": source,
            "quantity": max(1, int(quantity or 1)),
        },
    )
    return {"id": request_id, "status": request["status"], "proposed_name": proposed_name_text}


def _open_request(db: Session, request_id: str, *, lock: bool = False) -> dict[str, Any]:
    row = db.execute(
        text(f"""
            select id, contract_id, service_line_id, task_node_id, checklist_result_id,
                   proposed_name, approved_name, quantity, approved_quantity, source,
                   status, created_slot_id, requested_by, kind,
                   required_before_submit, needs_director_approval
            from public.document_slot_creation_requests
            where id = :id
            {"for update" if lock else ""}
        """),
        {"id": request_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề xuất.")
    return dict(row)


def add_file(
    db: Session,
    *,
    request_id: str,
    file_name: str,
    content_type: str | None,
    data: bytes,
    actor_id: str,
) -> dict[str, Any]:
    """Tải một tệp vào đề xuất — MỘT object, và chưa vào hồ sơ chính thức.

    Dòng ``dossier_documents`` được tạo ngay để tệp có document_id ổn định, khoá
    lưu trữ ổn định và đọc được qua backend có kiểm quyền. Nhưng cố ý KHÔNG đặt
    ``slot_id``, KHÔNG đặt ``dossier_id`` và KHÔNG tạo ``dossier_document_links``
    — ba thứ đó mới là cái làm tệp trở thành tài liệu chính thức.
    """
    from src.dossiers.documents import _validate_upload

    _validate_upload(file_name, content_type, data)
    request = _open_request(db, request_id)
    if request["status"] not in ("draft", "rejected", "needs_more"):
        raise HTTPException(
            status_code=409,
            detail="Đề xuất đang chờ duyệt hoặc đã duyệt — không thêm tệp được nữa.",
        )

    node_code = db.execute(
        text("select node_code from public.task_nodes where id = :id"),
        {"id": request["task_node_id"]},
    ).scalar()
    stage = STAGE_BY_NODE_CODE.get(str(node_code or "").upper()) or "ho-so-goc"

    document_id = uuid.uuid4().hex
    reference = DossierFileReference.build(
        contract_id=request["contract_id"], document_id=document_id, filename=file_name,
    )
    ensure_bucket()
    upload_file(io.BytesIO(data), reference.object_key)

    try:
        db.execute(
            text("""
                insert into public.dossier_documents
                    (id, service_line_id, contract_id, scope, stage, task_node_id,
                     object_key, file_name, content_type, size_bytes, uploaded_by)
                values (:id, :service_line_id, :contract_id, 'SERVICE_LINE', :stage,
                        :task_node_id, :object_key, :file_name, :content_type,
                        :size_bytes, :uploaded_by)
            """),
            {
                "id": document_id,
                "service_line_id": request["service_line_id"],
                "contract_id": request["contract_id"],
                "stage": stage,
                "task_node_id": request["task_node_id"],
                "object_key": reference.object_key,
                "file_name": file_name,
                "content_type": content_type,
                "size_bytes": len(data),
                "uploaded_by": actor_id,
            },
        )
        db.execute(
            text("""
                insert into public.document_slot_creation_request_documents
                    (contract_id, request_id, document_id, created_by)
                values (:contract_id, :request_id, :document_id, :actor)
                on conflict (request_id, document_id) do nothing
            """),
            {
                "contract_id": request["contract_id"],
                "request_id": request_id,
                "document_id": document_id,
                "actor": actor_id,
            },
        )
    except Exception:
        # Không xoá object đã nhận; trạng thái đề xuất/đời tài liệu là nguồn sự
        # thật để xử lý lỗi DB, còn kho object là append-only.
        raise

    return {"request_id": request_id, "document_id": document_id, "file_name": file_name}


def submit_request(db: Session, request_id: str, *, actor_id: str) -> dict[str, Any]:
    """Gửi duyệt.

    Điều kiện về tệp khác nhau theo loại đề xuất:

    * ``OUTPUT`` — tài liệu công ty phải làm ra. Không có tệp thì không có gì để
      Giám đốc xem, gửi cũng vô nghĩa.
    * ``INPUT`` — loại giấy phát sinh còn thiếu trong sổ. **Được phép 0 tệp**:
      nhân viên phát hiện hồ sơ cần một tờ mà khách chưa đưa. Duyệt xong tạo ô
      trống, ô bắt buộc thì vẫn chặn Node cho tới khi có tệp. Bắt phải có tệp mới
      được khai là đẩy người ta về đúng chỗ cũ — tải đại một thứ gì đó cho qua.
    """
    request = _open_request(db, request_id, lock=True)
    if request["status"] not in ("draft", "rejected", "needs_more"):
        raise HTTPException(status_code=409, detail="Đề xuất này không ở trạng thái soạn.")

    # Đếm cho cả hai loại — con số này đi vào payload trả về. Chỉ RIÊNG việc ép
    # buộc là khác nhau: OUTPUT không tệp thì Giám đốc không có gì để xem.
    so_tep = int(db.execute(
        text("""
            select count(*) from public.document_slot_creation_request_documents
            where request_id = :id
        """),
        {"id": request_id},
    ).scalar() or 0)
    if (request.get("kind") or "OUTPUT") == "OUTPUT" and not so_tep:
        raise HTTPException(status_code=422, detail="Tải lên ít nhất một tệp rồi hãy gửi duyệt.")

    _audit(db, request_id, "DOCUMENT_SLOT_REQUEST_SUBMITTED", actor_id, None)
    db.execute(
        text("""
            update public.document_slot_creation_requests
            set status = 'pending',
                -- Gửi lại sau khi bị từ chối: xoá dấu vết lần duyệt trước, nếu
                -- không Giám đốc mở ra vẫn thấy nhận xét cũ và tưởng đã xử lý.
                -- Lịch sử không mất — nó nằm ở audit_log.
                reviewed_by = null, reviewed_at = null, review_note = null,
                updated_at = now()
            where id = :id
        """),
        {"id": request_id},
    )
    return {"id": request_id, "status": "pending", "file_count": int(so_tep)}


_PROMOTION_SCOPES = ("HANG_MUC_NAY", "TASK_TYPE", "PACKAGE", "GLOBAL")


def _compare_template_configuration(
    template, *, source: str, quantity: int, required: bool, needs_original: bool,
) -> list[str]:
    """Liệt kê những chỗ mẫu sẵn có KHÁC với thứ Giám đốc vừa chốt.

    Rỗng = tương thích, dùng lại được.

    Trùng tên chưa đủ. "Giấy uỷ quyền" khách đưa và "Giấy uỷ quyền" công ty soạn
    là hai thứ khác hẳn; "CCCD" cần bản chính và "CCCD" chỉ cần bản sao cũng
    vậy. Nối nhầm thì mọi Hạng mục tương lai nhận sai cấu hình, mà sửa mẫu cũ
    cho khớp lại làm hỏng những Hạng mục đang dựa vào nó.

    KHÔNG so hai thứ sau, có chủ ý:

    * ``sort_order`` — chỉ là thứ tự hiển thị, không đổi ý nghĩa tờ giấy.
    * ``task_type_id`` — cột cũ đang được thay bằng bảng applicabilities; phạm vi
      áp dụng là chuyện riêng, không phải thuộc tính của loại giấy.

    ``note`` chỉ tính là lệch khi CẢ HAI đều có nội dung và khác nhau: một bên
    trống là mô tả chưa ai điền, chặn ở đó chỉ gây phiền mà không thêm an toàn.
    """
    from src.dossiers.register import SOURCE_LABELS

    differences: list[str] = []
    if not template["is_active"]:
        differences.append("mẫu đã tắt")
    if template["source"] != source:
        differences.append(
            f"nguồn {SOURCE_LABELS.get(template['source'], template['source'])} "
            f"≠ {SOURCE_LABELS.get(source, source)}"
        )
    if bool(template["is_required"]) != bool(required):
        differences.append(
            f"mặc định {'bắt buộc' if template['is_required'] else 'không bắt buộc'} "
            f"≠ {'bắt buộc' if required else 'không bắt buộc'}"
        )
    if bool(template["needs_original"]) != bool(needs_original):
        differences.append(
            f"{'cần' if template['needs_original'] else 'không cần'} bản chính "
            f"≠ {'cần' if needs_original else 'không cần'}"
        )
    if int(template["default_quantity"] or 1) != int(quantity or 1):
        differences.append(f"số lượng mặc định {template['default_quantity']} ≠ {quantity}")
    old_description = (template["note"] or "").strip()
    new_description = ""  # đề xuất hiện chưa mang mô tả riêng cho mẫu
    if old_description and new_description and old_description != new_description:
        differences.append("mô tả khác")
    return differences


def _promote_template_by_scope(
    db: Session,
    *,
    request: dict[str, Any],
    promotion_scope: str | None,
    official_name: str,
    source: str,
    quantity: int,
    required: bool,
    needs_original: bool,
    actor_id: str,
    request_id: str,
) -> None:
    """Ghi loại giấy vừa duyệt vào bộ mẫu, ở đúng phạm vi Giám đốc chọn.

    ``None`` hoặc ``HANG_MUC_NAY`` — không ghi gì. Ô runtime đã tạo là đủ; loại
    giấy này chỉ tồn tại trong đúng hồ sơ đã phát sinh ra nó.
    """
    if promotion_scope in (None, "HANG_MUC_NAY"):
        return
    from src.dossiers.register import SOURCE_LABELS

    if promotion_scope not in _PROMOTION_SCOPES:
        raise HTTPException(
            status_code=422,
            detail=f"Phạm vi không hợp lệ. Chọn một trong: {', '.join(_PROMOTION_SCOPES)}.",
        )

    service_line_context = db.execute(
        text("""
            select sl.task_type_id,
                   coalesce(sl.service_package_id, tt.service_package_id) as service_package_id
            from public.service_lines sl
            left join public.task_types tt on tt.id = sl.task_type_id
            where sl.id = :sl
        """),
        {"sl": request["service_line_id"]},
    ).mappings().first()
    if not service_line_context:
        raise HTTPException(status_code=404, detail="Không tìm thấy Hạng mục của đề xuất.")

    if promotion_scope == "TASK_TYPE" and not service_line_context["task_type_id"]:
        raise HTTPException(
            status_code=409,
            detail="Hạng mục này chưa gắn Dạng hồ sơ nên không đặt mặc định theo loại được.",
        )
    if promotion_scope == "PACKAGE" and not service_line_context["service_package_id"]:
        raise HTTPException(
            status_code=409,
            detail="Hạng mục này chưa gắn Gói dịch vụ nên không đặt mặc định theo gói được.",
        )

    # Trùng TÊN chưa đủ để coi là cùng một loại giấy. "Giấy uỷ quyền" do khách
    # đưa và "Giấy uỷ quyền" do công ty soạn là hai thứ khác nhau hoàn toàn —
    # nối nhầm thì mọi Hạng mục tương lai nhận sai nguồn, và sửa một chỗ sẽ làm
    # hỏng chỗ kia.
    #
    # Chỉ dùng lại khi khớp: tên đã chuẩn hoá + nguồn + đang hoạt động. Khác
    # nguồn thì TỪ CHỐI tường minh để Giám đốc tự quyết, không tự nối và cũng
    # tuyệt đối không sửa mẫu cũ cho khớp.
    same_name_templates = db.execute(
        text("""
            select id, name, source, is_active, is_required, needs_original,
                   default_quantity, note
            from public.document_checklist_templates
            where lower(trim(name)) = lower(trim(:official_name))
            order by is_active desc
        """),
        {"official_name": official_name},
    ).mappings().all()

    matching_templates, mismatched_templates = [], []
    for template in same_name_templates:
        differences = _compare_template_configuration(
            template, source=source, quantity=quantity,
            required=required, needs_original=needs_original,
        )
        (matching_templates if not differences else mismatched_templates).append((template, differences))

    if matching_templates:
        template_id = matching_templates[0][0]["id"]
    elif mismatched_templates:
        template, differences = mismatched_templates[0]
        raise HTTPException(
            status_code=409,
            detail=(
                f"Đã có mẫu tên “{official_name}” nhưng cấu hình khác: "
                + "; ".join(differences)
                + ". Chọn mẫu sẵn có hoặc đặt tên chính thức khác."
            ),
        )
    else:
        template_id = None

    if not template_id:
        template_id = db.execute(
            text("""
                insert into public.document_checklist_templates
                    (id, task_type_id, name, source, is_required, needs_original,
                     default_quantity, sort_order, is_active)
                values (gen_random_uuid()::text, null, :official_name, :source, :required,
                        :needs_original, :quantity, 900, true)
                returning id
            """),
            {"official_name": official_name, "source": source, "required": required,
             "needs_original": needs_original, "quantity": quantity},
        ).scalar()

    db.execute(
        text("""
            insert into public.document_template_applicabilities
                (template_id, applicability_type, service_package_id, task_type_id,
                 is_default, created_by)
            values (:tpl, :loai, :goi, :dang, true, :actor)
            on conflict do nothing
        """),
        {
            "tpl": template_id,
            "loai": promotion_scope,
            "goi": service_line_context["service_package_id"] if promotion_scope == "PACKAGE" else None,
            "dang": service_line_context["task_type_id"] if promotion_scope == "TASK_TYPE" else None,
            "actor": actor_id,
        },
    )
    _audit(
        db, request_id, "DOCUMENT_TEMPLATE_PROMOTED", actor_id,
        f"phạm vi={promotion_scope} · mẫu={official_name}",
    )


def review_request(
    db: Session,
    request_id: str,
    *,
    decision: str,
    review_note: str | None,
    actor_id: str,
    approved_name: str | None = None,
    approved_quantity: int | None = None,
    approved_source: str | None = None,
    required_before_submit: bool | None = None,
    needs_director_approval: bool | None = None,
    promotion_scope: str | None = None,
) -> dict[str, Any]:
    """Giám đốc duyệt hoặc từ chối. Cả hai nhánh chạy trong một transaction có khoá.

    Duyệt lại một đề xuất đã duyệt trả về đúng kết quả cũ: ``created_slot_id`` đã
    có nên không sinh ô thứ hai, và các lệnh nối đều ``on conflict do nothing``.
    """
    if decision not in ("approved", "rejected", "needs_more"):
        raise HTTPException(
            status_code=422,
            detail="Quyết định phải là 'approved', 'rejected' hoặc 'needs_more'.",
        )

    request = _open_request(db, request_id, lock=True)

    # Duyệt lại: trả nguyên kết quả cũ, không làm gì thêm.
    if request["status"] == "approved":
        return {
            "id": request_id, "status": "approved",
            "slot_id": request["created_slot_id"], "linked": 0, "idempotent": True,
        }
    if request["status"] not in ("pending",):
        raise HTTPException(status_code=409, detail="Đề xuất chưa được gửi duyệt.")

    # ── Yêu cầu bổ sung ──────────────────────────────────────────────────────
    # KHÔNG phải từ chối: đề xuất vẫn sống, nhân viên sửa tên/thông tin, thêm
    # hoặc gỡ tệp rồi gửi lại chính phiếu đó — giữ nguyên dấu vết lần gửi trước.
    # Chưa tạo ô nào, chưa có gì vào hồ sơ chính thức.
    if decision == "needs_more":
        note = (review_note or "").strip()
        if not note:
            raise HTTPException(
                status_code=422,
                detail="Yêu cầu bổ sung thì phải ghi rõ cần bổ sung gì.",
            )
        db.execute(
            text("""
                update public.document_slot_creation_requests
                set status = 'needs_more', reviewed_by = :actor, reviewed_at = now(),
                    review_note = :note, updated_at = now()
                where id = :id
            """),
            {"id": request_id, "actor": actor_id, "note": note},
        )
        _audit(db, request_id, "DOCUMENT_SLOT_REQUEST_NEEDS_MORE", actor_id, note)
        return {"id": request_id, "status": "needs_more", "slot_id": None, "linked": 0}

    note = (review_note or "").strip() or None
    if decision == "rejected":
        if not note:
            raise HTTPException(status_code=422, detail="Từ chối thì phải ghi rõ lý do cho nhân viên.")
        db.execute(
            text("""
                update public.document_slot_creation_requests
                set status = 'rejected', reviewed_by = :actor, reviewed_at = now(),
                    review_note = :note, updated_at = now()
                where id = :id
            """),
            {"actor": actor_id, "note": note, "id": request_id},
        )
        _audit(db, request_id, "DOCUMENT_SLOT_REQUEST_REJECTED", actor_id, note)
        return {"id": request_id, "status": "rejected", "slot_id": None, "linked": 0}

    approved_name_text = (approved_name or "").strip() or request["proposed_name"]
    approved_quantity_value = int(approved_quantity or request["quantity"] or 1)

    # Nguồn chính thức: Giám đốc chốt, mặc định suy từ MÃ BƯỚC chứ không lấy giá
    # trị nhân viên đề xuất. Nguồn quyết định tài liệu nằm ngăn nào của hồ sơ nên
    # không thể để người nộp tự quyết.
    approved_source_value = (approved_source or "").strip() or default_source_for_node(
        db, request["task_node_id"]
    )
    if approved_source_value not in SOURCES:
        raise HTTPException(status_code=422, detail="Nguồn tài liệu không hợp lệ.")

    slot_id = db.execute(
        text("""
            insert into public.dossier_document_slots
                (scope, contract_id, service_line_id, template_id, name, source,
                 is_required, quantity, note, sort_order, updated_by)
            values ('SERVICE_LINE', :contract_id, :service_line_id, null, :name, :source,
                    :is_required, :quantity, :note, 900, :actor)
            returning id
        """),
        {
            "contract_id": request["contract_id"],
            "service_line_id": request["service_line_id"],
            "name": approved_name_text,
            "source": approved_source_value,
            "is_required": bool(required_before_submit),
            "quantity": max(1, approved_quantity_value),
            "note": "Phát sinh trong quá trình làm việc, Giám đốc đã duyệt.",
            "actor": actor_id,
        },
    ).scalar()

    # Nối TẤT CẢ tệp của đề xuất vào ô vừa tạo. Không upload lại, không copy:
    # object vẫn là object cũ, chỉ thêm quan hệ.
    linked = db.execute(
        text("""
            insert into public.dossier_document_links
                (contract_id, document_id, slot_id, linked_by)
            select d.contract_id, d.document_id, :slot_id, :actor
            from public.document_slot_creation_request_documents d
            where d.request_id = :request_id
            on conflict (document_id, slot_id) do nothing
            returning id
        """),
        {"slot_id": slot_id, "actor": actor_id, "request_id": request_id},
    ).fetchall()

    # Tệp cũng phải đếm được cho chính mục checklist đã sinh ra nó.
    db.execute(
        text("""
            insert into public.checklist_result_document_links
                (contract_id, checklist_result_id, document_id, created_by)
            select d.contract_id, :checklist_result_id, d.document_id, :actor
            from public.document_slot_creation_request_documents d
            where d.request_id = :request_id
            on conflict (checklist_result_id, document_id) do nothing
        """),
        {
            "checklist_result_id": request["checklist_result_id"],
            "actor": actor_id,
            "request_id": request_id,
        },
    )

    # ── Đưa vào bộ mẫu — CHỈ khi Giám đốc chủ động chọn phạm vi ──────────────
    # Mặc định (promotion_scope = None) là "chỉ Hạng mục hiện tại": ô vừa tạo ở
    # trên đã đủ, không ghi applicability nào.
    #
    # Không tự học, không tự lan. Một loại giấy xuất hiện nhiều lần chỉ là tín
    # hiệu để gợi ý cho người duyệt, không phải sự đồng ý của họ.
    _promote_template_by_scope(
        db,
        request=request,
        promotion_scope=promotion_scope,
        official_name=approved_name_text,
        source=approved_source_value,
        quantity=approved_quantity_value,
        required=bool(required_before_submit),
        needs_original=False,
        actor_id=actor_id,
        request_id=request_id,
    )

    # KHÔNG gán dossier_documents.dossier_id. Cột đó chỉ chứa được một giá trị
    # nên dùng nó là tự chặn việc một tệp phục vụ nhiều Hạng mục pháp lý. Tab Hồ
    # sơ Pháp lý nay đọc qua ô giấy của đúng Hạng mục (xem documents.list_documents),
    # nên chỉ cần link ở trên là tài liệu hiện ra đúng chỗ.

    db.execute(
        text("""
            update public.document_slot_creation_requests
            set status = 'approved', created_slot_id = :slot_id,
                approved_name = :name, approved_quantity = :quantity,
                approved_source = :source,
                required_before_submit = :required, needs_director_approval = :needs,
                reviewed_by = :actor, reviewed_at = now(), review_note = :note,
                updated_at = now()
            where id = :id
        """),
        {
            "slot_id": slot_id, "name": approved_name_text, "quantity": max(1, approved_quantity_value),
            "source": approved_source_value,
            "required": bool(required_before_submit),
            "needs": bool(needs_director_approval),
            "actor": actor_id, "note": note, "id": request_id,
        },
    )
    _audit(db, request_id, "DOCUMENT_SLOT_REQUEST_APPROVED", actor_id, f"slot={slot_id}")

    return {
        "id": request_id, "status": "approved", "slot_id": slot_id,
        "source": approved_source_value, "linked": len(linked), "idempotent": False,
    }


def _audit(db: Session, request_id: str, action: str, actor_id: str, note: str | None) -> None:
    """Ghi nhật ký; PostgreSQL cấp ``audit_log.id`` bằng sequence.

    ``actor_id`` có khoá ngoại tới ``users``: tra không ra thì cột buộc để null.
    Nhưng null RỖNG là đánh mất dấu người thao tác, nên id được giữ lại trong
    payload dưới khoá ``actor_id_missing``. Null KHÔNG kèm dấu mới là sự kiện hệ
    thống thật sự.

    Cả việc tra người dùng lẫn việc gắn dấu nằm trong MỘT câu lệnh: hai câu thì
    có khe cho người dùng bị xoá xen vào giữa, và tốn thêm một vòng tới database
    cho mỗi dòng nhật ký.
    """
    import json

    db.execute(
        text("""
            insert into public.audit_log
                (actor_id, action, object_type, object_id, payload_json, created_at)
            select
                (select u.id from public.users u where u.id = :actor),
                :action, 'document_slot_creation_request', :object_id,
                case
                  when :actor is not null
                   and not exists (select 1 from public.users u where u.id = :actor)
                  then cast(:payload as jsonb) || jsonb_build_object('actor_id_missing', :actor)
                  else cast(:payload as jsonb)
                end,
                now()
        """),
        {
            "actor": actor_id,
            "action": action,
            "object_id": request_id,
            "payload": json.dumps({"note": note} if note else {}, ensure_ascii=False),
        },
    )


def remove_file(
    db: Session, *, request_id: str, document_id: str, actor_id: str
) -> dict[str, Any]:
    """Bỏ một tệp khỏi đề xuất khi còn đang soạn.

    Chỉ gỡ QUAN HỆ, không xoá object và không xoá dòng dossier_documents. Tệp đã
    tải lên là một sự việc có thật; nhân viên đổi ý về việc dùng nó cho đề xuất
    này không làm nó biến mất khỏi lịch sử.
    """
    request = _open_request(db, request_id)
    if request["status"] not in ("draft", "rejected", "needs_more"):
        raise HTTPException(status_code=409, detail="Đề xuất đang chờ duyệt — không sửa được.")
    db.execute(
        text("""
            delete from public.document_slot_creation_request_documents
            where request_id = :request_id and document_id = :document_id
        """),
        {"request_id": request_id, "document_id": document_id},
    )

    # Tệp vừa rời đề xuất mà không thuộc ô giấy hay checklist nào thì nó là một
    # dòng DANG_DUNG mồ côi — và "đang dùng" là thứ các chỗ khác tin để cho dùng
    # lại. Hạ xuống DA_GO: object vẫn nằm nguyên trên kho để còn tra lại, nhưng
    # không ai nhặt nhầm nó vào hồ sơ nữa.
    con_lien_ket = db.execute(
        text("""
            select 1 from public.dossier_document_links
            where document_id = :id and link_status = 'DANG_DUNG'
            union all
            select 1 from public.checklist_result_document_links where document_id = :id
            union all
            select 1 from public.document_slot_creation_request_documents where document_id = :id
            limit 1
        """),
        {"id": document_id},
    ).first()
    if not con_lien_ket:
        db.execute(
            text("""
                update public.dossier_documents
                set doc_status = 'DA_GO'
                where id = :id and doc_status = 'DANG_DUNG'
            """),
            {"id": document_id},
        )
    _audit(db, request_id, "DOCUMENT_SLOT_REQUEST_FILE_REMOVED", actor_id, document_id)
    return {"request_id": request_id, "document_id": document_id, "removed": True}


_LIST_QUERY_TMPL = """
    select r.id, r.contract_id, r.service_line_id, r.task_node_id, r.checklist_result_id,
           r.proposed_name, r.approved_name, r.description, r.reason, r.source, __KIND__,
           r.quantity, r.approved_quantity, r.approved_source, r.status, r.created_slot_id,
           r.required_before_submit, r.needs_director_approval,
           r.review_note, r.reviewed_at, r.created_at,
           n.node_code, cr.checklist_name,
           coalesce(tt.name, sl.service_type) as service_line_name,
           u.username as requested_by_name,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'document_id', d.id, 'file_name', d.file_name,
                      'content_type', d.content_type, 'size_bytes', d.size_bytes
                    ) order by d.uploaded_at)
             from public.document_slot_creation_request_documents rd
             join public.dossier_documents d on d.id = rd.document_id
             where rd.request_id = r.id
           ), '[]'::jsonb) as files
    from public.document_slot_creation_requests r
    join public.task_nodes n on n.id = r.task_node_id
    join public.task_node_checklist_results cr on cr.id = r.checklist_result_id
    join public.service_lines sl on sl.id = r.service_line_id
    left join public.task_types tt on tt.id = sl.task_type_id
    left join public.users u on u.id = r.requested_by
"""


_CACHE_CO_KIND: dict[str, bool] = {}


def _has_kind_column(db: Session) -> bool:
    """``kind`` trên bảng đề xuất chỉ có từ đợt EXPAND.

    Đọc thẳng khi chưa có cột thì Hàng chờ duyệt của Giám đốc 500 toàn bộ —
    hỏng luôn cả phần legacy vốn không liên quan gì tới Sổ V2.
    """
    if "value" not in _CACHE_CO_KIND:
        if db.bind and db.bind.dialect.name == "sqlite":
            from sqlalchemy import inspect
            try:
                inspector = inspect(db.bind)
                columns = [c["name"] for c in inspector.get_columns("document_slot_creation_requests")]
                _CACHE_CO_KIND["value"] = "kind" in columns
            except Exception:
                _CACHE_CO_KIND["value"] = False
        else:
            _CACHE_CO_KIND["value"] = bool(db.execute(text("""
                select 1 from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'document_slot_creation_requests'
                  and column_name = 'kind'
            """)).first())
    return _CACHE_CO_KIND["value"]


def reset_kind_cache() -> None:
    _CACHE_CO_KIND.clear()


def _list_query(db: Session) -> str:
    # Chưa có cột thì mọi phiếu cũ đều là OUTPUT — đó là loại duy nhất tồn tại
    # trước khi luồng INPUT ra đời.
    return _LIST_QUERY_TMPL.replace(
        "__KIND__",
        "r.kind" if _has_kind_column(db) else "'OUTPUT'::varchar as kind",
    )


def list_requests(
    db: Session,
    *,
    checklist_result_id: str | None = None,
    status: str | None = None,
    only_requested_by: str | None = None,
) -> list[dict[str, Any]]:
    dieu_kien = []
    tham_so: dict[str, Any] = {}
    if checklist_result_id:
        dieu_kien.append("r.checklist_result_id = :checklist_result_id")
        tham_so["checklist_result_id"] = checklist_result_id
    if status:
        dieu_kien.append("r.status = :status")
        tham_so["status"] = status
    if only_requested_by:
        dieu_kien.append("r.requested_by = :requested_by")
        tham_so["requested_by"] = only_requested_by

    sql = _list_query(db)
    if dieu_kien:
        sql += " where " + " and ".join(dieu_kien)
    sql += " order by r.created_at desc"
    return [dict(row) for row in db.execute(text(sql), tham_so).mappings().all()]


def get_request(db: Session, request_id: str) -> dict[str, Any]:
    row = db.execute(
        text(_list_query(db) + " where r.id = :id"), {"id": request_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề xuất.")
    return dict(row)
