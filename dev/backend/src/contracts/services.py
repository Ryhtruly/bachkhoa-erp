import uuid
from datetime import datetime
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.db.models import Contract, Customer, Receivable, AuditLog, User
from src.services import telegram_service
from src.core import doc_generator
from src.contracts.read_model import sync_contract_read_model_after_write

class ContractService:

    @staticmethod
    def create_contract(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            customer = db.query(Customer).filter(Customer.full_name == payload.Tên_khách_hàng).first()
            if not customer:
                customer = Customer(id=str(uuid.uuid4()), full_name=payload.Tên_khách_hàng)
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
            
            rec = Receivable(
                id=str(uuid.uuid4()),
                contract_id=new_hd.id,
                paid_amount=payload.Đã_thu,
                remaining_amount=payload.Giá_trị_hợp_đồng - payload.Đã_thu
            )
            db.add(rec)

            actor_exists = db.query(User.id).filter(User.id == actor_id).first() if actor_id else None
            actor_id_val = actor_id if actor_exists else None

            db.add(AuditLog(
                actor_id=actor_id_val,
                action="CREATE",
                object_type="Contract",
                payload_json={
                    "id": new_hd.id,
                    "customer": payload.Tên_khách_hàng,
                    "total_value": float(payload.Giá_trị_hợp_đồng)
                }
            ))
            
            db.commit()
            sync_contract_read_model_after_write(db)
            
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

    @staticmethod
    def generate_and_save_contract(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            contract_data = payload.model_dump()
            success_gen, download_url, full_path = doc_generator.generate_document(
                data=contract_data, 
                template_name="mau_hop_dong.docx", 
                output_prefix="HopDong"
            )
            
            if not success_gen:
                raise HTTPException(status_code=500, detail=f"Không thể xuất file Word: {download_url}")
                
            customer = db.query(Customer).filter(Customer.full_name == payload.TEN_KHACH_HANG).first()
            if not customer:
                customer = Customer(
                    id=str(uuid.uuid4()),
                    full_name=payload.TEN_KHACH_HANG,
                    phone=payload.SO_DIEN_THOAI,
                    address=payload.DIA_CHI
                )
                db.add(customer)
                db.flush()
                
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
            
            rec = Receivable(
                id=str(uuid.uuid4()),
                contract_id=new_hd.id,
                paid_amount=0.0,
                remaining_amount=payload.GIA_TRI_HOP_DONG
            )
            db.add(rec)
            
            actor_exists = db.query(User.id).filter(User.id == actor_id).first() if actor_id else None
            actor_id_val = actor_id if actor_exists else None

            db.add(AuditLog(
                actor_id=actor_id_val,
                action="GENERATE",
                object_type="Contract",
                payload_json={
                    "id": new_hd.id,
                    "customer": payload.TEN_KHACH_HANG,
                    "total_value": float(payload.GIA_TRI_HOP_DONG)
                }
            ))
                    
            db.commit()
            sync_contract_read_model_after_write(db)
            
            telegram_service.notify_new_contract({
                "Mã hợp đồng": new_hd.id,
                "Tên khách hàng": payload.TEN_KHACH_HANG,
                "Dịch vụ": payload.LOAI_DICH_VU,
                "Giá trị hợp đồng": payload.GIA_TRI_HOP_DONG
            })
            return {"status": "success", "download_url": download_url}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
