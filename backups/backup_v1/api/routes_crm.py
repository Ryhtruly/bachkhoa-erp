from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/crm", tags=["CRM & Pipeline"])

class LeadSchema(BaseModel):
    id: Optional[str] = None
    customer_name: str
    phone: str
    status: str = "Tiếp cận" # Tiếp cận -> Báo giá -> Đàm phán -> Chốt
    notes: str = ""

# Mock database for Leads
LEADS_DB = []
lead_counter = 1

@router.post("/leads")
def create_lead(lead: LeadSchema):
    global lead_counter
    lead.id = f"LEAD-{lead_counter:04d}"
    LEADS_DB.append(lead.model_dump())
    lead_counter += 1
    return {"status": "success", "data": lead}

@router.get("/leads")
def get_leads():
    return {"status": "success", "data": LEADS_DB}

@router.put("/leads/{lead_id}/status")
def update_lead_status(lead_id: str, new_status: str):
    """
    Kanban drag-and-drop endpoint.
    When new_status == 'Chốt', it should trigger Contract generation.
    """
    for lead in LEADS_DB:
        if lead["id"] == lead_id:
            lead["status"] = new_status
            if new_status == "Chốt":
                print(f"[CRM Automation] Lead {lead_id} Won! Auto-triggering contract creation...")
                # In real app, call excel_db.add_new_hopdong()
            return {"status": "success", "data": lead}
    raise HTTPException(status_code=404, detail="Lead not found")
