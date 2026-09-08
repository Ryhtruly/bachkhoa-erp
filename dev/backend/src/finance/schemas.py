from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import date
from src.finance.enums import (
    normalize_transaction_type, normalize_payment_method, normalize_scope, normalize_status
)

class CashflowIn(BaseModel):
    type: str = "INCOME"                # "INCOME" | "EXPENSE" | "ADVANCE" | "REIMBURSEMENT"
    amount: float = Field(gt=0)
    category: str                       # Category code / label
    payer_payee: str
    payment_method: str = "CASH"        # "CASH" | "BANK_TRANSFER"
    contract_id: Optional[str] = None
    project_id: Optional[str] = None
    department_code: Optional[str] = None
    description: Optional[str] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    status: Optional[str] = None
    transaction_date: Optional[str] = None
    scope: Optional[str] = "COMPANY"

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v):
        return normalize_transaction_type(v)

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_pm(cls, v):
        return normalize_payment_method(v)

    @field_validator("scope", mode="before")
    @classmethod
    def normalize_sc(cls, v):
        return normalize_scope(v)

    @field_validator("status", mode="before")
    @classmethod
    def normalize_st(cls, v):
        return normalize_status(v) if v else None


class CashflowUpdateIn(BaseModel):
    category: str
    payer_payee: str
    payment_method: str = "CASH"
    amount: float = Field(gt=0)
    transaction_date: Optional[str] = None
    description: Optional[str] = ""
    notes: Optional[str] = ""
    contract_id: Optional[str] = None
    scope: Optional[str] = "COMPANY"

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_pm(cls, v):
        return normalize_payment_method(v)

    @field_validator("scope", mode="before")
    @classmethod
    def normalize_sc(cls, v):
        return normalize_scope(v)


class CashflowVoidIn(BaseModel):
    reason: str
    actor_id: str = "Admin"


class AdvanceCreateIn(BaseModel):
    # The public official-voucher endpoint requires this field.  It remains
    # optional here for old internal scripts that only construct the DTO;
    # route-level authorization rejects such payloads before persistence.
    request_id: Optional[str] = None
    project_id: Optional[str] = None
    contract_id: Optional[str] = None
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "CASH"

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_pm(cls, v):
        return normalize_payment_method(v)


class AdvanceRequestIn(BaseModel):
    project_id: Optional[str] = None
    contract_id: Optional[str] = None
    amount: float = Field(gt=0)
    note: str = Field(min_length=1, max_length=2000)
    payment_method: str = "CASH"

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Lý do tạm ứng không được để trống")
        return value

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_pm(cls, v):
        return normalize_payment_method(v)


class AdvanceClearIn(BaseModel):
    advance_id: str          # ID of original advance voucher
    actual_amount: float = Field(ge=0)     # Actual amount spent
    note: Optional[str] = ""


class FundCloseIn(BaseModel):
    payment_method: str = "CASH"      # "CASH" | "BANK_TRANSFER"
    actual_amount: float = Field(ge=0)
    closing_date: str                 # ISO string or YYYY-MM-DD HH:MM:SS
    notes: Optional[str] = ""
    closing_user: Optional[str] = ""

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_pm(cls, v):
        return normalize_payment_method(v)


class WageCreateIn(BaseModel):
    project_id: str
    amount: float = Field(gt=0)
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "CASH"

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_pm(cls, v):
        return normalize_payment_method(v)

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
    payroll_cycle_type: Optional[str] = "CALENDAR_MONTH"
    payroll_cutoff_day: Optional[int] = 1
    payroll_payment_day: Optional[int] = 5


class DocumentSignersIn(BaseModel):
    director_name: str = Field(default="Lê Văn Sáu", max_length=120)
    accountant_name: str = Field(default="", max_length=120)
    accountant_role: Literal["Kế toán trưởng", "Kế toán phụ trách"] = "Kế toán trưởng"
    cashier_name: str = Field(default="", max_length=120)
    payroll_accountant_name: str = Field(default="", max_length=120)

    @field_validator("director_name", "accountant_name", "cashier_name", "payroll_accountant_name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return str(value or "").strip()

class RefundExcessIn(BaseModel):
    amount: Optional[float] = None
    reason: Optional[str] = None

