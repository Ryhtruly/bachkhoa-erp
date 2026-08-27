from pydantic import BaseModel, Field
from typing import Optional

class ContractCreateSchema(BaseModel):
    contract_id: str = ""
    contract_template_id: str = Field(min_length=1, max_length=50)
    task_id: str
    customer_name: str
    customer_id: Optional[str] = None
    code: Optional[str] = None
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
    # Bộ giấy của Hạng mục, khai TƯỜNG MINH bằng chế độ.
    #
    # Không dùng "thiếu field" để biểu diễn mặc định: như thế thì frontend lỗi,
    # client cũ, hay một field quên gửi đều trông giống hệt "người dùng chọn bộ
    # mặc định" — và Hạng mục ra đời với bộ giấy chẳng ai quyết định.
    #   DEFAULT -> server tự lấy applicability is_default = true
    #   CUSTOM  -> phải kèm document_template_ids, tối thiểu một mã
    #   NONE    -> danh sách rỗng hoặc vắng; Hạng mục không thu giấy nào
    document_selection_mode: Optional[str] = None
    document_template_ids: Optional[list[str]] = None
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
