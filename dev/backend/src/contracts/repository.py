from sqlalchemy.orm import Session
from src.db.models import Contract, Customer, ServiceLine, Receivable
from typing import Optional

class ContractRepository:

    @staticmethod
    def get_contract_by_id(db: Session, contract_id: str) -> Optional[Contract]:
        return db.query(Contract).filter(Contract.id == contract_id).first()

    @staticmethod
    def get_customer_by_name(db: Session, name: str) -> Optional[Customer]:
        return db.query(Customer).filter(Customer.full_name == name).first()

    @staticmethod
    def get_service_line_by_id(db: Session, service_line_id: str) -> Optional[ServiceLine]:
        return db.query(ServiceLine).filter(ServiceLine.id == service_line_id).first()
