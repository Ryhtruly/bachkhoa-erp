from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict

from src.db.database import get_db
from src.core.auth import require_permission, User
from src.db.models import TaskType, ServicePackage

router = APIRouter(prefix="/api/piece-rates", tags=["06. Piece Rates"])

DEFAULT_RATES_BY_ID = {
    'tt_001': (350000, 150000),  # Đo hiện trạng
    'tt_002': (300000, 120000),  # Cắm mốc
    'tt_003': (500000, 200000),  # Hoàn công – phần đo vẽ
    'tt_004': (450000, 180000),  # Cấp đổi – phần đo vẽ
    'tt_005': (400000, 160000),  # Hợp thửa – phần đo vẽ
    'tt_006': (450000, 180000),  # Tách thửa – phần đo vẽ
    'tt_007': (600000, 250000),  # Cấp sổ lần đầu – phần đo vẽ
    'tt_008': (500000, 200000),  # Chuyển mục đích – phần đo vẽ
    'tt_009': (350000, 150000),  # Xác định diện tích
    'tt_010': (1200000, 400000), # Hoàn công
    'tt_011': (800000, 300000),  # Cấp đổi
    'tt_012': (800000, 300000),  # Hợp thửa
    'tt_013': (1000000, 400000), # Tách thửa
    'tt_014': (1500000, 500000), # Cấp sổ lần đầu
    'tt_015': (1200000, 400000), # Chuyển mục đích
    'tt_016': (600000, 200000),  # Chuyển nhượng
    'tt_017': (600000, 200000),  # Tặng cho
    'tt_018': (1000000, 350000), # Thừa kế
    'tt_019': (500000, 200000),  # Gia hạn đất nông nghiệp
    'tt_020': (1500000, 500000), # Xin phép xây dựng mới
    'tt_021': (1000000, 350000), # Sửa chữa, cải tạo
    'tt_022': (600000, 200000),  # Gia hạn giấy phép xây dựng
}

# Runtime override store
_custom_piece_rates: Dict[str, Dict[str, float]] = {}

@router.get("/rates")
def list_piece_rates(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    task_types = db.query(TaskType).order_by(TaskType.id.asc()).all()
    packages = {sp.id: sp.name for sp in db.query(ServicePackage).all()}
    
    data = []
    for tt in task_types:
        def_main, def_supp = DEFAULT_RATES_BY_ID.get(tt.id, (500000.0, 200000.0))
        custom = _custom_piece_rates.get(tt.id, {})
        main_r = custom.get("main", def_main)
        supp_r = custom.get("support", def_supp)
        
        pkg_name = packages.get(tt.service_package_id, "Đo Đạc & Pháp Lý")
        
        data.append({
            "id": f"rate_{tt.id}",
            "task_type_id": tt.id,
            "task_type_name": tt.name or "",
            "task_name": tt.name or "",
            "package_name": pkg_name,
            "main_rate": float(main_r),
            "support_rate": float(supp_r),
            "main_rate_id": f"rate_{tt.id}_main",
            "support_rate_id": f"rate_{tt.id}_support"
        })
    return {"status": "success", "data": data}

class RateIn(BaseModel):
    task_type_id: str
    role: Optional[str] = "main"
    rate: float

@router.post("/rates")
def save_piece_rate(
    payload: RateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "update"))
):
    if payload.task_type_id not in _custom_piece_rates:
        def_m, def_s = DEFAULT_RATES_BY_ID.get(payload.task_type_id, (500000.0, 200000.0))
        _custom_piece_rates[payload.task_type_id] = {"main": def_m, "support": def_s}
    
    role_key = "support" if payload.role == "support" else "main"
    _custom_piece_rates[payload.task_type_id][role_key] = payload.rate
    return {"status": "success", "message": "Đã cập nhật đơn giá khoán thành công"}

@router.delete("/rates/{rate_id}")
def delete_piece_rate(
    rate_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "delete"))
):
    for tt_id in list(_custom_piece_rates.keys()):
        if tt_id in rate_id:
            _custom_piece_rates.pop(tt_id, None)
    return {"status": "success", "message": "Đã đặt lại đơn giá khoán mặc định"}
