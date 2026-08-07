from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import date

class CashflowIn(BaseModel):
    type: str                           # "INCOME" | "EXPENSE"
    amount: float
    category: str                       # Category code / description
    payer_payee: str
    payment_method: str                 # "CASH" | "BANK_TRANSFER"
    contract_id: Optional[str] = None
    project_id: Optional[str] = None
    department_code: Optional[str] = None
    description: Optional[str] = None
    is_pass_through_fee: bool = False
    # Accounting workflow fields
    created_by_user_id: Optional[str] = None
    approved_by_user_id: Optional[str] = None
    status: Optional[str] = None
    transaction_date: Optional[str] = None
    scope: Optional[str] = "INTERNAL"

class CashflowUpdateIn(BaseModel):
    category_code: str
    payer_payee_name: str
    payment_method: str
    amount: float
    transaction_date: Optional[str] = None
    description: Optional[str] = ""
    notes: Optional[str] = ""
    contract_id: Optional[str] = None
    scope: Optional[str] = "INTERNAL"

class CashflowVoidIn(BaseModel):
    reason: str
    actor_id: str = "Lê Văn Dựng"

class AdvanceCreateIn(BaseModel):
    project_id: Optional[str] = None
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "CASH"

class AdvanceClearIn(BaseModel):
    advance_id: str          # ID of original advance voucher
    actual_amount: float     # Actual expenditure amount from invoices
    note: Optional[str] = ""

class FundCloseIn(BaseModel):
    payment_method: str       # "CASH" | "BANK_TRANSFER"
    actual_amount: float
    close_datetime: str       # ISO string or YYYY-MM-DD HH:MM:SS
    notes: Optional[str] = ""
    closed_by: Optional[str] = ""

class WageCreateIn(BaseModel):
    project_id: str
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "CASH"

class EmployeeUpsertIn(BaseModel):
    full_name: str
    user_id: Optional[str] = None
    department_id: Optional[str] = None
    job_title: Optional[str] = None
    contract_status: Literal["Probation", "Official", "Terminated"] = "Probation"
    join_date: Optional[date] = None
    probation_end_date: Optional[date] = None
    base_salary: float = Field(default=0, ge=0)
    is_active: bool = True

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Họ và tên không được để trống")
        return value

    @field_validator("user_id", "department_id", "job_title", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        return value or None

class FinanceSettingsIn(BaseModel):
    initial_cash_balance: float = 0.0
    initial_bank_balance: float = 0.0
    initial_total_income: float = 0.0
    initial_total_expenditure: float = 0.0
