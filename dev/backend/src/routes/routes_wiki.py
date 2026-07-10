from fastapi import APIRouter, HTTPException, Depends, Query, Form, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import List, Optional
import math
from src.db.database import get_db
from src.db.models import WikiDocument
from src.services.storage_service import upload_file, ensure_bucket
from src.services.wiki_rag_service import index_document, delete_document_chunks

router = APIRouter(prefix="/api/wiki", tags=["Tri Thức Doanh Nghiệp"])

class DocumentSchema(BaseModel):
    id: str
    title: str
    category: str
    link: str
    description: Optional[str] = None
    version: Optional[str] = None

@router.get("/")
def list_documents(
    search: str = Query(None),
    category: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(WikiDocument).filter(WikiDocument.is_active == True)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    WikiDocument.id.ilike(search_term),
                    WikiDocument.title.ilike(search_term)
                )
            )
            
        if category and category != "Tất cả":
            query = query.filter(WikiDocument.category == category)
            
        total_items = query.count()
        total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1
        
        offset = (page - 1) * page_size
        docs = query.order_by(WikiDocument.created_at.desc()).offset(offset).limit(page_size).all()
        
        result = []
        for d in docs:
            result.append({
                "id": d.id,
                "title": d.title,
                "category": d.category,
                "link": d.link,
                "description": d.description,
                "version": d.version,
                "created_at": d.created_at.isoformat() if d.created_at else None
            })
            
        return {
            "status": "success", 
            "data": result,
            "meta": {
                "page": page,
                "page_size": page_size,
                "total_items": total_items,
                "total_pages": total_pages
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_document(
    id: str = Form(...),
    title: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    version: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        existing = db.query(WikiDocument).filter(WikiDocument.id == id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Mã tài liệu đã tồn tại.")

        file_bytes = await file.read()

        # Upload file to MinIO
        ensure_bucket()
        object_name = f"{id}_{file.filename}"
        import io
        link = upload_file(io.BytesIO(file_bytes), object_name)

        new_doc = WikiDocument(
            id=id,
            title=title,
            category=category,
            link=link,
            description=description,
            version=version
        )
        db.add(new_doc)
        db.flush()  # Persist document first so wiki_chunks can reference it

        try:
            index_document(file_bytes, file.filename, id, db)
        except Exception as rag_err:
            print(f"[wiki_rag] Index error (non-fatal): {rag_err}")

        db.commit()
        
        return {"status": "success", "message": "Đã lưu tài liệu thành công"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

