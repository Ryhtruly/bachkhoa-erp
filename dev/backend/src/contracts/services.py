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
            cust_name = payload.customer_name
            contract_id = payload.contract_id
            service_type = payload.service_type
            contract_val = float(payload.contract_value or 0)
            paid_val = float(payload.paid_amount or 0)

            customer = db.query(Customer).filter(Customer.full_name == cust_name).first()
            if not customer:
                customer = Customer(id=str(uuid.uuid4()), full_name=cust_name)
                db.add(customer)
                db.flush()
                
            new_hd = Contract(
                id=contract_id,
                customer_id=customer.id,
                service_type=service_type,
                total_value=contract_val,
                date_signed=datetime.now().date()
            )
            db.add(new_hd)
            
            rec = Receivable(
                id=str(uuid.uuid4()),
                contract_id=new_hd.id,
                paid_amount=paid_val,
                remaining_amount=contract_val - paid_val
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
                    "customer": cust_name,
                    "total_value": contract_val
                }
            ))
            
            db.commit()
            sync_contract_read_model_after_write(db)
            
            telegram_service.notify_new_contract({
                "contract_id": new_hd.id,
                "customer_name": cust_name,
                "service_type": service_type,
                "contract_value": contract_val
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
                output_prefix="Contract"
            )
            
            if not success_gen:
                raise HTTPException(status_code=500, detail=f"Cannot generate Word document: {download_url}")
                
            cust_name = payload.customer_name
            phone = payload.phone
            address = payload.address
            contract_id = payload.contract_id
            service_type = payload.service_type
            contract_val = float(payload.contract_value or 0)
            date_signed_str = payload.date_signed

            customer = db.query(Customer).filter(Customer.full_name == cust_name).first()
            if not customer:
                customer = Customer(
                    id=str(uuid.uuid4()),
                    full_name=cust_name,
                    phone=phone,
                    address=address
                )
                db.add(customer)
                db.flush()
                
            try:
                d_signed = datetime.strptime(date_signed_str, "%Y-%m-%d").date()
            except Exception:
                d_signed = datetime.now().date()
                
            new_hd = Contract(
                id=contract_id,
                customer_id=customer.id,
                service_type=service_type,
                total_value=contract_val,
                date_signed=d_signed,
                file_link=download_url
            )
            db.add(new_hd)
            
            rec = Receivable(
                id=str(uuid.uuid4()),
                contract_id=new_hd.id,
                paid_amount=0.0,
                remaining_amount=contract_val
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
                    "customer": cust_name,
                    "total_value": contract_val
                }
            ))
                    
            db.commit()
            sync_contract_read_model_after_write(db)
            
            telegram_service.notify_new_contract({
                "contract_id": new_hd.id,
                "customer_name": cust_name,
                "service_type": service_type,
                "contract_value": contract_val
            })
            return {"status": "success", "download_url": download_url}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
