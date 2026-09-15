import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from core import pricing_engine
from src.core import doc_generator
from src.core.auth import User, require_authenticated_user

router = APIRouter(tags=["08. CRM & Quotations"])

class QuoteRequestSchema(BaseModel):
    customer_name: str
    service_type: str
    area_sqm: float
    location_zone: int

@router.post("/calculate")
def generate_quote(
    payload: QuoteRequestSchema,
    user: User = Depends(require_authenticated_user),
):
    try:
        # 1. Tính giá
        final_price = pricing_engine.calculate_quote(
            payload.service_type, 
            payload.area_sqm, 
            payload.location_zone
        )
        
        # 2. Tạo file Báo Giá Word bằng doc_generator
        # Chuyển dữ liệu thành dict để đưa vào doc_generator
        from datetime import datetime
        quote_data = {
            "customer_name": payload.customer_name,
            "service_type": payload.service_type,
            "area_sqm": payload.area_sqm,
            "location_zone": payload.location_zone,
            "final_price": f"{final_price:,.0f} VNĐ",
            "date_generated": datetime.now().strftime("%d/%m/%Y")
        }
        
        is_generated, download_url, full_path = doc_generator.generate_document(
            data=quote_data,
            template_name="mau_bao_gia.docx", # Giả định đã có file này trong thư mục templates
            output_prefix="Quotation",
            owner_id=user.id,
        )
        
        if not is_generated:
             raise HTTPException(
                 status_code=503,
                 detail="Không thể tạo tệp báo giá từ mẫu hiện tại.",
             )
        
        # 3. Giả lập gửi tự động qua Zalo (nếu có Webhook thì có thể gọi zalo_service)
        print(f"====== AUTO SEND QUOTE ======")
        print(f"To: {payload.customer_name}")
        print(f"Service: {payload.service_type} - Price: {final_price:,.0f} VNĐ")
        print(f"Link: {download_url}")
        print("=============================")
        
        return {
            "status": "success",
            "price": final_price,
            "download_url": download_url,
            "message": "Đã tạo báo giá thành công."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{filename:path}")
def download_generated_quotation(
    filename: str,
    user: User = Depends(require_authenticated_user),
):
    """Serve a generated quotation only to the authenticated creator."""
    if not filename or Path(filename).name != filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu báo giá.")

    owner_marker = f"Quotation_{doc_generator.sanitize_filename_component(user.id, fallback='user')}_"
    if not filename.startswith(owner_marker):
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu báo giá.")

    output_root = Path(doc_generator.OUTPUT_DIR).resolve()
    output_path = (output_root / os.path.basename(filename)).resolve()
    if output_path.parent != output_root or not output_path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu báo giá.")

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=output_path.name,
    )
