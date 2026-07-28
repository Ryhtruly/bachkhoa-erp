from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import date

class CashflowIn(BaseModel):
    type: str                           # "Thu" | "Chi"
    amount: float
    category: str                       # Dropdown: Hạng mục + Diễn giải
    payer_payee: str
    payment_method: str                 # "Tiền mặt" | "Chuyển khoản"
    contract_id: Optional[str] = None
    project_id: Optional[str] = None
    # Các trường kế toán nâng cao
    nguoi_lap: Optional[str] = None
    nguoi_duyet: Optional[str] = None
    trang_thai: Optional[str] = None
    ngay: Optional[str] = None
    scope: Optional[str] = "Công ty"

class CashflowUpdateIn(BaseModel):
    hang_muc: str
    nguoi_nhan_nop: str
    hinh_thuc: str
    so_tien: float
    ngay: Optional[str] = None
    dien_giai: Optional[str] = ""
    ghi_chu: Optional[str] = ""
    contract_id: Optional[str] = None
    scope: Optional[str] = "Công ty"

class CashflowVoidIn(BaseModel):
    reason: str
    actor_id: str = "Lê Văn Dựng"

class AdvanceCreateIn(BaseModel):
    project_id: Optional[str] = None
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "Tiền mặt"

class AdvanceClearIn(BaseModel):
    advance_id: str          # ID phiếu tạm ứng gốc
    actual_amount: float     # Số tiền thực chi từ hóa đơn
    note: Optional[str] = ""

class FundCloseIn(BaseModel):
    hinh_thuc: str            # "Tiền mặt" | "Chuyển khoản"
    so_tien_thuc_te: float
    ngay_chot: str            # ISO string or YYYY-MM-DD HH:MM:SS
    ghi_chu: Optional[str] = ""
    nguoi_chot: Optional[str] = ""

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
