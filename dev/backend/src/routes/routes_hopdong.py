from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, Response
from sqlalchemy.orm import Session
from schemas.models import HopdongCreateSchema, ContractGenerateSchema
from src.db.database import get_db
from src.db.models import Contract, Customer, Receivable, ProjectTask
from services import telegram_service
from services.contract_read_service import (
    get_contract_cache_status,
    get_contract_hierarchy,
    get_contract_read_model,
    query_contract_read_model,
    sync_contract_read_model_after_write,
)
from core import doc_generator

router = APIRouter(prefix="/api/hopdong", tags=["Hợp Đồng"])


@router.get("/cache/status")
def contract_cache_status():
    return get_contract_cache_status()


@router.get("/")
def list_hopdong(
    response: Response,
    month: str = Query(None),
    date_signed: str = Query(None),
    search: str = Query(None),
    status: str = Query(None),
    service: str = Query(None),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    try:
        rows, source = get_contract_read_model(db)
        response.headers["X-Contract-Read-Source"] = source
        result = query_contract_read_model(
            rows,
            month=month,
            date_signed=date_signed,
            search=search,
            status=status,
            service=service,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        # Tương thích client cũ: không truyền page_size thì vẫn nhận mảng đầy đủ.
        return result if page_size > 0 else result["data"]
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
        sync_contract_read_model_after_write(db)
        
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
        sync_contract_read_model_after_write(db)
        
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
