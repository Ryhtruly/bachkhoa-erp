from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from src.db.database import get_db
from src.db.models import SalaryRate, SalaryItem, Employee, ProjectTask
from src.schemas.models import SalaryItemCreateSchema, SalaryRateUpdateSchema
from datetime import datetime
import uuid

router = APIRouter(prefix="/api/luong", tags=["Lương Khoán & Bảng Giá"])

# ─── QUẢN LÝ BẢNG GIÁ KHOÁN ───────────────────────────────────────────────────

@router.get("/rates")
def get_salary_rates(db: Session = Depends(get_db)):
    """Lấy bảng đơn giá khoán (Bảng 02)."""
    try:
        rates = db.query(SalaryRate).all()
        return {"status": "success", "data": [{
            "loai_dich_vu": r.loai_dich_vu,
            "don_gia_chu_tri": float(r.don_gia_chu_tri) if r.don_gia_chu_tri else 0,
            "don_gia_phu_do": float(r.don_gia_phu_do) if r.don_gia_phu_do else 0,
            "ghi_chu": r.ghi_chu or ""
        } for r in rates]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rates")
def save_salary_rate(payload: SalaryRateUpdateSchema, db: Session = Depends(get_db)):
    """Cập nhật hoặc thêm mới đơn giá khoán."""
    try:
        rate = db.query(SalaryRate).filter(SalaryRate.loai_dich_vu == payload.loai_dich_vu).first()
        if rate:
            rate.don_gia_chu_tri = payload.don_gia_chu_tri
            rate.don_gia_phu_do = payload.don_gia_phu_do
            rate.ghi_chu = payload.ghi_chu
        else:
            rate = SalaryRate(
                loai_dich_vu=payload.loai_dich_vu,
                don_gia_chu_tri=payload.don_gia_chu_tri,
                don_gia_phu_do=payload.don_gia_phu_do,
                ghi_chu=payload.ghi_chu
            )
            db.add(rate)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ─── QUẢN LÝ CHI TIẾT LƯƠNG KHOÁN (TỪNG HỒ SƠ) ────────────────────────────────

@router.get("/items")
def get_salary_items(month: str, employee_id: str = None, db: Session = Depends(get_db)):
    """Xem danh sách các mục khoán trong tháng."""
    try:
        q = db.query(SalaryItem).filter(SalaryItem.month == month)
        if employee_id:
            q = q.filter(SalaryItem.employee_id == employee_id)
            
        items = q.order_by(SalaryItem.created_at.desc()).all()
        result = []
        for item in items:
            emp = db.query(Employee).filter(Employee.id == item.employee_id).first()
            task = db.query(ProjectTask).filter(ProjectTask.id == item.task_id).first() if item.task_id else None
            
            result.append({
                "id": item.id,
                "nhan_vien": emp.full_name if emp else item.employee_id,
                "ma_ho_so": item.task_id or "",
                "ten_ho_so": task.ten_ho_so if task else "",
                "loai_ho_so": item.loai_ho_so or "",
                "vai_tro": item.vai_tro or "",
                "don_gia": float(item.don_gia) if item.don_gia else 0,
                "he_so": float(item.he_so) if item.he_so else 1,
                "thanh_tien": float(item.thanh_tien) if item.thanh_tien else 0,
                "ghi_chu": item.ghi_chu or ""
            })
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/items")
def create_salary_item(payload: SalaryItemCreateSchema, db: Session = Depends(get_db)):
    """Tính lương khoán cho 1 nhân viên trên 1 hồ sơ."""
    try:
        # Nếu không truyền đơn giá, tự động tra cứu trong SalaryRate
        don_gia = payload.don_gia
        if don_gia is None:
            rate = db.query(SalaryRate).filter(SalaryRate.loai_dich_vu == payload.loai_ho_so).first()
            if rate:
                if payload.vai_tro == "Phụ trách chính":
                    don_gia = float(rate.don_gia_chu_tri or 0)
                else:
                    don_gia = float(rate.don_gia_phu_do or 0)
            else:
                don_gia = 0
                
        he_so = payload.he_so if payload.he_so is not None else 1.0
        thanh_tien = don_gia * he_so
        
        item = SalaryItem(
            id=str(uuid.uuid4()),
            employee_id=payload.employee_id,
            task_id=payload.task_id,
            loai_ho_so=payload.loai_ho_so,
            vai_tro=payload.vai_tro,
            don_gia=don_gia,
            he_so=he_so,
            thanh_tien=thanh_tien,
            month=payload.month,
            ghi_chu=payload.ghi_chu
        )
        db.add(item)
        db.commit()
        return {"status": "success", "id": item.id, "thanh_tien": thanh_tien}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
