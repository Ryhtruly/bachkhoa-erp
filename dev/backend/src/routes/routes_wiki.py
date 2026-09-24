import io
import math
import mimetypes
import os
import re
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query, Form, File, UploadFile, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
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
from src.core.redis_utils import consume_rate_limit, get_cached_json, set_cached_json, invalidate_cache

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
        # Cache the default initial view (page 1, all categories, no search query)
        is_default_view = not search and (not category or category == "Tất cả") and page == 1 and page_size == 20
        cache_key = "bachkhoa:wiki:default_list" if is_default_view else None
        if cache_key:
            cached = get_cached_json(cache_key)
            if cached is not None:
                return cached

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
        
        if total_items == 0:
            docs = []
        else:
            offset = (page - 1) * page_size
            docs = query.order_by(WikiDocument.created_at.desc()).offset(offset).limit(page_size).all()
        
        result = []
        for d in docs:
            result.append({
                "id": d.id,
                "title": d.title,
                "category": d.category,
                "link": d.link,
                "file_name": os.path.basename(d.link) if d.link else None,
                "description": d.description,
                "version": d.version,
                "created_at": d.created_at.isoformat() if d.created_at else None
            })
            
        response_data = {
            "status": "success", 
            "data": result,
            "meta": {
                "page": page,
                "page_size": page_size,
                "total_items": total_items,
                "total_pages": total_pages
            }
        }

        if cache_key:
            set_cached_json(cache_key, response_data, ttl_seconds=60)

        return response_data
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

        # Validate file size without buffering entire stream into RAM
        try:
            file.file.seek(0, io.SEEK_END)
            file_size = file.file.tell()
            file.file.seek(0)
        except (AttributeError, io.UnsupportedOperation):
            file_size = getattr(file, "size", None) or 0

        if file_size > MAX_WIKI_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File Wiki không được vượt quá 25MB.")

        # Sanitize filename: remove special characters, keep only alphanumeric, dash, underscore, dot
        safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', file.filename or "document")
        safe_name = re.sub(r'_+', '_', safe_name).strip('_')
        object_name = f"wiki/{id}/{safe_name}"

        # Stream file to MinIO and persist DB record FIRST before enqueuing to eliminate worker FK race condition
        uploaded = False
        try:
            ensure_bucket()
            upload_file(file.file, object_name)
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

        # Enqueue indexing job now that WikiDocument record is committed in DB.
        # Passing None for file_bytes allows worker to stream from MinIO directly, keeping RAM near 0.
        enqueued = enqueue_indexing_job(None, file.filename or safe_name, id, object_name=object_name)
        if not enqueued:
            return {
                "status": "success",
                "message": "Đã lưu tài liệu thành công. Quá trình bóc tách nội dung đã được xếp vào hàng đợi chờ tự động.",
            }

        # Invalidate wiki list cache so newly uploaded document appears immediately
        invalidate_cache("bachkhoa:wiki:*")

        return {"status": "success", "message": "Đã lưu tài liệu thành công"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))



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
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=404, detail="File không tồn tại trên object storage.") from exc


logger = logging.getLogger(__name__)


@router.put("/{doc_id}")
async def update_document(
    doc_id: str,
    title: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    version: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("wiki", "update"))
):
    doc = db.query(WikiDocument).filter(WikiDocument.id == doc_id, WikiDocument.is_active == True).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Tài liệu không tồn tại hoặc đã bị xóa.")

    try:
        doc.title = title
        doc.category = category
        if description is not None:
            doc.description = description
        if version is not None:
            doc.version = version

        # If a new file is uploaded, replace the existing one
        if file and file.filename:
            try:
                file.file.seek(0, io.SEEK_END)
                file_size = file.file.tell()
                file.file.seek(0)
            except (AttributeError, io.UnsupportedOperation):
                file_size = getattr(file, "size", None) or 0

            if file_size > MAX_WIKI_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="File Wiki không được vượt quá 25MB.")

            safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', file.filename or "document")
            safe_name = re.sub(r'_+', '_', safe_name).strip('_')
            object_name = f"wiki/{doc_id}/{safe_name}"

            old_link = doc.link
            ensure_bucket()
            upload_file(file.file, object_name)
            doc.link = object_name

            if old_link and old_link != object_name:
                try:
                    delete_file(old_link)
                except Exception:
                    pass

            try:
                delete_document_chunks(doc_id, db)
            except Exception:
                pass

            if can_enqueue_indexing_job():
                enqueue_indexing_job(None, file.filename or safe_name, doc_id, object_name=object_name)

        db.add(AuditLog(
            actor_id=user.id,
            action="UPDATE",
            object_type="WikiDocument",
            payload_json={"id": doc_id, "title": title, "category": category}
        ))
        db.commit()

        invalidate_cache("bachkhoa:wiki:*")
        return {"status": "success", "message": "Cập nhật tài liệu thành công"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{doc_id}")
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("wiki", "delete"))
):
    doc = db.query(WikiDocument).filter(WikiDocument.id == doc_id, WikiDocument.is_active == True).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Tài liệu không tồn tại hoặc đã bị xóa.")

    try:
        # Soft delete
        doc.is_active = False

        try:
            delete_document_chunks(doc_id, db)
        except Exception as e:
            logger.warning("Failed to delete wiki chunks for %s: %s", doc_id, e)

        if doc.link:
            try:
                delete_file(doc.link)
            except Exception as e:
                logger.warning("Failed to delete storage file %s: %s", doc.link, e)

        db.add(AuditLog(
            actor_id=user.id,
            action="DELETE",
            object_type="WikiDocument",
            payload_json={"id": doc_id, "title": doc.title}
        ))
        db.commit()

        invalidate_cache("bachkhoa:wiki:*")
        return {"status": "success", "message": "Xóa tài liệu thành công"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


