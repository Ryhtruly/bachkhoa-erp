from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/api/wiki", tags=["Tri Thức Doanh Nghiệp"])

class DocumentSchema(BaseModel):
    id: str
    title: str
    category: str
    link: str

WIKI_DB = [
    {"id": "DOC-001", "title": "Sổ tay nhân viên Bách Khoa", "category": "Onboarding", "link": "/static/docs/sotay.pdf"},
    {"id": "DOC-002", "title": "Quy trình đo vẽ ISO 9001", "category": "Chuyên môn", "link": "/static/docs/iso.pdf"}
]

@router.get("/")
def list_documents():
    return {"status": "success", "data": WIKI_DB}

@router.post("/")
def upload_document(doc: DocumentSchema):
    WIKI_DB.append(doc.model_dump())
    return {"status": "success", "data": doc}
