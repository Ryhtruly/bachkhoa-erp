from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from schemas.models import ThuchiCreateSchema
from src.db.database import get_db
from src.db.models import CashflowTransaction
from src.core.auth import require_permission, User
from datetime import datetime
import uuid

router = APIRouter(prefix="/api", tags=["Tài Chính & Lương"])

@router.get("/thuchi")
def list_thuchi(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    try:
        transactions = db.query(CashflowTransaction).order_by(CashflowTransaction.created_at.desc()).all()
        result = []
        for t in transactions:
            result.append({
                "Mã phiếu": t.id,
                "Loại": getattr(t, 'transaction_type', getattr(t, 'loai', None)),
                "Ngày": t.created_at.strftime("%Y-%m-%d %H:%M:%S") if t.created_at else "",
                "Mã hồ sơ": "",
                "Mã hợp đồng": "",
                "Diễn giải": getattr(t, 'description', getattr(t, 'dien_giai', '')),
                "Phòng ban": "",
                "Người nộp/nhận": getattr(t, 'payer_payee_name', getattr(t, 'nguoi_nhan_nop', '')),
                "Hình thức": getattr(t, 'payment_method', getattr(t, 'hinh_thuc', '')),
                "Danh mục": getattr(t, 'category_code', getattr(t, 'hang_muc', '')),
                "Thu (+)": getattr(t, 'amount', getattr(t, 'so_tien', 0)) if getattr(t, 'transaction_type', t.loai) in ["Thu", "INCOME"] else 0,
                "Chi (-)": getattr(t, 'amount', getattr(t, 'so_tien', 0)) if getattr(t, 'transaction_type', t.loai) in ["Chi", "EXPENSE"] else 0
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/thuchi")
def create_thuchi(
    payload: ThuchiCreateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "create"))
):
    try:
        new_id = f"PC-{datetime.now().strftime('%m/%Y')}-{str(uuid.uuid4())[:6].upper()}"
        
        tc = CashflowTransaction(
            id=new_id,
            loai=payload.Loại_Thu_Chi,
            so_tien=payload.Số_tiền,
            dien_giai=payload.Diễn_giải,
            nguoi_nhan_nop=payload.Người_nhận_Nộp,
            hinh_thuc=payload.Hình_thức
        )
        db.add(tc)
        db.commit()
        return {"status": "success", "id": tc.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/luong")
def get_luong_khoan(
    month: str = "2026-03",
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    try:
        # Simplistic stub: later we query KpiPayroll
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

