from pydantic import BaseModel
from typing import Optional

class ContractCreateSchema(BaseModel):
    contract_id: str = ""
    task_id: str
    customer_name: str
    service_type: str
    contract_value: float
    paid_amount: Optional[float] = 0.0
    sales_source: str
    notes: Optional[str] = ""

class ContractGenerateSchema(BaseModel):
    contract_id: str = ""
    task_id: Optional[str] = ""
    customer_name: str
    phone: str
    customer_email: Optional[str] = ""
    service_type: str
    address: str
    contract_value: float
    date_signed: str
    due_date: str
    sales_source: str
