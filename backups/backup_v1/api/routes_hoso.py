from fastapi import APIRouter, HTTPException
from src.schemas.models import HosoCreateSchema, StatusUpdateSchema
from src.services import excel_adapter as excel_db

router = APIRouter(prefix="/api/hoso", tags=["Hồ Sơ"])

@router.get("/")
def list_hoso():
    try:
        hoso = excel_db.read_sheet("DATABASE_HOSO")
        hoso.reverse()
        return hoso
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_hoso(payload: HosoCreateSchema):
    try:
        hoso_data = {
            "Tên hồ sơ": payload.Tên_hồ_sơ,
            "Tên khách hàng": payload.Tên_khách_hàng,
            "SĐT": payload.SĐT,
            "Khu vực/Phường": payload.Khu_vực_Phường,
            "Loại dịch vụ": payload.Loại_dịch_vụ,
            "Phụ trách chính": payload.Phụ_trách_chính,
            "Hỗ trợ": payload.Hỗ_trợ,
            "Trạng thái": payload.Trạng_thái,
            "Deadline": payload.Deadline
        }
        success, next_id = excel_db.add_new_hoso(hoso_data)
        if success:
            return {"status": "success", "id": next_id}
        else:
            raise HTTPException(status_code=500, detail="Ghi hồ sơ vào Excel thất bại.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-status")
def update_hoso_status(payload: StatusUpdateSchema):
    try:
        success_hs, err_hs = excel_db.update_row_in_sheet(
            "DATABASE_HOSO", "Mã hồ sơ", payload.Mã_hồ_sơ, {"Trạng thái": payload.Trạng_thái}
        )
        excel_db.update_row_in_sheet(
            "DATABASE_TASK", "Mã hồ sơ", payload.Mã_hồ_sơ, {"Trạng thái": payload.Trạng_thái}
        )
        excel_db.update_row_in_sheet(
            "DODAC_TAC_NGHIEP", "Mã hồ sơ", payload.Mã_hồ_sơ, {"Trạng thái đo": payload.Trạng_thái}
        )
        
        if success_hs:
            return {"status": "success"}
        else:
            raise HTTPException(status_code=400, detail=f"Không tìm thấy hồ sơ hoặc lỗi: {err_hs}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
