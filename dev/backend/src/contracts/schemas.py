from pydantic import BaseModel, Field
from typing import Optional

class ContractCreateSchema(BaseModel):
    contract_id: str = ""
    contract_template_id: str = Field(min_length=1, max_length=50)
    task_id: str
    customer_name: str
    service_type: str
    contract_value: float
    paid_amount: Optional[float] = 0.0
    sales_source: str
    notes: Optional[str] = ""

class ContractGenerateSchema(BaseModel):
    contract_id: str = ""
    contract_template_id: str = Field(min_length=1, max_length=50)
    task_id: Optional[str] = ""
    customer_name: str
    phone: str
    customer_email: Optional[str] = ""
    service_type: str
    # Khoá hạng mục — ưu tiên hơn tên. Cần thiết vì tên có thể trùng ("Tách thửa"
    # tồn tại ở cả gói Đo Vẽ lẫn Pháp Lý), nối bằng tên là chọn nhầm.
    task_type_id: Optional[str] = None
    # Độ ưu tiên hồ sơ (Q5) — chỉ giám đốc đặt HIGH/URGENT, kèm lý do.
    priority: Optional[str] = "NORMAL"
    priority_reason: Optional[str] = None
    # Định danh khách — 2 loại (anh Huy nhấn 18/08):
    #   individual: CCCD; business: mã số thuế + người đại diện.
    customer_type: Optional[str] = "individual"
    customer_id: Optional[str] = None          # chọn khách cũ → ghép theo id
    tax_id: Optional[str] = None               # doanh nghiệp
    id_card_number: Optional[str] = None        # cá nhân
    id_card_date: Optional[str] = None          # ISO
    id_card_place: Optional[str] = None
    email: Optional[str] = None
    zalo_phone: Optional[str] = None
    representative_name: Optional[str] = None    # doanh nghiệp
    representative_role: Optional[str] = None
    address: str
    contract_value: float
    date_signed: str
    due_date: str
    sales_source: str
