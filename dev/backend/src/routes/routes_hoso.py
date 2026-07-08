from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from src.db.database import get_db
from src.db.models import ProjectTask, Contract, Customer, User
import uuid
from datetime import datetime, date
from pydantic import BaseModel

router = APIRouter(prefix="/api/hoso", tags=["Hồ Sơ"])

@router.get("/stats")
def get_hoso_stats(db: Session = Depends(get_db)):
    total = db.query(ProjectTask).count()
    completed = db.query(ProjectTask).filter(ProjectTask.status == "Hoàn thành").count()
    in_progress = db.query(ProjectTask).filter(ProjectTask.status != "Hoàn thành").count()
    
    # Tính số hồ sơ trễ hạn
    today = date.today()
    overdue = db.query(ProjectTask).filter(
        ProjectTask.status != "Hoàn thành",
        ProjectTask.deadline < today
    ).count()

    return {
        "status": "success",
        "data": {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "overdue": overdue
        }
    }

@router.get("/")
def list_hoso(db: Session = Depends(get_db)):
    try:
        tasks = db.query(ProjectTask).order_by(ProjectTask.created_at.desc()).all()
        result = []
        today = date.today()
        
        for t in tasks:
            contract = db.query(Contract).filter(Contract.id == t.contract_id).first() if t.contract_id else None
            customer = db.query(Customer).filter(Customer.id == contract.customer_id).first() if contract and contract.customer_id else None
            
            assignee = db.query(User).filter(User.id == t.assignee_id).first() if t.assignee_id else None
            support = db.query(User).filter(User.id == t.support_id).first() if hasattr(t, 'support_id') and t.support_id else None
            
            days_left = None
            warning = "Chưa có deadline"
            if t.deadline:
                days_left = (t.deadline - today).days
                if t.status == "Hoàn thành":
                    warning = "Hoàn thành"
                elif days_left < 0:
                    warning = "Trễ hạn"
                elif days_left <= 2:
                    warning = "Sắp đến hạn"
                else:
                    warning = "Trong hạn"
            
            result.append({
                "Mã hồ sơ": t.id,
                "Tên khách hàng": customer.full_name if customer else "Khách vãng lai",
                "SĐT": customer.phone if customer else "",
                "Khu vực/Phường": customer.address if customer else "",
                "Loại dịch vụ": t.task_name or (contract.service_type if contract else "N/A"),
                "Mã hợp đồng": t.contract_id,
                "Phòng ban": getattr(t, 'department', '') or 'Kỹ thuật',
                "Ưu tiên": getattr(t, 'priority', 'Trung bình'),
                "Phụ trách chính": assignee.username if assignee else "Chưa phân công",
                "Hỗ trợ": support.username if support else "",
                "Deadline": t.deadline.strftime("%Y-%m-%d") if t.deadline else "",
                "Số ngày còn lại": days_left,
                "Cảnh báo": warning,
                "Trạng thái": t.status or "Mới tiếp nhận",
                "Ngày tạo": t.created_at.strftime("%Y-%m-%d") if t.created_at else ""
            })
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class HosoCreateSchema(BaseModel):
    Loại_dịch_vụ: str
    Deadline: str
    Trạng_thái: str = "Trong hạn"

class StatusUpdateSchema(BaseModel):
    Mã_hồ_sơ: str
    Trạng_thái: str

@router.post("/")
def create_hoso(payload: HosoCreateSchema, db: Session = Depends(get_db)):
    try:
        new_id = f"BK-HS-{str(uuid.uuid4())[:8].upper()}"
        try:
            d_dl = datetime.strptime(payload.Deadline, "%Y-%m-%d").date()
        except:
            d_dl = None
            
        t = ProjectTask(
            id=new_id,
            task_name=payload.Loại_dịch_vụ,
            deadline=d_dl,
            status=payload.Trạng_thái or "Mới tiếp nhận",
            priority="Cao"
        )
        db.add(t)
        db.commit()
        return {"status": "success", "id": new_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-status")
def update_hoso_status(payload: StatusUpdateSchema, db: Session = Depends(get_db)):
    try:
        task = db.query(ProjectTask).filter(ProjectTask.id == payload.Mã_hồ_sơ).first()
        if not task:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
            
        task.status = payload.Trạng_thái
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

