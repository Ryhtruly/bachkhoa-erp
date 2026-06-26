from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
import datetime
import uuid
import os
from docxtpl import DocxTemplate

from src.db.database import get_db
from src.db.models import LeadPipeline, Customer, ProjectTask, Contract

router = APIRouter(prefix="/api/crm", tags=["CRM & Pipeline"])

class LeadCreateSchema(BaseModel):
    customer_name: str
    phone: str
    source: str = "Tự động"
    requirements: str = ""
    assigned_to: Optional[str] = None

class LeadStatusUpdate(BaseModel):
    new_status: str
    price: Optional[str] = None
    tax_id: Optional[str] = None
    area: Optional[str] = None

@router.get("/stats")
def get_crm_stats(db: Session = Depends(get_db)):
    total = db.query(LeadPipeline).count()
    won = db.query(LeadPipeline).filter(LeadPipeline.status == "Chốt").count()
    in_progress = db.query(LeadPipeline).filter(LeadPipeline.status.in_(["Tiếp cận", "Báo giá", "Đàm phán"])).count()
    win_rate = round((won / total * 100) if total > 0 else 0, 1)
    
    return {
        "status": "success",
        "data": {
            "total_leads": total,
            "won_leads": won,
            "in_progress": in_progress,
            "win_rate": win_rate
        }
    }

@router.post("/leads")
def create_lead(data: LeadCreateSchema, db: Session = Depends(get_db)):
    # Find or Create Customer
    cust = db.query(Customer).filter(Customer.phone == data.phone).first()
    if not cust:
        cust = Customer(full_name=data.customer_name, phone=data.phone)
        db.add(cust)
        db.commit()
        db.refresh(cust)

    lead_id = f"LEAD-{str(uuid.uuid4())[:8].upper()}"
    new_lead = LeadPipeline(
        id=lead_id,
        customer_id=cust.id,
        source=data.source,
        requirements=data.requirements,
        status="Tiếp cận",
        assigned_to=data.assigned_to
    )
    db.add(new_lead)
    db.commit()
    db.refresh(new_lead)
    
    return {"status": "success", "data": {"id": new_lead.id}}

@router.get("/leads")
def get_leads(db: Session = Depends(get_db)):
    leads = db.query(LeadPipeline).order_by(LeadPipeline.created_at.desc()).all()
    results = []
    for l in leads:
        cust = db.query(Customer).filter(Customer.id == l.customer_id).first()
        results.append({
            "id": l.id,
            "customer_name": cust.full_name if cust else "Unknown",
            "phone": cust.phone if cust else "",
            "source": l.source,
            "requirements": l.requirements,
            "status": l.status,
            "assigned_to": l.assigned_to,
            "created_at": l.created_at.strftime("%Y-%m-%d %H:%M") if l.created_at else ""
        })
    return {"status": "success", "data": results}

@router.put("/leads/{lead_id}/status")
def update_lead_status(lead_id: str, body: LeadStatusUpdate, db: Session = Depends(get_db)):
    lead = db.query(LeadPipeline).filter(LeadPipeline.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    old_status = lead.status
    lead.status = body.new_status
    
    # --- AUTOMATION: Nếu chốt thành công -> Sinh Hồ sơ mới ---
    if body.new_status == "Chốt" and old_status != "Chốt":
        # Tạo Contract Tự Động
        contract_id = f"HD-AUTO-{str(uuid.uuid4())[:6].upper()}"
        # Render Hợp Đồng file (.docx)
        template_path = os.path.join(os.path.dirname(__file__), "..", "templates", "Mau_Hop_Dong_Do_Dac_Bach_Khoa.docx")
        output_filename = f"{contract_id}.docx"
        output_path = os.path.join(os.path.dirname(__file__), "..", "..", "static", "contracts", output_filename)
        
        customer = db.query(Customer).filter(Customer.id == lead.customer_id).first()
        
        if os.path.exists(template_path) and customer:
            doc = DocxTemplate(template_path)
            
            try:
                from num2words import num2words
                numeric_price = int(body.price) if body.price else 0
                price_text = num2words(numeric_price, lang='vi').capitalize() + " đồng" if numeric_price > 0 else "Chưa báo giá"
                formatted_price = f"{numeric_price:,}".replace(",", ".") + " VNĐ" if numeric_price > 0 else "Chưa báo giá"
            except:
                price_text = "Chưa báo giá"
                formatted_price = body.price or "Chưa báo giá"
                
            context = {
                "contract_id": contract_id,
                "created_date": datetime.datetime.now().strftime("%d/%m/%Y"),
                "customer_name": customer.full_name,
                "customer_address": customer.address or "",
                "customer_phone": customer.phone or "",
                "customer_tax_id": body.tax_id or "Tự động cập nhật MST",
                "service_type": lead.requirements or "Dịch vụ đo đạc hiện trạng",
                "service_location": customer.address or "Tại hiện trường",
                "service_area": body.area or "Cập nhật sau",
                "total_amount": formatted_price,
                "total_amount_text": price_text
            }
            doc.render(context)
            doc.save(output_path)
            
        numeric_total_value = 0
        try:
            numeric_total_value = float(body.price) if body.price else 0
        except:
            pass
            
        new_contract = Contract(
            id=contract_id,
            customer_id=lead.customer_id,
            lead_id=lead.id,
            service_type=lead.requirements or "Dịch vụ tự động",
            total_value=numeric_total_value,
            date_signed=datetime.datetime.now(datetime.timezone.utc).date(),
            file_link=f"/static/contracts/{output_filename}" if os.path.exists(template_path) else None
        )
        db.add(new_contract)
        
        # Tạo ProjectTask Tự Động cho bộ phận Kỹ thuật
        task_id = f"BK-HS-AUTO-{str(uuid.uuid4())[:4].upper()}"
        new_task = ProjectTask(
            id=task_id,
            contract_id=contract_id,
            task_name=lead.requirements or "Chờ phân công",
            status="Mới tiếp nhận",
            deadline=datetime.datetime.now(datetime.timezone.utc).date() + datetime.timedelta(days=7),
            priority="Cao"
        )
        db.add(new_task)
        
    db.commit()
    return {"status": "success", "data": {"id": lead.id, "status": lead.status}}
