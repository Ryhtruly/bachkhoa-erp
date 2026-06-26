from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from schemas.models import HopdongCreateSchema, ContractGenerateSchema
from src.db.database import get_db
from src.db.models import Contract, Customer, Receivable, ProjectTask
from services import telegram_service
from core import doc_generator

router = APIRouter(prefix="/api/hopdong", tags=["Hợp Đồng"])

@router.get("/")
def list_hopdong(db: Session = Depends(get_db)):
    try:
        contracts = db.query(Contract).order_by(Contract.created_at.desc()).all()
        result = []
        for c in contracts:
            customer = db.query(Customer).filter(Customer.id == c.customer_id).first() if c.customer_id else None
            receivable = db.query(Receivable).filter(Receivable.contract_id == c.id).first()
            task = db.query(ProjectTask).filter(ProjectTask.contract_id == c.id).first()
            
            paid = receivable.paid_amount if receivable else 0
            debt = c.total_value - paid if c.total_value else 0
            
            result.append({
                "Mã hợp đồng": c.id,
                "Mã hồ sơ": task.id if task else "",
                "Tên khách hàng": customer.full_name if customer else "N/A",
                "Phòng ban": "Phòng Đo đạc",
                "Dịch vụ": c.service_type,
                "Ngày ký": c.date_signed.strftime("%Y-%m-%d") if c.date_signed else "",
                "Giá trị hợp đồng": c.total_value,
                "Đã thu": paid,
                "Còn nợ": debt,
                "Sale / nguồn": "", # Can map to Lead
                "Tình trạng": "Đã tất toán" if debt <= 0 else "Chờ thanh toán",
                "Ghi chú": "",
                "File Hợp đồng": c.file_link or ""
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_hopdong(payload: HopdongCreateSchema, db: Session = Depends(get_db)):
    try:
        # Create or find customer (simplified for now, ideally find by name/phone)
        customer = db.query(Customer).filter(Customer.full_name == payload.Tên_khách_hàng).first()
        if not customer:
            from uuid import uuid4
            customer = Customer(id=str(uuid4()), full_name=payload.Tên_khách_hàng)
            db.add(customer)
            db.flush()
            
        new_hd = Contract(
            id=payload.Mã_hợp_đồng,
            customer_id=customer.id,
            service_type=payload.Dịch_vụ,
            total_value=payload.Giá_trị_hợp_đồng,
            date_signed=datetime.now().date()
        )
        db.add(new_hd)
        
        # Link project task if provided
        if payload.Mã_hồ_sơ:
            task = db.query(ProjectTask).filter(ProjectTask.id == payload.Mã_hồ_sơ).first()
            if task:
                task.contract_id = new_hd.id
        
        # Receivable
        from uuid import uuid4
        rec = Receivable(
            id=str(uuid4()),
            contract_id=new_hd.id,
            paid_amount=payload.Đã_thu,
            remaining_amount=payload.Giá_trị_hợp_đồng - payload.Đã_thu
        )
        db.add(rec)
        
        db.commit()
        
        # Telegram
        telegram_service.notify_new_contract({
            "Mã hợp đồng": new_hd.id,
            "Tên khách hàng": payload.Tên_khách_hàng,
            "Dịch vụ": payload.Dịch_vụ,
            "Giá trị hợp đồng": payload.Giá_trị_hợp_đồng
        })
        return {"status": "success", "id": new_hd.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate")
def generate_and_save_contract(payload: ContractGenerateSchema, db: Session = Depends(get_db)):
    try:
        contract_data = payload.model_dump()
        success_gen, download_url, full_path = doc_generator.generate_contract(contract_data)
        
        if not success_gen:
            raise HTTPException(status_code=500, detail=f"Không thể xuất file Word: {download_url}")
            
        customer = db.query(Customer).filter(Customer.full_name == payload.TEN_KHACH_HANG).first()
        if not customer:
            from uuid import uuid4
            customer = Customer(id=str(uuid4()), full_name=payload.TEN_KHACH_HANG, phone=payload.SO_DIEN_THOAI, address=payload.DIA_CHI)
            db.add(customer)
            db.flush()
            
        # parse date
        try:
            d_signed = datetime.strptime(payload.NGAY_KY, "%Y-%m-%d").date()
        except:
            d_signed = datetime.now().date()
            
        new_hd = Contract(
            id=payload.SO_HOP_DONG,
            customer_id=customer.id,
            service_type=payload.LOAI_DICH_VU,
            total_value=payload.GIA_TRI_HOP_DONG,
            date_signed=d_signed,
            file_link=download_url
        )
        db.add(new_hd)
        
        from uuid import uuid4
        rec = Receivable(
            id=str(uuid4()),
            contract_id=new_hd.id,
            paid_amount=0.0,
            remaining_amount=payload.GIA_TRI_HOP_DONG
        )
        db.add(rec)
        
        if payload.MA_HO_SO:
            task = db.query(ProjectTask).filter(ProjectTask.id == payload.MA_HO_SO).first()
            if task:
                task.contract_id = new_hd.id
                
        db.commit()
        
        telegram_service.notify_new_contract({
            "Mã hợp đồng": new_hd.id,
            "Tên khách hàng": payload.TEN_KHACH_HANG,
            "Dịch vụ": payload.LOAI_DICH_VU,
            "Giá trị hợp đồng": payload.GIA_TRI_HOP_DONG
        })
        return {"status": "success", "download_url": download_url}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
