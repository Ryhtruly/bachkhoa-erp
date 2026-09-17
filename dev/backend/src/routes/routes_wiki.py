from fastapi import APIRouter, HTTPException, Depends, Query, Form, File, UploadFile, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import List, Optional
import math
import re
import io
from src.db.database import get_db
from src.db.models import WikiDocument, AuditLog
from src.services.storage_service import upload_file, ensure_bucket, get_file, delete_file
from src.services.wiki_rag_service import (
    index_document,
    delete_document_chunks,
    enqueue_indexing_job,
    can_enqueue_indexing_job,
    cancel_indexing_job,
)
from src.core.auth import require_permission, User
from src.core.redis_utils import consume_rate_limit

router = APIRouter(prefix="/api/wiki", tags=["09. Knowledge Base & Wiki"])
MAX_WIKI_UPLOAD_BYTES = 25 * 1024 * 1024
WIKI_DOWNLOAD_CHUNK_BYTES = 64 * 1024


def _stream_storage_body(body):
    try:
        while chunk := body.read(WIKI_DOWNLOAD_CHUNK_BYTES):
            yield chunk
    finally:
        if hasattr(body, "close"):
            body.close()

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
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("wiki", "read"))
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
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("wiki", "create"))
):
    try:
        # Rate limit per user: max 5 wiki uploads per 10 minutes to prevent cost amplification and worker starvation
        allowed, _ = consume_rate_limit(f"bachkhoa:rate_limit:wiki_upload:{user.id}", limit=5, window_seconds=600)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Bạn đã tải lên quá nhiều tài liệu. Vui lòng thử lại sau vài phút."
            )

        # Pre-check queue capacity to fail fast before MinIO upload and DB changes
        if not can_enqueue_indexing_job():
            raise HTTPException(
                status_code=429,
                detail="Hàng đợi xử lý tài liệu đang bận. Vui lòng thử lại sau khi hệ thống xử lý xong các tài liệu trước.",
            )

        existing = db.query(WikiDocument).filter(WikiDocument.id == id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Mã tài liệu đã tồn tại.")

        file_bytes = await file.read(MAX_WIKI_UPLOAD_BYTES + 1)
        if len(file_bytes) > MAX_WIKI_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File Wiki không được vượt quá 25MB.")

        # Sanitize filename: remove special characters, keep only alphanumeric, dash, underscore, dot
        safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', file.filename or "document")
        safe_name = re.sub(r'_+', '_', safe_name).strip('_')
        object_name = f"wiki/{id}/{safe_name}"

        # Upload file to MinIO and persist DB record FIRST before enqueuing to eliminate worker FK race condition
        uploaded = False
        try:
            ensure_bucket()
            upload_file(io.BytesIO(file_bytes), object_name)
            uploaded = True

            new_doc = WikiDocument(
                id=id,
                title=title,
                category=category,
                link=object_name,
                description=description,
                version=version
            )
            db.add(new_doc)
            db.add(AuditLog(
                actor_id=user.id,
                action="CREATE",
                object_type="WikiDocument",
                payload_json={"id": id, "title": title}
            ))
            db.commit()
        except Exception:
            db.rollback()
            if uploaded:
                try:
                    delete_file(object_name)
                except Exception:
                    pass
            raise

        # Enqueue indexing job now that WikiDocument record is committed in DB
        enqueued = enqueue_indexing_job(file_bytes, file.filename or safe_name, id, object_name=object_name)
        if not enqueued:
            return {
                "status": "success",
                "message": "Đã lưu tài liệu thành công. Quá trình bóc tách nội dung đã được xếp vào hàng đợi chờ tự động.",
            }

        return {"status": "success", "message": "Đã lưu tài liệu thành công"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


import mimetypes
import os


@router.get("/download/{doc_id}")
def download_document(
    doc_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("wiki", "read"))
):
    """Read a private Wiki object through the permission-protected backend."""
    doc = db.query(WikiDocument).filter(WikiDocument.id == doc_id).first()
    if not doc or not doc.link:
        raise HTTPException(status_code=404, detail="Tài liệu không tồn tại.")
    
    object_name = doc.link
    legacy_wiki_document_id = None
    if not object_name.startswith("wiki/"):
        legacy_parts = object_name.split("/wiki-files/", 1)
        if len(legacy_parts) != 2:
            raise HTTPException(status_code=400, detail="Link tài liệu không hợp lệ.")
        object_name = legacy_parts[1]
        legacy_wiki_document_id = doc_id

    try:
        stored = get_file(
            object_name,
            **(
                {"legacy_wiki_document_id": legacy_wiki_document_id}
                if legacy_wiki_document_id is not None
                else {}
            ),
        )
        filename = os.path.basename(doc.link) or f"{doc_id}.bin"
        content_type = stored.get("ContentType")
        if not content_type or content_type in ("application/octet-stream", "binary/octet-stream"):
            guessed_type, _ = mimetypes.guess_type(filename)
            content_type = guessed_type or "application/octet-stream"

        return StreamingResponse(
            _stream_storage_body(stored["Body"]),
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=404, detail="File không tồn tại trên object storage.") from exc


