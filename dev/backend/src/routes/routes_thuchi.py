from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from schemas.models import ThuchiCreateSchema
from src.db.database import get_db
from src.db.models import CashflowTransaction
from datetime import datetime
import uuid

router = APIRouter(prefix="/api", tags=["Tài Chính & Lương"])

@router.get("/thuchi")
def list_thuchi(db: Session = Depends(get_db)):
    try:
        transactions = db.query(CashflowTransaction).order_by(CashflowTransaction.created_at.desc()).all()
        result = []
        for t in transactions:
            result.append({
                "Mã phiếu": t.id,
                "Loại": t.type,
                "Ngày": t.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                "Mã hồ sơ": "",
                "Mã hợp đồng": "",
                "Diễn giải": "",
                "Phòng ban": "",
                "Người nộp/nhận": t.payer_payee,
                "Hình thức": t.payment_method,
                "Danh mục": t.category,
                "Thu (+)": t.amount if t.type == "Thu" else 0,
                "Chi (-)": t.amount if t.type == "Chi" else 0
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/thuchi")
def create_thuchi(payload: ThuchiCreateSchema, db: Session = Depends(get_db)):
    try:
        new_id = f"PC-{datetime.now().strftime('%m/%Y')}-{str(uuid.uuid4())[:6].upper()}"
        
        tc = CashflowTransaction(
            id=new_id,
            type=payload.Loại_Thu_Chi,
            amount=payload.Số_tiền,
            category=payload.Diễn_giải,
            payer_payee=payload.Người_nhận_Nộp,
            payment_method=payload.Hình_thức
        )
        db.add(tc)
        db.commit()
        return {"status": "success", "id": tc.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/luong")
def get_luong_khoan(month: str = "2026-03", db: Session = Depends(get_db)):
    try:
        # Simplistic stub: later we query KpiPayroll
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
