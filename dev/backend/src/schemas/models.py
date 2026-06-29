from pydantic import BaseModel
from typing import Optional

class HosoCreateSchema(BaseModel):
    Tên_hồ_sơ: str
    Tên_khách_hàng: str
    SĐT: Optional[str] = ""
    Khu_vực_Phường: str
    Loại_dịch_vụ: str
    Phụ_trách_chính: str
    Hỗ_trợ: Optional[str] = "Không cần"
    Deadline: str
    Trạng_thái: Optional[str] = "Mới tiếp nhận"

class HopdongCreateSchema(BaseModel):
    Mã_hợp_đồng: str
    Mã_hồ_sơ: str
    Tên_khách_hàng: str
    Dịch_vụ: str
    Giá_trị_hợp_đồng: float
    Đã_thu: Optional[float] = 0.0
    Sale_nguồn: str
    Ghi_chú: Optional[str] = ""

class ContractGenerateSchema(BaseModel):
    SO_HOP_DONG: str
    MA_HO_SO: str
    TEN_KHACH_HANG: str
    SO_DIEN_THOAI: str
    KHACH_HANG_EMAIL: Optional[str] = ""
    LOAI_DICH_VU: str
    DIA_CHI: str
    GIA_TRI_HOP_DONG: float
    NGAY_KY: str
    NGAY_HET_HAN: str
    Sale_nguồn: str

class ThuchiCreateSchema(BaseModel):
    """Legacy schema — kept for backward compat"""
    Loại_Thu_Chi: str
    Mã_hồ_sơ: Optional[str] = ""
    Mã_hợp_đồng: Optional[str] = ""
    Diễn_giải: str
    Phòng_ban: str
    Người_nhận_Nộp: str
    Hình_thức: str
    Số_tiền: float

class CashflowCreateSchema(BaseModel):
    """Schema chuẩn — khớp DB model cashflow_transactions"""
    type: str                           # "Thu" | "Chi"
    amount: float
    category: str                       # Diễn giải / Danh mục
    payer_payee: str                    # Người nộp / nhận
    payment_method: str                 # "Tiền mặt" | "Chuyển khoản"
    contract_id: Optional[str] = None  # FK → contracts.id
    project_id: Optional[str] = None   # FK → projects_tasks.id

class StatusUpdateSchema(BaseModel):
    Mã_hồ_sơ: str
    Trạng_thái: str
