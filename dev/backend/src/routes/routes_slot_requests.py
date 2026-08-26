"""Đề xuất thêm loại tài liệu phát sinh — endpoint cho nhân viên và Giám đốc.

Mọi id ngữ cảnh (contract_id, service_line_id, task_node_id) đều SUY TỪ
``checklist_result_id`` phía máy chủ. Client không có đường bơm giá trị nào vào,
kể cả khi sửa payload.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, get_current_user
from src.db.database import get_db
from src.db.models import Employee, User
from src.dossiers import slot_requests
from src.services.timeline_realtime import publish_timeline_change

router = APIRouter(prefix="/api/slot-requests", tags=["Document Slot Requests"])
logger = logging.getLogger(__name__)

MAX_REQUEST_FILE_BYTES = 25 * 1024 * 1024


class NewRequestIn(BaseModel):
    checklist_result_id: str
    proposed_name: str
    reason: str
    source: str = "CONG_TY"
    description: str | None = None
    quantity: int = 1
    kind: str = "OUTPUT"


class UpdateRequestIn(BaseModel):
    proposed_name: str
    reason: str
    source: str
    description: str | None = None
    quantity: int = 1


class ReviewIn(BaseModel):
    decision: str
    review_note: str | None = None
    approved_name: str | None = None
    approved_quantity: int | None = None
    approved_source: str | None = None
    required_before_submit: bool = False
    needs_director_approval: bool = False
    # None = chỉ Hạng mục hiện tại. Giám đốc phải CHỦ ĐỘNG chọn phạm vi rộng hơn;
    # không có chuyện đề xuất tự biến thành mẫu dùng chung khi duyệt.
    promotion_scope: str | None = None


def _employee(db: Session, user: User) -> Employee:
    employee = (
        db.query(Employee)
        .filter(Employee.user_id == user.id, Employee.is_active == True)
        .first()
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ nhân sự.")
    return employee


def _require_assigned(db: Session, user: User, checklist_result_id: str) -> None:
    """Chỉ người ĐƯỢC GIAO mới đề xuất được trên mục checklist đó.

    Không kiểm thì ai cũng đoán được id một mục checklist rồi tạo đề xuất lên hồ
    sơ của Hạng mục người khác.
    """
    employee = _employee(db, user)
    duoc_giao = db.execute(
        text("""
            select 1
            from public.task_node_checklist_results r
            join public.task_node_assignments a on a.task_node_id = r.task_node_id
            where r.id = :id and a.employee_id = :employee_id
              and a.assignment_status not in ('replaced', 'declined', 'cancelled')
            union all
            select 1
            from public.task_node_checklist_assignments ca
            where ca.checklist_result_id = :id and ca.employee_id = :employee_id
              and ca.status not in ('replaced', 'cancelled')
            limit 1
        """),
        {"id": checklist_result_id, "employee_id": employee.id},
    ).first()
    if not duoc_giao:
        raise HTTPException(status_code=403, detail="Bạn không được phân công cho công việc này.")


def _require_editable(db: Session, user: User, request_id: str) -> dict:
    """Chủ đề xuất, VÀ đề xuất còn sửa được.

    Khoá theo trạng thái áp cho CẢ Giám đốc: sửa tập tệp của một đề xuất đang chờ
    duyệt là đổi thứ nhân viên đã gửi mà họ không biết. Muốn đổi thì từ chối kèm
    lý do để nhân viên sửa và gửi lại — có dấu vết, có người chịu trách nhiệm.
    """
    request = _require_owner(db, user, request_id)
    if request["status"] not in ("draft", "rejected", "needs_more"):
        raise HTTPException(
            status_code=409,
            detail=(
                "Đề xuất đang chờ duyệt — không sửa được. Giám đốc từ chối kèm lý do "
                "thì mới sửa tiếp."
                if request["status"] == "pending"
                else "Đề xuất đã được duyệt — không sửa được nữa."
            ),
        )
    return request


def _require_owner(db: Session, user: User, request_id: str) -> dict:
    """Chủ đề xuất, hoặc Giám đốc. Người khác không đụng vào được."""
    row = db.execute(
        text("""
            select id, status, requested_by, contract_id, checklist_result_id
            from public.document_slot_creation_requests where id = :id
        """),
        {"id": request_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề xuất.")
    if row["requested_by"] != user.id and not check_user_permission(db, user, "task_node", "approve"):
        raise HTTPException(status_code=403, detail="Đề xuất này không phải của bạn.")
    return dict(row)


def _require_director(db: Session, user: User) -> None:
    if not check_user_permission(db, user, "task_node", "approve"):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được duyệt đề xuất.")


@router.post("")
def create_slot_request(
    payload: NewRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_assigned(db, user, payload.checklist_result_id)
    try:
        result = slot_requests.create_request(
            db,
            checklist_result_id=payload.checklist_result_id,
            proposed_name=payload.proposed_name,
            reason=payload.reason,
            source=payload.source,
            description=payload.description,
            quantity=payload.quantity,
            kind=payload.kind,
            actor_id=user.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"status": "success", "data": result}


@router.patch("/{request_id}")
def update_slot_request(
    request_id: str,
    payload: UpdateRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_editable(db, user, request_id)
    try:
        result = slot_requests.update_request(
            db,
            request_id,
            proposed_name=payload.proposed_name,
            description=payload.description,
            reason=payload.reason,
            source=payload.source,
            quantity=payload.quantity,
            actor_id=user.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"status": "success", "data": result}


@router.post("/{request_id}/documents")
async def add_request_document(
    request_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Tải một tệp vào đề xuất. Tệp có thật ngay, nhưng chưa vào hồ sơ chính thức."""
    _require_editable(db, user, request_id)
    data = await file.read(MAX_REQUEST_FILE_BYTES + 1)
    try:
        result = slot_requests.add_file(
            db,
            request_id=request_id,
            file_name=file.filename or "tai-lieu",
            content_type=file.content_type,
            data=data,
            actor_id=user.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"status": "success", "data": result}


@router.delete("/{request_id}/documents/{document_id}")
def remove_request_document(
    request_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bỏ một tệp khỏi đề xuất khi còn đang soạn."""
    _require_editable(db, user, request_id)
    try:
        result = slot_requests.remove_file(
            db, request_id=request_id, document_id=document_id, actor_id=user.id
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"status": "success", "data": result}


@router.post("/{request_id}/submit")
def submit_slot_request(
    request_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_editable(db, user, request_id)
    try:
        result = slot_requests.submit_request(db, request_id, actor_id=user.id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_timeline_change("document_slot_request_submitted", entity_id=request_id)
    return {"status": "success", "data": result}


@router.post("/{request_id}/review")
def review_slot_request(
    request_id: str,
    payload: ReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Giám đốc duyệt hoặc từ chối. Cả nhánh duyệt chạy trong MỘT transaction.

    Lỗi giữa chừng thì ``db.rollback()`` cuốn theo cả ô giấy vừa tạo — không để
    lại ô mồ côi mà đề xuất vẫn "chờ duyệt".
    """
    _require_director(db, user)
    try:
        result = slot_requests.review_request(
            db,
            request_id,
            decision=payload.decision,
            review_note=payload.review_note,
            actor_id=user.id,
            approved_name=payload.approved_name,
            approved_quantity=payload.approved_quantity,
            approved_source=payload.approved_source,
            required_before_submit=payload.required_before_submit,
            needs_director_approval=payload.needs_director_approval,
            promotion_scope=payload.promotion_scope,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_timeline_change("document_slot_request_reviewed", entity_id=request_id)
    return {"status": "success", "data": result}


@router.get("")
def list_slot_requests(
    checklist_result_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hai góc nhìn trên cùng một bảng.

    Nhân viên xem đề xuất của một mục checklist mình đang làm; Giám đốc xem hàng
    chờ duyệt toàn hệ thống. Không truyền gì mà không phải Giám đốc thì chỉ thấy
    đề xuất của chính mình — không có cửa dò đề xuất người khác.
    """
    la_giam_doc = check_user_permission(db, user, "task_node", "approve")
    if checklist_result_id:
        _require_assigned(db, user, checklist_result_id) if not la_giam_doc else None
    elif not la_giam_doc:
        checklist_result_id = None

    return {
        "status": "success",
        "data": slot_requests.list_requests(
            db,
            checklist_result_id=checklist_result_id,
            status=status_filter,
            only_requested_by=None if la_giam_doc else user.id,
        ),
    }


@router.get("/{request_id}")
def get_slot_request(
    request_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_owner(db, user, request_id)
    return {"status": "success", "data": slot_requests.get_request(db, request_id)}
