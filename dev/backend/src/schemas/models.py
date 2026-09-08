from pydantic import BaseModel
from typing import Optional
from src.contracts.schemas import ContractCreateSchema, ContractGenerateSchema

class TaskCreateSchema(BaseModel):
    task_name: str
    customer_name: str
    phone: Optional[str] = ""
    ward: str
    service_type: str
    assignee_id: str
    support_id: Optional[str] = None
    deadline: str
    status: Optional[str] = "Mới tiếp nhận"

class CashflowTransactionCreateSchema(BaseModel):
    transaction_type: str
    task_id: Optional[str] = None
    contract_id: Optional[str] = None
    description: str
    department: str
    payer_payee_name: str
    payment_method: str
    amount: float

class StatusUpdateSchema(BaseModel):
    task_id: str
    status: str
