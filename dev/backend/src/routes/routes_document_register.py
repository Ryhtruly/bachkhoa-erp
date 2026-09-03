"""Sổ giấy tờ hồ sơ — danh mục giấy tờ của hợp đồng và từng hạng mục."""

from typing import Optional

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, get_current_user, require_permission
from src.db.database import get_db
from src.db.models import User
from src.dossiers import register
from src.services.timeline_realtime import publish_timeline_change

router = APIRouter(prefix="/api/document-register", tags=["Document Register"])

# Cùng ngưỡng với kho giấy tờ hồ sơ — một bản scan giấy tờ nhà đất không có lý do
# gì vượt 25MB, và chặn sớm thì không tốn băng thông lẫn chỗ trên storage.
MAX_SCAN_BYTES = 25 * 1024 * 1024


def _can_work_on_contract(db: Session, user: User, contract_id: str) -> bool:
    """Ai đang giữ một bước của hợp đồng thì cập nhật được sổ giấy tờ của nó.

    Trước đây đòi quyền "contract:update" — quyền của quản lý. Nhưng K01 là bước
    rà soát giấy tờ mà Sale, Pháp lý hay Đo vẽ đều nhận được; nhân viên đo vẽ
    nhận K01 xong lại không điền nổi sổ thì cả cơ chế đứng.
    """
    if check_user_permission(db, user, "contract", "update"):
        return True
    return bool(db.execute(
        text("""
            select 1
            from public.task_node_assignments a
            join public.employees e on e.id = a.employee_id
            join public.task_nodes n on n.id = a.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where e.user_id = :user_id
              and coalesce(e.is_active, true)
              and a.assignment_status in ('proposed', 'assigned', 'accepted')
              and sl.contract_id = :contract_id
            limit 1
        """),
        {"user_id": user.id, "contract_id": contract_id},
    ).first())


def _contract_of_slot(db: Session, slot_id: str) -> Optional[str]:
    return db.execute(
        text("select contract_id from public.dossier_document_slots where id = :id"),
        {"id": slot_id},
    ).scalar()


def _require_can_work(db: Session, user: User, contract_id: Optional[str]) -> None:
    if not contract_id or not _can_work_on_contract(db, user, contract_id):
        raise HTTPException(
            status_code=403,
            detail="Bạn không giữ bước nào của hợp đồng này nên không sửa được sổ giấy tờ.",
        )


def _actor_department(db: Session, user_id: str) -> Optional[str]:
    return db.execute(
        text("""
            select d.code
            from public.employees e
            left join public.departments d on d.id = e.department_id
            where e.user_id = :user_id and coalesce(e.is_active, true)
            limit 1
        """),
        {"user_id": user_id},
    ).scalar()


class SlotUpdateSchema(BaseModel):
    status: Optional[str] = None
    copy_type: Optional[str] = None
    storage_location_id: Optional[str] = None
    quantity: Optional[int] = None
    note: Optional[str] = None


@router.get("/meta")
def get_register_meta(user: User = Depends(require_permission("contract", "read"))):
    """Nhãn tiếng Việt của nguồn giấy, trạng thái và loại bản — để UI khỏi tự chế."""
    return {
        "sources": [{"value": key, "label": label} for key, label in register.SOURCE_LABELS.items()],
        "statuses": [{"value": key, "label": register.STATUS_LABELS[key]} for key in register.SLOT_STATUSES],
        "copy_types": [{"value": key, "label": register.COPY_TYPE_LABELS[key]} for key in register.COPY_TYPES],
    }


@router.get("/register")
def get_contract_register(
    contract_id: str = Query(..., min_length=1),
    service_line_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Sổ giấy tờ nhìn từ một hạng mục — kèm luôn sổ gốc của hợp đồng.

    Ai tham gia quy trình đều xem được, Giám đốc cũng vậy: quyền chỉ cần "đọc
    hợp đồng", không phân biệt đo vẽ hay pháp lý. Đó là điểm của tài liệu
    chuyển giao — hai bên thấy giấy của nhau.
    """
    return register.get_register(db, contract_id, service_line_id=service_line_id)


@router.post("/contracts/{contract_id:path}/open")
def open_contract_register(
    contract_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Đổ sổ gốc từ bộ mẫu. Gọi lại nhiều lần không sinh trùng."""
    _require_can_work(db, user, contract_id)
    created = register.open_contract_register(db, contract_id, actor_id=user.id)
    db.commit()
    return {"status": "success", "data": {"created": created}}


@router.post("/service-lines/{service_line_id}/open")
def open_service_line_register(
    service_line_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    contract_id = db.execute(
        text("select contract_id from public.service_lines where id = :id"),
        {"id": service_line_id},
    ).scalar()
    _require_can_work(db, user, contract_id)
    created = register.open_service_line_register(db, service_line_id, actor_id=user.id)
    db.commit()
    return {"status": "success", "data": {"created": created}}


@router.patch("/slots/{slot_id}")
def update_slot(
    slot_id: str,
    payload: SlotUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Đánh dấu đã nhận / đã ký / bản chính hay sao / nơi lưu bản cứng."""
    _require_can_work(db, user, _contract_of_slot(db, slot_id))
    result = register.update_slot(
        db,
        slot_id,
        actor_id=user.id,
        actor_department=_actor_department(db, user.id),
        status=payload.status,
        copy_type=payload.copy_type,
        storage_location_id=payload.storage_location_id,
        quantity=payload.quantity,
        note=payload.note,
    )
    db.commit()
    publish_timeline_change("document_slot_updated", entity_id=slot_id)
    return {"status": "success", "data": result}


class ChangeRequestSchema(BaseModel):
    reason: str


class ChangeReviewSchema(BaseModel):
    decision: str
    review_note: Optional[str] = None


class SourceDocumentLinkSchema(BaseModel):
    document_id: str


@router.post("/slots/{slot_id}/change-requests")
def request_slot_change(
    slot_id: str,
    payload: ChangeRequestSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Xin sửa tài liệu chuyển giao của bộ phận khác."""
    result = register.request_slot_change(
        db, slot_id, reason=payload.reason, requester_id=user.id
    )
    db.commit()
    publish_timeline_change("document_slot_change_requested", entity_id=slot_id)
    return {"status": "success", "data": result}


@router.post("/change-requests/{request_id}/review")
def review_slot_change(
    request_id: str,
    payload: ChangeReviewSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "approve")),
):
    """Giám đốc duyệt — mở khoá ô giấy trong 24 giờ rồi tự đóng lại."""
    result = register.review_slot_change(
        db, request_id, decision=payload.decision,
        review_note=payload.review_note, actor_id=user.id,
    )
    db.commit()
    publish_timeline_change("document_slot_change_reviewed", entity_id=request_id)
    return {"status": "success", "data": result}


@router.get("/change-requests")
def list_pending_change_requests(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "approve")),
):
    """Hàng chờ duyệt của Giám đốc."""
    # ``kind`` và ``service_line_id`` trên phiếu cùng xuất hiện ở đợt EXPAND
    # của Sổ V2. Giữ đường đọc tương thích schema cũ để danh sách duyệt tài
    # liệu legacy không bị 500 trước cửa sổ triển khai.
    co_v2 = register._co_cot_waiver_service_line(db)
    thong_tin_phieu = (
        "r.kind, coalesce(r.service_line_id, s.service_line_id) as service_line_id"
        if co_v2
        else "'EDIT'::varchar as kind, s.service_line_id"
    )
    rows = db.execute(
        text(f"""
            select r.id, r.slot_id, r.reason, r.created_at,
                   s.name as slot_name, s.source, s.contract_id,
                   {thong_tin_phieu},
                   -- service_lines KHÔNG có cột name. Tên Hạng mục lấy từ Dạng
                   -- hồ sơ, lùi về service_type khi chưa gắn — viết sl.name làm
                   -- cả hàng chờ duyệt 500, kể cả phần legacy không liên quan.
                   coalesce(tt.name, sl.service_type) as service_line_name,
                   u.username as requested_by_name
            from public.document_slot_change_requests r
            join public.dossier_document_slots s on s.id = r.slot_id
            left join public.service_lines sl
              on sl.id = {"coalesce(r.service_line_id, s.service_line_id)" if co_v2 else "s.service_line_id"}
            left join public.task_types tt on tt.id = sl.task_type_id
            left join public.users u on u.id = r.requested_by
            where r.status = 'pending'
            order by r.created_at
        """)
    ).mappings().all()
    return {"status": "success", "data": [dict(row) for row in rows]}


# ── Miễn một loại giấy cho ĐÚNG MỘT Hạng mục ────────────────────────────────
#
# Mọi endpoint dưới đây đi qua require_v2_schema() — một cổng dùng chung, không
# để mỗi route tự kiểm một kiểu rồi chỗ nhớ chỗ quên. Khi schema chưa migrate,
# API trả 503 kèm thông báo nghiệp vụ để frontend hiện được câu tử tế, thay vì
# đẩy "Internal Server Error" vào mặt người dùng.


class WaiverRequestSchema(BaseModel):
    # service_line_id nhận từ client nhưng KHÔNG được tin: server tự đối chiếu
    # ô giấy có thuộc hợp đồng của Hạng mục này không, và Hạng mục có phải là
    # chủ của ô (khi ô thuộc phạm vi Hạng mục) không.
    service_line_id: str
    reason: str


class WaiverReviewSchema(BaseModel):
    decision: str
    review_note: str | None = None


@router.post("/slots/{slot_id}/waivers")
def request_slot_waiver(
    slot_id: str,
    payload: WaiverRequestSchema,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Nhân viên xin bỏ một loại giấy khỏi ĐÚNG Hạng mục đang làm.

    Không dùng ``contract:read`` làm cổng: đó là quyền ĐỌC. Xin miễn là quyết
    định nghiệp vụ trên hồ sơ, phải là người đang thực sự làm Hạng mục đó — hoặc
    Giám đốc. Việc kiểm nằm trong ``request_slot_waiver`` để cổng và nghiệp vụ
    không tách rời nhau.

    Không sửa mẫu, không xoá ô, không đụng Hạng mục khác của cùng hợp đồng.
    """
    register.require_v2_schema(db)
    result = register.request_slot_waiver(
        db, slot_id,
        service_line_id=payload.service_line_id,
        reason=payload.reason,
        requester_id=user.id,
        la_quan_tri=check_user_permission(db, user, "task_node", "approve"),
    )
    db.commit()
    publish_timeline_change("document_slot_waiver_requested", entity_id=slot_id)
    return {"status": "success", "data": result}


@router.post("/waivers/{request_id}/review")
def review_slot_waiver(
    request_id: str,
    payload: WaiverReviewSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "approve")),
):
    """Giám đốc duyệt hoặc từ chối. Từ chối = nhân viên phải đi lấy bằng được."""
    register.require_v2_schema(db)
    result = register.review_slot_change(
        db, request_id, decision=payload.decision,
        review_note=payload.review_note, actor_id=user.id,
    )
    db.commit()
    publish_timeline_change("document_slot_waiver_reviewed", entity_id=request_id)
    return {"status": "success", "data": result}


@router.post("/slots/{slot_id}/waivers/revoke")
def revoke_slot_waiver(
    slot_id: str,
    payload: WaiverRequestSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "approve")),
):
    """Đòi lại giấy đã miễn. Ô quay lại điều kiện bắt buộc NGAY.

    Không xoá phiếu cũ — đánh dấu đã rút, để lịch sử còn đủ cả hai chiều.
    """
    register.require_v2_schema(db)
    result = register.revoke_slot_waiver(
        db, slot_id, service_line_id=payload.service_line_id, actor_id=user.id
    )
    db.commit()
    publish_timeline_change("document_slot_waiver_revoked", entity_id=slot_id)
    return {"status": "success", "data": result}


@router.get("/service-lines/{service_line_id}/waivers")
def list_service_line_waivers(
    service_line_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Trạng thái miễn giấy của ĐÚNG Hạng mục này — không lẫn Hạng mục khác."""
    register.require_v2_schema(db)
    rows = db.execute(
        text("""
            select r.id, r.slot_id, r.status, r.reason, r.review_note,
                   r.reviewed_at, r.revoked_at, r.created_at,
                   s.name as slot_name, s.source, s.is_required,
                   nv.username as requested_by_name,
                   gd.username as reviewed_by_name
            from public.document_slot_change_requests r
            join public.dossier_document_slots s on s.id = r.slot_id
            left join public.users nv on nv.id = r.requested_by
            left join public.users gd on gd.id = r.reviewed_by
            where r.kind = 'WAIVE' and r.service_line_id = :sl
            order by r.created_at desc
        """),
        {"sl": service_line_id},
    ).mappings().all()
    return {"status": "success", "data": [dict(row) for row in rows]}


@router.post("/slots/{slot_id}/scans")
async def attach_slot_scan(
    slot_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Nạp bản scan vào một ô giấy — tự xếp vào thư mục của đúng loại giấy."""
    _require_can_work(db, user, _contract_of_slot(db, slot_id))
    data = await file.read(MAX_SCAN_BYTES + 1)
    try:
        result = register.attach_scan(
            db,
            slot_id,
            file_name=file.filename or "tai-lieu",
            content_type=file.content_type,
            data=data,
            actor_id=user.id,
            actor_department=_actor_department(db, user.id),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_timeline_change("document_slot_scanned", entity_id=slot_id)
    return {"status": "success", "data": result}


class ApplicabilityIn(BaseModel):
    applicability_type: str
    service_package_id: Optional[str] = None
    task_type_id: Optional[str] = None
    node_code: Optional[str] = None
    is_default: bool = True


class ApplicabilitiesIn(BaseModel):
    items: list[ApplicabilityIn] = []


@router.put("/templates/{template_id}/applicabilities")
def set_template_applicabilities(
    template_id: str,
    payload: ApplicabilitiesIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "update")),
):
    """Khai trọn phạm vi cho một loại giấy VỪA TẠO: Gói · Hạng mục · Node.

    Gửi lên là ảnh chụp trạng thái cuối — server thay toàn bộ phạm vi cũ trong
    một giao dịch. Vì vậy chỉ dùng cho mẫu mới, khi chưa có bản ghi nào để đè.
    Sửa một bản ghi của mẫu đã có thì dùng PUT .../applicabilities/{id}.
    """
    count = register.replace_applicabilities(
        db,
        template_id,
        [scope.model_dump() for scope in payload.items],
        actor_id=user.id,
    )
    db.commit()
    return {"status": "success", "data": {"template_id": template_id, "count": count}}


@router.post("/templates/{template_id}/applicabilities")
def add_template_applicabilities(
    template_id: str,
    payload: ApplicabilitiesIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "update")),
):
    """Gán loại giấy ĐÃ CÓ vào phạm vi mới, giữ nguyên phạm vi cũ.

    Khác PUT ở chỗ không xoá gì. Va vào phạm vi đã gán thì 409 nêu rõ, để Giám
    đốc biết là phải sang đúng hạng mục đó bấm Sửa.
    """
    count = register.add_applicabilities(
        db,
        template_id,
        [scope.model_dump() for scope in payload.items],
        actor_id=user.id,
    )
    db.commit()
    return {"status": "success", "data": {"template_id": template_id, "count": count}}


class ApplicabilityNodeIn(BaseModel):
    node_code: Optional[str] = None
    is_default: bool = True


@router.put("/templates/{template_id}/applicabilities/{applicability_id}")
def set_applicability_node(
    template_id: str,
    applicability_id: str,
    payload: ApplicabilityNodeIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "update")),
):
    """Đổi bước của ĐÚNG MỘT bản ghi gán.

    Mỗi bản ghi là một nhánh độc lập Gói → Hạng mục → Nhóm → Node → Loại giấy.
    Sửa nhánh này phải để yên nhánh kia, kể cả khi cùng một loại giấy — nên ghi
    theo id của dòng chứ không gửi lại cả cụm.
    """
    result = register.update_applicability(
        db, template_id, applicability_id,
        node_code=payload.node_code, is_default=payload.is_default,
    )
    db.commit()
    return {"status": "success", "data": result}


@router.delete("/templates/{template_id}/applicabilities/{applicability_id}")
def delete_applicability(
    template_id: str,
    applicability_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "update")),
):
    """Gỡ một bản ghi gán — loại giấy thôi áp dụng cho nhánh đó, vẫn còn ở nhánh khác."""
    result = register.remove_applicability(db, template_id, applicability_id)
    db.commit()
    return {"status": "success", "data": result}


@router.get("/workflow-nodes")
def list_workflow_nodes(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("contract", "read")),
):
    """Danh mục bước đang bật, để màn Mẫu Giấy Tờ dựng ô chọn Node."""
    rows = db.execute(
        text("""
            select code, name, description from public.workflow_nodes
            where coalesce(is_active, true) order by code
        """)
    ).mappings().all()
    return {"status": "success", "data": [dict(row) for row in rows]}


@router.post("/contracts/{contract_id:path}/source-documents")
async def upload_source_document(
    contract_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "create")),
):
    """Đổ giấy khách đưa vào KHO NGUỒN của Hợp đồng — chưa cần biết là giấy gì.

    Phân loại là việc của K01. Ép chọn ô giấy ngay lúc tiếp nhận là bắt người
    nhận giấy đoán, đoán sai thì file nằm nhầm chỗ.
    """
    # Đây là thao tác tiếp nhận ngay trong form Hợp đồng, trước khi K01 được
    # phân công. Sale hoặc Giám đốc đều dùng được khi có quyền tạo Hợp đồng;
    # không hard-code tên vai trò.
    data = await file.read(MAX_SCAN_BYTES + 1)
    try:
        result = register.upload_source_document(
            db,
            contract_id=contract_id,
            file_name=file.filename or "tai-lieu",
            content_type=file.content_type,
            data=data,
            actor_id=user.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_timeline_change("contract_source_document_added", entity_id=contract_id)
    return {"status": "success", "data": result}


@router.get("/contracts/{contract_id:path}/source-documents")
def list_source_documents(
    contract_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Kho nguồn của Hợp đồng — K01 mở ra để đọc và phân loại."""
    rows = db.execute(
        text("""
            select d.id, d.file_name, d.content_type, d.size_bytes, d.uploaded_at,
                   d.doc_status, u.username as uploaded_by_name,
                   coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'id', s.id, 'name', s.name,
                              'scope', s.scope, 'service_line_id', s.service_line_id
                            ) order by s.sort_order, s.name)
                     from public.dossier_document_links l
                     join public.dossier_document_slots s on s.id = l.slot_id
                     where l.document_id = d.id and l.link_status = 'DANG_DUNG'
                   ), '[]'::jsonb) as slots
            from public.dossier_documents d
            left join public.users u on u.id = d.uploaded_by
            where d.contract_id = :contract_id and d.scope = 'CONTRACT'
              and d.doc_status <> 'DA_GO'
            order by d.uploaded_at desc
        """),
        {"contract_id": contract_id},
    ).mappings().all()
    return {
        "status": "success",
        "data": [dict(row) for row in rows],
        "unclassified": sum(1 for row in rows if not row["slots"]),
    }


@router.post("/slots/{slot_id}/links")
def link_source_document(
    slot_id: str,
    payload: SourceDocumentLinkSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    _require_can_work(db, user, _contract_of_slot(db, slot_id))
    result = register.link_source_document(
        db, slot_id, payload.document_id, actor_id=user.id
    )
    db.commit()
    publish_timeline_change("source_document_linked", entity_id=slot_id)
    return {"status": "success", "data": result}


@router.delete("/slots/{slot_id}/links/{document_id}")
def unlink_source_document(
    slot_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    _require_can_work(db, user, _contract_of_slot(db, slot_id))
    result = register.unlink_source_document(
        db, slot_id, document_id, actor_id=user.id
    )
    db.commit()
    publish_timeline_change("source_document_unlinked", entity_id=slot_id)
    return {"status": "success", "data": result}


@router.get("/service-lines/{service_line_id}/k01-status")
def get_k01_status(
    service_line_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    status = register.k01_blockers(db, service_line_id)
    _require_can_work(db, user, status["contract_id"])
    return {"status": "success", "data": status}


@router.get("/scans/{document_id}/download")
def download_slot_scan(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Bucket là private nên đọc qua máy chủ, không phát link trực tiếp."""
    row, body = register.read_scan(db, document_id)
    return Response(
        content=body,
        media_type=row["content_type"] or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename*=UTF-8\'\'{quote(row["file_name"])}',
            "Cache-Control": "private, max-age=60",
        },
    )


class NewSlotSchema(BaseModel):
    name: str
    source: str
    service_line_id: Optional[str] = None
    needs_original: bool = False
    quantity: int = 1
    note: Optional[str] = None


@router.get("/suggestions")
def suggest_slot_names(
    q: str = Query("", max_length=120),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Gợi ý tên giấy từ bộ mẫu — để tên tự gõ không trôi mỗi người một kiểu."""
    return {"status": "success", "data": register.suggest_slot_names(db, query=q)}


@router.post("/contracts/{contract_id:path}/slots")
def add_slot(
    contract_id: str,
    payload: NewSlotSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Giấy tờ phát sinh ngoài mẫu — nhân viên tự thêm mục ngay khi gặp."""
    _require_can_work(db, user, contract_id)
    result = register.add_slot(
        db,
        contract_id=contract_id,
        service_line_id=payload.service_line_id,
        name=payload.name,
        source=payload.source,
        actor_id=user.id,
        needs_original=payload.needs_original,
        quantity=payload.quantity,
        note=payload.note,
    )
    db.commit()
    publish_timeline_change("document_slot_added", entity_id=contract_id)
    return {"status": "success", "data": result}


@router.delete("/slots/{slot_id}")
def remove_slot(
    slot_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    _require_can_work(db, user, _contract_of_slot(db, slot_id))
    result = register.remove_slot(db, slot_id, actor_id=user.id)
    db.commit()
    return {"status": "success", "data": result}


@router.get("/contracts/{contract_id:path}/custom-slots")
def list_custom_slots(
    contract_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Các mục nhân viên tự thêm — Giám đốc soi khi duyệt nghiệm thu."""
    return {"status": "success", "data": register.list_custom_slots(db, contract_id)}


@router.post("/slots/{slot_id}/promote")
def promote_slot(
    slot_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "approve")),
):
    """Đưa mục phát sinh vào bộ mẫu — lần sau nó là giấy tờ chuẩn của thủ tục."""
    result = register.promote_slot_to_template(db, slot_id, actor_id=user.id)
    db.commit()
    return {"status": "success", "data": result}


class TemplateSchema(BaseModel):
    id: Optional[str] = None
    task_type_id: Optional[str] = None
    name: str
    source: str
    is_required: bool = True
    needs_original: bool = False
    default_quantity: int = 1
    sort_order: int = 100
    note: Optional[str] = None
    is_active: bool = True


class StorageLocationSchema(BaseModel):
    id: Optional[str] = None
    name: str
    kind: str = "TAI_CHO"
    sort_order: int = 100
    implies_status: Optional[str] = None


@router.get("/storage-locations")
def list_storage_locations(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Danh mục nơi lưu bản cứng — thay cho ô gõ tay."""
    return {"status": "success", "data": register.list_storage_locations(db)}


@router.post("/storage-locations")
def upsert_storage_location(
    payload: StorageLocationSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "approve")),
):
    result = register.upsert_storage_location(
        db, location_id=payload.id, name=payload.name,
        kind=payload.kind, sort_order=payload.sort_order,
        implies_status=payload.implies_status,
    )
    db.commit()
    return {"status": "success", "data": result}


@router.delete("/storage-locations/{location_id}")
def deactivate_storage_location(
    location_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "approve")),
):
    result = register.deactivate_storage_location(db, location_id)
    db.commit()
    return {"status": "success", "data": result}


@router.get("/checklist-options")
def checklist_options(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "create")),
):
    """Các loại giấy khách cung cấp để tick chọn ngay trong form soạn hợp đồng.

    Endpoint riêng thay vì dùng /templates: màn cấu hình mẫu đòi quyền
    workflow:read, mà người soạn hợp đồng chưa chắc có quyền đó — họ chỉ cần
    đọc đúng danh sách để chọn, không cần quyền vào màn cấu hình.
    """
    return {"status": "success", "data": register.checklist_options(db)}


@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "read")),
):
    """Bộ mẫu giấy tờ theo từng Dạng hồ sơ — màn cấu hình của Giám đốc."""
    return {"status": "success", "data": register.list_templates(db)}


@router.post("/templates")
def upsert_template(
    payload: TemplateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "approve")),
):
    result = register.upsert_template(
        db,
        template_id=payload.id,
        task_type_id=payload.task_type_id,
        name=payload.name,
        source=payload.source,
        is_required=payload.is_required,
        needs_original=payload.needs_original,
        default_quantity=payload.default_quantity,
        sort_order=payload.sort_order,
        note=payload.note,
        is_active=payload.is_active,
    )
    db.commit()
    return {"status": "success", "data": result}


@router.delete("/templates/{template_id}")
def deactivate_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "approve")),
):
    """Tắt mục khỏi mẫu — không xoá, vì hồ sơ đang chạy vẫn trỏ vào nó."""
    result = register.deactivate_template(db, template_id)
    db.commit()
    return {"status": "success", "data": result}
