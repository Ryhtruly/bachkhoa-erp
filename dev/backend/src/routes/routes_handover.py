"""Node bàn giao (K08) — cổng công nợ, 2 làn Pháp lý / Kế toán."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, require_permission
from src.db.database import get_db
from src.db.models import User
from src.dossiers import handover as HO
from src.dossiers.actor_guard import assert_can_act_on_node, ghi_chu_xu_ly_thay

router = APIRouter(prefix="/api/handover", tags=["Handover"])


class PaymentSchema(BaseModel):
    amount: float
    receipt_photo_url: str
    payment_method: Optional[str] = "Tiền mặt"
    payer_name: Optional[str] = None
    note: Optional[str] = None


class DeliverSchema(BaseModel):
    # Nhân viên phải bấm xác nhận khi còn nợ — không chặn, nhưng có dấu vết.
    acknowledged_debt: bool = False
    note: Optional[str] = None
    # Chỉ giám đốc dùng, khi bấm nút "Xử lý thay".
    on_behalf_reason: Optional[str] = None


@router.get("/outstanding")
def list_outstanding(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read")),
):
    """Đã giao — chưa thu đủ. Màn hình chính của kế toán."""
    rows = HO.outstanding_handovers(db)
    return {
        "status": "success",
        "data": rows,
        "meta": {"total": len(rows), "total_remaining": sum(r["remaining"] for r in rows)},
    }


@router.get("/{task_node_id}")
def get_handover_state(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "read")),
):
    return {"status": "success", "data": HO.get_state(db, task_node_id, user_id=user.id)}


@router.post("/{task_node_id}/deliver")
def deliver(
    task_node_id: str,
    payload: DeliverSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "read")),
):
    """Làn A — xác nhận đã bàn giao tài liệu cho khách.

    Việc của NGƯỜI ĐƯỢC PHÂN CÔNG vào node bàn giao. Giám đốc chỉ xem; muốn làm
    thay phải đi lối "Xử lý thay" kèm lý do.
    """
    if not check_user_permission(db, user, "checklist", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền xác nhận bàn giao")

    actor = assert_can_act_on_node(
        db, task_node_id=task_node_id, user_id=user.id,
        on_behalf_reason=payload.on_behalf_reason,
        viec_gi="xác nhận bàn giao cho công việc này",
    )
    result = HO.mark_delivered(
        db, task_node_id,
        acknowledged_debt=payload.acknowledged_debt,
        note=ghi_chu_xu_ly_thay(actor, payload.note),
        actor_id=user.id,
    )
    db.commit()
    return {"status": "success", "data": {**result, "on_behalf": actor["on_behalf"]}}


@router.post("/{task_node_id}/payments")
def record_payment(
    task_node_id: str,
    payload: PaymentSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read")),
):
    """Làn B — ghi nhận một đợt khách đưa tiền. Phiếu vào trạng thái Chờ duyệt."""
    if not check_user_permission(db, user, "finance", "create"):
        raise HTTPException(status_code=403, detail="Không có quyền ghi nhận thu tiền")
    result = HO.record_payment(
        db, task_node_id,
        amount=payload.amount,
        receipt_photo_url=payload.receipt_photo_url,
        payment_method=payload.payment_method,
        payer_name=payload.payer_name,
        note=payload.note,
        actor_id=user.id,
    )
    db.commit()
    return {"status": "success", "data": result}
