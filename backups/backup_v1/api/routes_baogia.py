from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src.core import pricing_engine

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
        
        # 2. Giả lập việc tạo file Báo Giá Word (mau_bao_gia.docx)
        download_url = f"/static/generated_quotes/BaoGia_{payload.customer_name}.docx"
        
        # 3. Giả lập gửi tự động qua Email/Zalo
        print(f"====== AUTO SEND QUOTE ======")
        print(f"To: {payload.customer_name}")
        print(f"Service: {payload.service_type} - Price: {final_price:,.0f} VNĐ")
        print(f"Link: {download_url}")
        print("=============================")
        
        return {
            "status": "success",
            "price": final_price,
            "download_url": download_url,
            "message": "Đã tạo báo giá và giả lập gửi tự động cho khách hàng."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
