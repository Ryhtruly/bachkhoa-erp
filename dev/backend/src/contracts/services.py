import uuid
import re
from datetime import datetime
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from src.db.models import (
    AuditLog,
    Contract,
    Customer,
    Receivable,
    ServiceLine,
    ServicePackage,
    TaskType,
    User,
)
from src.services import telegram_service
from src.core import doc_generator
from src.contracts.read_model import sync_contract_read_model_after_write


CONTRACT_CODE_PATTERN = re.compile(r"^(?P<sequence>\d+)/BK-\d{4}$")


def next_contract_code(contract_ids, *, year: int | None = None) -> str:
    """Return the next global contract sequence with a minimum width of three."""
    highest_sequence = max((
        int(match.group("sequence"))
        for contract_id in contract_ids
        if (match := CONTRACT_CODE_PATTERN.match((contract_id or "").strip()))
    ), default=0)
    return f"{highest_sequence + 1:03d}/BK-{year or datetime.now().year}"


def _create_initial_service_line(
    db: Session,
    *,
    contract_id: str,
    service_type: str,
    price: float,
    address: str | None = None,
) -> ServiceLine:
    """Create the first contract item from the create-contract form."""
    normalized_service = (service_type or "").strip()
    task_type = None
    service_package = None
    if normalized_service:
        task_type = (
            db.query(TaskType)
            .filter(func.lower(TaskType.name) == normalized_service.lower())
            .first()
        )
        if task_type and task_type.service_package_id:
            service_package = (
                db.query(ServicePackage)
                .filter(ServicePackage.id == task_type.service_package_id)
                .first()
            )

    service_line = ServiceLine(
        id=str(uuid.uuid4()),
        contract_id=contract_id,
        service_package_id=task_type.service_package_id if task_type else None,
        service_package=service_package.name if service_package else None,
        task_type_id=task_type.id if task_type else None,
        service_type=task_type.name if task_type else normalized_service,
        target_property=address or None,
        property_address=address or None,
        price=price,
    )
    db.add(service_line)
    return service_line


class ContractService:

    @staticmethod
    def get_next_contract_code(db: Session) -> str:
        if db.bind and db.bind.dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(:lock_key)"),
                {"lock_key": 2_026_081_201},
            )
        contract_ids = (contract_id for contract_id, in db.query(Contract.id).all())
        return next_contract_code(contract_ids)

    @staticmethod
    def create_contract(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            cust_name = payload.customer_name
            contract_id = (payload.contract_id or "").strip() or ContractService.get_next_contract_code(db)
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

            service_line = _create_initial_service_line(
                db,
                contract_id=new_hd.id,
                service_type=service_type,
                price=contract_val,
            )
            
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
            return {
                "status": "success",
                "id": new_hd.id,
                "service_line_id": service_line.id,
            }
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def generate_and_save_contract(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            contract_id = (payload.contract_id or "").strip() or ContractService.get_next_contract_code(db)
            contract_data = payload.model_dump()
            contract_data["contract_id"] = contract_id
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

            service_line = _create_initial_service_line(
                db,
                contract_id=new_hd.id,
                service_type=service_type,
                price=contract_val,
                address=address,
            )
            
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
            return {
                "status": "success",
                "id": new_hd.id,
                "service_line_id": service_line.id,
                "download_url": download_url,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
