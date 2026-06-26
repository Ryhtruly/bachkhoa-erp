from fastapi import APIRouter, HTTPException
from src.schemas.models import ThuchiCreateSchema
from src.services import excel_adapter as excel_db

router = APIRouter(prefix="/api", tags=["Tài Chính & Lương"])

@router.get("/thuchi")
def list_thuchi():
    try:
        thuchi = excel_db.read_sheet("DATABASE_THU_CHI")
        thuchi.reverse()
        return thuchi
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/thuchi")
def create_thuchi(payload: ThuchiCreateSchema):
    try:
        tc_data = {
            "Mã phiếu": excel_db.get_next_id("DATABASE_THU_CHI", "PC-03/2026-", col_idx=2), 
            "Loại Thu/Chi": payload.Loại_Thu_Chi,
            "Mã hồ sơ": payload.Mã_hồ_sơ,
            "Mã hợp đồng": payload.Mã_hợp_đồng,
            "Diễn giải": payload.Diễn_giải,
            "Phòng ban": payload.Phòng_ban,
            "Người nhận/Nộp": payload.Người_nhận_Nộp,
            "Hình thức": payload.Hình_thức,
            "Số tiền": payload.Số_tiền
        }
        success, err = excel_db.add_new_thuchi(tc_data)
        if success:
            return {"status": "success", "id": tc_data["Mã phiếu"]}
        raise HTTPException(status_code=500, detail=f"Lỗi ghi thu chi: {err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/luong")
def get_luong_khoan(month: str = "2026-03"):
    try:
        records = excel_db.calculate_luong_khoan_report(month)
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
