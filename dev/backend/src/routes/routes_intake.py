"""Public Intake Router for Customer Requests (Web Form, Zalo QR, Google Forms).

No authentication required — publicly accessible for prospects and external forms.
"""

import uuid
import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.db.database import get_db
from src.db.models.crm import Customer, CustomerIntakeSubmission, LeadPipeline
from src.db.models.auth import Notification, User, Role, UserRole
from src.services import telegram_service

router = APIRouter(prefix="/api/intake", tags=["12. Public Customer Intake"])


class LeadIntakeSchema(BaseModel):
    customer_name: str = Field(..., min_length=2, description="Họ và tên khách hàng hoặc tên công ty")
    phone: str = Field(..., min_length=8, description="Số điện thoại liên hệ")
    address: Optional[str] = Field(None, description="Địa chỉ liên hệ / thường trú của khách")
    service_package_id: Optional[str] = Field(None, description="Mã gói dịch vụ (sp_001, sp_002, sp_003)")
    service_type: Optional[str] = Field("Tư vấn chung", description="Tên hạng mục dịch vụ cụ thể")
    scale_info: Optional[str] = Field(None, description="Quy mô / Diện tích / Số mốc / Số thửa")
    target_property_address: Optional[str] = Field(None, description="Địa chỉ thửa đất hoặc công trình")
    tax_id: Optional[str] = Field(None, description="Mã số thuế hoặc CCCD")
    email: Optional[str] = Field(None, description="Email nhận file mềm / hợp đồng")
    notes: Optional[str] = Field(None, description="Ghi chú thêm của khách hàng")
    source: Optional[str] = Field("Web Form (Zalo)", description="Nguồn gửi (Web Form, Google Form, Zalo OA...)")
    google_form_id: Optional[str] = None
    google_response_id: Optional[str] = None


def _normalize_phone(raw_phone: str) -> str:
    cleaned = "".join(c for c in raw_phone if c.isdigit())
    if cleaned.startswith("84") and len(cleaned) >= 10:
        cleaned = "0" + cleaned[2:]
    return cleaned


@router.get("/services")
def get_intake_service_options(db: Session = Depends(get_db)):
    """Trả về danh mục Gói dịch vụ & Hạng mục công khai để hiển thị trên form cho khách chọn."""
    try:
        rows = db.execute(
            text("""
                select p.id as package_id, p.name as package_name, p.display_order,
                       t.id as task_type_id, t.code as task_type_code, t.name as task_type_name
                from public.service_packages p
                left join public.task_types t on t.service_package_id = p.id
                where coalesce(p.is_active, true)
                order by p.display_order nulls last, p.name, t.name
            """)
        ).mappings().all()

        packages_map = {}
        for r in rows:
            pid = r["package_id"]
            if pid not in packages_map:
                packages_map[pid] = {
                    "id": pid,
                    "name": r["package_name"],
                    "services": []
                }
            if r["task_type_id"]:
                packages_map[pid]["services"].append({
                    "id": r["task_type_id"],
                    "code": r["task_type_code"],
                    "name": r["task_type_name"],
                })

        return {"status": "success", "data": list(packages_map.values())}
    except Exception as exc:
        # Fallback danh mục chuẩn nếu có lỗi kết nối tạm thời
        return {
            "status": "success",
            "data": [
                {
                    "id": "sp_001",
                    "name": "Đo Vẽ Bản Đồ",
                    "services": [
                        {"id": "tt_001", "name": "Đo hiện trạng vị trí"},
                        {"id": "tt_002", "name": "Cắm mốc ranh giới"},
                        {"id": "tt_006", "name": "Tách thửa – phần đo vẽ"},
                        {"id": "tt_005", "name": "Hợp thửa – phần đo vẽ"},
                        {"id": "tt_003", "name": "Hoàn công – phần đo vẽ"},
                        {"id": "tt_009", "name": "Xác định diện tích / Ranh"}
                    ]
                },
                {
                    "id": "sp_002",
                    "name": "Pháp Lý & Hồ Sơ Đất Đai",
                    "services": [
                        {"id": "tt_011", "name": "Cấp đổi sổ / Đổi Giấy chứng nhận"},
                        {"id": "tt_014", "name": "Cấp sổ lần đầu"},
                        {"id": "tt_016", "name": "Chuyển nhượng / Đăng bộ sang tên"},
                        {"id": "tt_013", "name": "Tách thửa pháp lý"},
                        {"id": "tt_017", "name": "Tặng cho nhà đất"},
                        {"id": "tt_018", "name": "Thừa kế / Khai nhận di sản"},
                        {"id": "tt_015", "name": "Chuyển mục đích sử dụng đất"}
                    ]
                },
                {
                    "id": "sp_003",
                    "name": "Xin Phép Xây Dựng",
                    "services": [
                        {"id": "tt_020", "name": "Xin phép xây dựng mới"},
                        {"id": "tt_021", "name": "Sửa chữa, cải tạo công trình"},
                        {"id": "tt_022", "name": "Gia hạn giấy phép xây dựng"}
                    ]
                }
            ]
        }


@router.post("/lead")
def submit_lead_intake(
    data: LeadIntakeSchema,
    db: Session = Depends(get_db)
):
    """Tiếp nhận thông tin khách hàng từ Web Form / Zalo / Google Form.
    
    1. Chuẩn hóa SĐT và tìm/tạo Customer.
    2. Lưu bản ghi nguyên gốc vào CustomerIntakeSubmission.
    3. Tạo bản ghi Lead mới trong LeadPipeline (trạng thái: Tiếp cận).
    4. Bắn thông báo Telegram (nếu có cấu hình) và chuông thông báo nội bộ ERP.
    """
    phone = _normalize_phone(data.phone)
    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.")

    customer_name = data.customer_name.strip()
    if not customer_name:
        raise HTTPException(status_code=400, detail="Vui lòng nhập họ và tên.")

    # 1. Tìm hoặc Tạo mới Customer
    cust = db.query(Customer).filter(Customer.phone == phone).first()
    if not cust:
        cust = Customer(
            full_name=customer_name,
            phone=phone,
            address=data.address or data.target_property_address,
            tax_id=data.tax_id,
            email=data.email,
            source_channel=data.source or "Web Form"
        )
        db.add(cust)
        db.commit()
        db.refresh(cust)
    else:
        # Cập nhật thông tin bổ sung nếu khách cũ chưa có
        updated = False
        if not cust.address and (data.address or data.target_property_address):
            cust.address = data.address or data.target_property_address
            updated = True
        if not cust.email and data.email:
            cust.email = data.email
            updated = True
        if not cust.tax_id and data.tax_id:
            cust.tax_id = data.tax_id
            updated = True
        if updated:
            db.commit()
            db.refresh(cust)

    # 2. Xây dựng nội dung nhu cầu (requirements) có cấu trúc
    parts = []
    if data.service_type:
        parts.append(f"Dịch vụ: {data.service_type}")
    if data.scale_info:
        parts.append(f"Quy mô: {data.scale_info}")
    if data.target_property_address:
        parts.append(f"Vị trí BĐS: {data.target_property_address}")
    if data.notes:
        parts.append(f"Ghi chú: {data.notes}")
    requirements_text = " | ".join(parts) if parts else (data.notes or "Yêu cầu tư vấn dịch vụ")

    # 3. Tạo LeadPipeline mới
    lead_id = f"LEAD-{str(uuid.uuid4())[:8].upper()}"
    new_lead = LeadPipeline(
        id=lead_id,
        customer_id=cust.id,
        source=data.source or "Web Form (Zalo)",
        requirements=requirements_text,
        status="Tiếp cận"
    )
    db.add(new_lead)
    db.flush()

    # 4. Lưu bản ghi Intake Submission nguyên gốc
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    raw_source = (data.source or "").lower()
    if "google" in raw_source or data.google_form_id:
        source_channel_enum = "google_form"
    elif "zalo" in raw_source or "web" in raw_source:
        source_channel_enum = "zalo_oa"
    else:
        source_channel_enum = "manual"

    submission = CustomerIntakeSubmission(
        source_channel=source_channel_enum,
        google_form_id=data.google_form_id,
        google_response_id=data.google_response_id,
        submitted_at=now_utc,
        raw_payload=data.model_dump(),
        normalized_payload={
            "customer_name": customer_name,
            "phone": phone,
            "service_type": data.service_type,
            "scale_info": data.scale_info,
            "target_property_address": data.target_property_address,
            "requirements": requirements_text
        },
        status="new",
        linked_customer_id=cust.id,
        linked_lead_id=lead_id,
        processed_at=now_utc
    )
    db.add(submission)

    # 5. Tạo thông báo nội bộ cho nhân viên quản trị
    try:
        notif = Notification(
            title="Khách hàng mới gửi yêu cầu dịch vụ",
            content=f"Khách hàng {customer_name} ({phone}) vừa đăng ký: {data.service_type or 'Tư vấn dịch vụ'}. Quy mô: {data.scale_info or 'Chưa rõ'}.",
            user_id=None
        )
        db.add(notif)
    except Exception:
        pass

    db.commit()
    db.refresh(new_lead)

    # 6. Bắn tin nhắn Telegram cảnh báo khẩn nếu có cấu hình
    try:
        tele_msg = (
            f"🔔 <b>YÊU CẦU DỊCH VỤ MỚI TỪ WEB/ZALO!</b>\n"
            f"👤 <b>Khách hàng:</b> {customer_name}\n"
            f"📞 <b>SĐT:</b> {phone}\n"
            f"📌 <b>Dịch vụ:</b> {data.service_type or 'Chưa chọn'}\n"
            f"📐 <b>Quy mô / Diện tích:</b> {data.scale_info or 'Theo hiện trạng'}\n"
            f"📍 <b>Địa chỉ BĐS:</b> {data.target_property_address or cust.address or 'Chưa cung cấp'}\n"
            f"📝 <b>Ghi chú:</b> {data.notes or 'Không có'}\n"
            f"🌐 <b>Nguồn:</b> {data.source or 'Web Form'}"
        )
        telegram_service.send_telegram_message(tele_msg)
    except Exception:
        pass

    return {
        "status": "success",
        "data": {
            "lead_id": new_lead.id,
            "customer_id": cust.id,
            "customer_name": cust.full_name,
            "service_type": data.service_type,
            "scale_info": data.scale_info,
            "message": "Bách Khoa đã tiếp nhận yêu cầu của quý khách thành công. Chuyên viên sẽ liên hệ trong ít phút!"
        }
    }
