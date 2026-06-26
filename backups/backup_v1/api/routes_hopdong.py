from fastapi import APIRouter, HTTPException
from datetime import datetime
from src.schemas.models import HopdongCreateSchema, ContractGenerateSchema
from src.services import excel_adapter as excel_db
from src.services import telegram_service
from src.core import doc_generator

router = APIRouter(prefix="/api/hopdong", tags=["Hợp Đồng"])

@router.get("/")
def list_hopdong():
    try:
        hopdong = excel_db.read_sheet("DATABASE_HOP_DONG")
        hopdong.reverse()
        return hopdong
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_hopdong(payload: HopdongCreateSchema):
    try:
        hd_data = {
            "Mã hợp đồng": payload.Mã_hợp_đồng,
            "Mã hồ sơ": payload.Mã_hồ_sơ,
            "Tên khách hàng": payload.Tên_khách_hàng,
            "Phòng ban": "Phòng Đo đạc",
            "Dịch vụ": payload.Dịch_vụ,
            "Ngày ký": datetime.now().strftime("%Y-%m-%d"),
            "Giá trị hợp đồng": payload.Giá_trị_hợp_đồng,
            "Đã thu": payload.Đã_thu,
            "Sale / nguồn": payload.Sale_nguồn,
            "Ghi chú": payload.Ghi_chú
        }
        success, next_id = excel_db.add_new_hopdong(hd_data)
        if success:
            # Send Telegram notification
            hd_data["Mã hợp đồng"] = next_id
            telegram_service.notify_new_contract(hd_data)
            return {"status": "success", "id": next_id}
            
        raise HTTPException(status_code=500, detail="Thất bại khi ghi hợp đồng.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate")
def generate_and_save_contract(payload: ContractGenerateSchema):
    try:
        contract_data = payload.model_dump()
        success_gen, download_url, full_path = doc_generator.generate_contract(contract_data)
        
        if not success_gen:
            raise HTTPException(status_code=500, detail=f"Không thể xuất file Word: {download_url}")
            
        hd_data = {
            "Mã hợp đồng": payload.SO_HOP_DONG,
            "Mã hồ sơ": payload.MA_HO_SO,
            "Tên khách hàng": payload.TEN_KHACH_HANG,
            "Phòng ban": "Phòng Đo đạc",
            "Dịch vụ": payload.LOAI_DICH_VU,
            "Ngày ký": payload.NGAY_KY,
            "Giá trị hợp đồng": payload.GIA_TRI_HOP_DONG,
            "Đã thu": 0.0,
            "Sale / nguồn": payload.Sale_nguồn,
            "Ghi chú": f"File Hợp đồng: {download_url}"
        }
        success_db, err = excel_db.add_new_hopdong(hd_data)
        
        if success_db:
            # Send Telegram notification
            telegram_service.notify_new_contract(hd_data)
            return {"status": "success", "download_url": download_url}
        else:
            raise HTTPException(status_code=500, detail=f"Lỗi ghi DB: {err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
