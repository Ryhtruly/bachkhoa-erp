from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import date

class CashflowIn(BaseModel):
    type: str                           # "INCOME" | "EXPENSE" or "Thu" | "Chi"
    amount: float
    category: str                       # Category code / label
    payer_payee: str
    payment_method: str                 # "CASH" | "BANK" or "Tiền mặt" | "Chuyển khoản"
    contract_id: Optional[str] = None
    project_id: Optional[str] = None
    department_code: Optional[str] = None
    description: Optional[str] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    status: Optional[str] = None
    transaction_date: Optional[str] = None
    scope: Optional[str] = "Công ty"

class CashflowUpdateIn(BaseModel):
    category: str
    payer_payee: str
    payment_method: str
    amount: float
    transaction_date: Optional[str] = None
    description: Optional[str] = ""
    notes: Optional[str] = ""
    contract_id: Optional[str] = None
    scope: Optional[str] = "Công ty"

class CashflowVoidIn(BaseModel):
    reason: str
    actor_id: str = "Admin"

class AdvanceCreateIn(BaseModel):
    project_id: Optional[str] = None
    contract_id: Optional[str] = None
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "Tiền mặt"

class AdvanceClearIn(BaseModel):
    advance_id: str          # ID of original advance voucher
    actual_amount: float     # Actual amount spent
    note: Optional[str] = ""

class FundCloseIn(BaseModel):
    payment_method: str       # "Tiền mặt" | "Chuyển khoản"
    actual_amount: float
    closing_date: str         # ISO string or YYYY-MM-DD HH:MM:SS
    notes: Optional[str] = ""
    closing_user: Optional[str] = ""

class WageCreateIn(BaseModel):
    project_id: str
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "Tiền mặt"

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
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[Literal["male", "female", "other"]] = None
    date_of_birth: Optional[date] = None
    place_of_birth: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Full name cannot be empty")
        return value

    @field_validator("user_id", "department_id", "job_title", "email", "phone", "place_of_birth", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        return value or None

class FinanceSettingsIn(BaseModel):
    initial_cash_balance: Optional[float] = 0.0
    initial_bank_balance: Optional[float] = 0.0
    initial_total_income: Optional[float] = 0.0
    initial_total_expenditure: Optional[float] = 0.0
    expense_approval_threshold: Optional[float] = None
    advance_admin_threshold: Optional[float] = None

class RefundExcessIn(BaseModel):
    amount: Optional[float] = None
    reason: Optional[str] = None

