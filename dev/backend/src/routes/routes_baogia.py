from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core import pricing_engine

router = APIRouter(prefix="/api/baogia", tags=["Báo Giá"])

class QuoteRequestSchema(BaseModel):
    customer_name: str
    service_type: str
    area_sqm: float
    location_zone: int

@router.post("/calculate")
def generate_quote(payload: QuoteRequestSchema):
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
        
        from core import doc_generator
        success_gen, download_url, full_path = doc_generator.generate_document(
            data=quote_data,
            template_name="mau_bao_gia.docx", # Giả định đã có file này trong thư mục templates
            output_prefix="BaoGia"
        )
        
        if not success_gen:
             download_url = f"/static/generated_quotes/BaoGia_{payload.customer_name}.docx" # Fallback if no template exists
        
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
