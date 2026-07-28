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

from src.contracts.schemas import HopdongCreateSchema, ContractGenerateSchema

class ThuchiCreateSchema(BaseModel):
    Loại_Thu_Chi: str
    Mã_hồ_sơ: Optional[str] = "None"
    Mã_hợp_đồng: Optional[str] = "None"
    Diễn_giải: str
    Phòng_ban: str
    Người_nhận_Nộp: str
    Hình_thức: str
    Số_tiền: float

class StatusUpdateSchema(BaseModel):
    Mã_hồ_sơ: str
    Trạng_thái: str
