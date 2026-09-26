import io
import os
import json
import time
import uuid
import zipfile
import threading
import httpx
import queue
from typing import List, Dict, Optional, Any
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.db.models import WikiChunk
from src.db.database import SessionLocal
from src.core.dlp import redact_sensitive_content
from src.core.redis_utils import get_redis_client

CHUNK_SIZE = 500
CHUNK_OVERLAP = 100
EMBED_MODEL = "text-embedding-004"
# Gemini API compatible models — use native API below, not OpenAI-compat
EMBED_MODEL_NATIVE = "models/gemini-embedding-001"
SEARCH_LIMIT = 5
SIMILARITY_THRESHOLD = 0.5

# ─── Text extraction & Budgets ──────────────────────────────────

MAX_PAGES = 100
MAX_EXTRACTED_CHARS = 500_000
MAX_CHUNKS = 30
MAX_INDEXING_SECONDS = 45.0
MAX_HTTP_EMBED_TIMEOUT_SECONDS = 8.0
MAX_DOCX_ENTRIES = 500
MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES = 20_000_000  # 20 MB
MAX_DOCX_SINGLE_ENTRY_BYTES = 10_000_000       # 10 MB
MAX_COMPRESSION_RATIO = 100.0                   # Reject ratio > 100x
MAX_QUEUE_SIZE = 50
WIKI_INDEXING_REDIS_KEY = "bachkhoa:wiki:indexing_queue"

INDEXING_QUEUE: queue.Queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
INDEXING_JOBS: Dict[str, Dict[str, Any]] = {}
_worker_started = False
_worker_lock = threading.Lock()
_queue_lock = threading.Lock()

_REDIS_ENQUEUE_LUA = """
local key = KEYS[1]
local max_len = tonumber(ARGV[1])
local payload = ARGV[2]
if redis.call('LLEN', key) < max_len then
    redis.call('RPUSH', key, payload)
    return 1
else
    return 0
end
"""


def can_enqueue_indexing_job() -> bool:
    """Check whether the indexing queue has capacity before accepting document upload."""
    redis = get_redis_client()
    if redis:
        try:
            return redis.llen(WIKI_INDEXING_REDIS_KEY) < MAX_QUEUE_SIZE
        except Exception:
            pass
    with _queue_lock:
        return not INDEXING_QUEUE.full()


def validate_docx_archive(file_bytes: bytes) -> None:
    """Validate DOCX zip archive against zip bombs and excessive XML nesting before parsing."""
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            infolist = zf.infolist()
            if len(infolist) > MAX_DOCX_ENTRIES:
                raise ValueError(f"DOCX chứa quá nhiều tệp tin con ({len(infolist)} > {MAX_DOCX_ENTRIES}).")

            total_uncompressed = 0
            for info in infolist:
                if info.file_size > MAX_DOCX_SINGLE_ENTRY_BYTES:
                    raise ValueError(f"Tệp tin '{info.filename}' trong DOCX vượt quá giới hạn ({info.file_size} bytes).")
                total_uncompressed += info.file_size

            if total_uncompressed > MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES:
                raise ValueError(f"Tổng dung lượng giải nén của DOCX vượt quá giới hạn ({total_uncompressed} bytes).")

            compressed_size = max(len(file_bytes), 1)
            ratio = total_uncompressed / compressed_size
            if ratio > MAX_COMPRESSION_RATIO:
                raise ValueError(f"Tỷ lệ nén DOCX bất thường ({ratio:.1f}x > {MAX_COMPRESSION_RATIO}x), từ chối để chống zip bomb.")
    except zipfile.BadZipFile as exc:
        raise ValueError(f"Định dạng tệp DOCX không hợp lệ: {exc}") from exc


def extract_text_from_file(file_bytes: bytes, filename: str, deadline: Optional[float] = None) -> str:
    if deadline is not None and time.time() >= deadline:
        return ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext == "pdf":
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages_text = []
        total_chars = 0
        for i, page in enumerate(doc):
            if deadline is not None and time.time() >= deadline:
                break
            if i >= MAX_PAGES:
                break
            text = page.get_text()
            pages_text.append(text)
            total_chars += len(text)
            if total_chars >= MAX_EXTRACTED_CHARS:
                break
        return "\n".join(pages_text)[:MAX_EXTRACTED_CHARS]
    elif ext == "docx":
        validate_docx_archive(file_bytes)
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        paragraphs_text = []
        total_chars = 0
        # Văn bản ISO/quy chế hay đặt nội dung trong bảng: đọc cả các ô bảng.
        table_rows = (
            " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            for table in doc.tables
            for row in table.rows
        )
        for text in [p.text for p in doc.paragraphs] + list(table_rows):
            if deadline is not None and time.time() >= deadline:
                break
            paragraphs_text.append(text)
            total_chars += len(text)
            if total_chars >= MAX_EXTRACTED_CHARS:
                break
        return "\n".join(paragraphs_text)[:MAX_EXTRACTED_CHARS]
    elif ext in ("txt", "py", "md", "csv", "json", "xml"):
        if deadline is not None and time.time() >= deadline:
            return ""
        return file_bytes[:MAX_EXTRACTED_CHARS].decode("utf-8", errors="replace")
    return ""


# ─── Chunking ──────────────────────────────────────────────────

def chunk_text(text: str) -> List[str]:
    if not text.strip():
        return []
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + CHUNK_SIZE, len(words))
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start = end - CHUNK_OVERLAP
    return chunks

# ─── API key ───────────────────────────────────────────────────

def _get_gemini_api_key() -> str:
    """Key nhập ở Cấu hình trước, biến môi trường sau — cùng thứ tự với chatbot.

    Trước đây biến môi trường được ưu tiên: .env còn key cũ/giá trị mẫu thì mọi
    lần tạo embedding đều lỗi trong khi chatbot (đọc Cấu hình) vẫn chạy.
    """
    db = SessionLocal()
    try:
        from src.db.models import SystemSetting
        row = db.query(SystemSetting).filter(SystemSetting.key == "gemini_api_key").first()
        if row and (row.value or "").strip():
            return row.value.strip()
    finally:
        db.close()
    key = os.getenv("GEMINI_API_KEY", "").strip().strip("'\"")
    return "" if key == "your_gemini_api_key" else key

# ─── Embedding (sync for indexing) ─────────────────────────────

def _embed_text(text: str, api_key: Optional[str] = None, deadline: Optional[float] = None) -> List[float]:
    if not api_key:
        api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("Gemini API key is not configured")
    safe_text = redact_sensitive_content(text)
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
    payload = {"model": "models/gemini-embedding-001", "content": {"parts": [{"text": safe_text}]}}
    headers = {"x-goog-api-key": api_key}

    for attempt in range(3):
        now = time.time()
        if deadline is not None:
            remaining = deadline - now
            if remaining <= 0.2:
                raise TimeoutError(f"Embedding exceeded deadline budget ({MAX_INDEXING_SECONDS}s)")
            attempt_timeout = min(MAX_HTTP_EMBED_TIMEOUT_SECONDS, remaining)
        else:
            attempt_timeout = MAX_HTTP_EMBED_TIMEOUT_SECONDS

        try:
            with httpx.Client(timeout=attempt_timeout) as client:
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    return resp.json()["embedding"]["values"]
                if resp.status_code in (429, 503) and attempt < 2:
                    sleep_time = 1.0 * (attempt + 1)
                    if deadline is not None and time.time() + sleep_time >= deadline:
                        raise TimeoutError(f"Embedding retry would exceed deadline ({MAX_INDEXING_SECONDS}s)")
                    time.sleep(sleep_time)
                    continue
                raise RuntimeError(f"Embedding API error: {resp.status_code} {resp.text}")
        except (httpx.TimeoutException, httpx.RequestError) as net_err:
            if attempt < 2 and (deadline is None or time.time() + 0.5 < deadline):
                time.sleep(0.5 * (attempt + 1))
                continue
            if isinstance(net_err, httpx.TimeoutException):
                raise TimeoutError(f"Embedding request timed out: {net_err}")
            raise RuntimeError(f"Embedding network request error: {net_err}")


# ─── Embedding (async for chatbot queries) ─────────────────────

async def aembed_text(text: str, api_key: Optional[str] = None) -> List[float]:
    if not api_key:
        api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("Gemini API key is not configured")
    safe_text = redact_sensitive_content(text)
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
    payload = {"model": "models/gemini-embedding-001", "content": {"parts": [{"text": safe_text}]}}
    headers = {"x-goog-api-key": api_key}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Embedding API error: {resp.status_code} {resp.text}")
        return resp.json()["embedding"]["values"]

# ─── Indexing ──────────────────────────────────────────────────

SUPPORTED_INDEX_EXTENSIONS = ("pdf", "docx", "txt", "md", "csv", "json", "xml")


def index_document(file_bytes: bytes, filename: str, document_id: str, db: Session) -> int:
    """Chia tài liệu thành đoạn, tạo embedding, lưu WikiChunk. Trả về số đoạn đã lưu.

    Không lưu được đoạn nào thì raise ValueError kèm lý do tiếng Việt: worker ghi
    lý do đó vào trạng thái job để màn Wiki hiển thị, thay vì im lặng "hoàn tất".
    """
    start_time = time.time()
    deadline = start_time + MAX_INDEXING_SECONDS
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in SUPPORTED_INDEX_EXTENSIONS:
        raise ValueError(f"Định dạng .{ext or '?'} chưa hỗ trợ — hãy tải lên PDF hoặc Word (.docx)")
    text_content = extract_text_from_file(file_bytes, filename, deadline=deadline)
    if time.time() >= deadline:
        raise TimeoutError("Quá thời gian đọc nội dung tài liệu")
    if not text_content.strip():
        raise ValueError("Không đọc được chữ trong tài liệu (PDF scan/ảnh?) — cần bản có lớp chữ")
    chunks = chunk_text(text_content)[:MAX_CHUNKS]
    api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("Chưa có Gemini API Key trong Cấu hình")
    saved = 0
    for i, chunk in enumerate(chunks):
        if time.time() >= deadline:
            print(f"[wiki_rag] Document {document_id} exceeded time budget ({MAX_INDEXING_SECONDS}s), stopped at chunk {i}")
            break
        safe_chunk = redact_sensitive_content(chunk)
        try:
            embedding = _embed_text(safe_chunk, api_key, deadline=deadline)
            db.add(WikiChunk(
                id=str(uuid.uuid4()),
                document_id=document_id,
                chunk_index=i,
                content=safe_chunk,
                embedding=embedding,
            ))
            saved += 1
        except TimeoutError as te:
            print(f"[wiki_rag] Document {document_id} stopped indexing due to time budget: {te}")
            if not saved:
                raise
            break
        if i < len(chunks) - 1:
            time.sleep(0.05)
    db.flush()
    return saved


def _update_job_status(document_id: str, status: str, **kwargs) -> dict:
    """Update job state in INDEXING_JOBS while preserving retry_count across state transitions."""
    prev = INDEXING_JOBS.get(document_id, {})
    new_state = dict(prev)
    new_state.update(kwargs)
    new_state["status"] = status
    if "retry_count" not in kwargs:
        new_state["retry_count"] = prev.get("retry_count", 0)
    INDEXING_JOBS[document_id] = new_state
    return new_state


def _indexing_worker_loop():
    last_recovery_time = time.time()
    try:
        _recover_unindexed_documents(batch_size=50)
    except Exception as rec_err:
        err_str = str(rec_err).lower()
        if "no such table" not in err_str and "does not exist" not in err_str:
            print(f"[wiki_rag] Startup recovery error: {rec_err}")

    while True:
        try:
            now = time.time()
            if now - last_recovery_time >= 60.0:
                last_recovery_time = now
                try:
                    _recover_unindexed_documents(batch_size=50)
                except Exception as rec_err:
                    err_str = str(rec_err).lower()
                    if "no such table" not in err_str and "does not exist" not in err_str:
                        print(f"[wiki_rag] Periodic recovery error: {rec_err}")

            job_item = None
            redis = get_redis_client()
            if redis:
                try:
                    raw = redis.lpop(WIKI_INDEXING_REDIS_KEY)
                    if raw:
                        job_item = json.loads(raw)
                except Exception as re:
                    print(f"[wiki_rag] Redis lpop error: {re}")

            if not job_item:
                try:
                    mem_item = INDEXING_QUEUE.get(timeout=1.0)
                    if mem_item is not None:
                        if len(mem_item) == 4:
                            fbytes, fname, doc_id, obj_name = mem_item
                        else:
                            fbytes, fname, doc_id = mem_item
                            obj_name = None
                        job_item = {
                            "document_id": doc_id,
                            "filename": fname,
                            "object_name": obj_name,
                            "_file_bytes": fbytes,
                        }
                except queue.Empty:
                    continue

            if not job_item:
                continue

            document_id = job_item["document_id"]
            filename = job_item["filename"]
            object_name = job_item.get("object_name")
            file_bytes = job_item.get("_file_bytes")

            if INDEXING_JOBS.get(document_id, {}).get("status") == "CANCELLED":
                if "_file_bytes" in job_item:
                    INDEXING_QUEUE.task_done()
                continue

            if file_bytes is None and object_name:
                try:
                    from src.services.storage_service import get_file
                    file_bytes = get_file(object_name)["Body"].read()
                except Exception as fe:
                    print(f"[wiki_rag] Failed to read storage object '{object_name}' for {document_id}: {fe}")
                    _update_job_status(document_id, "FAILED", error=str(fe), failed_at=time.time())
                    if "_file_bytes" in job_item:
                        INDEXING_QUEUE.task_done()
                    continue

            if not file_bytes:
                if "_file_bytes" in job_item:
                    INDEXING_QUEUE.task_done()
                continue

            _update_job_status(document_id, "PROCESSING", started_at=time.time())
            db = SessionLocal()
            try:
                from src.db.models import WikiDocument
                # Defensive check: ensure document is committed in DB before indexing to avoid FK violations
                doc_found = False
                for _wait in range(5):
                    try:
                        if db.query(WikiDocument.id).filter(WikiDocument.id == document_id).first() is not None:
                            doc_found = True
                            break
                    except Exception as q_err:
                        err_str = str(q_err).lower()
                        if "no such table" in err_str or "does not exist" in err_str:
                            break
                        raise
                    time.sleep(0.4)
                if not doc_found:
                    print(f"[wiki_rag] Document {document_id} not committed in DB after wait, aborting indexing.")
                    _update_job_status(document_id, "FAILED", error="Document not committed in DB", failed_at=time.time())
                    continue

                saved = index_document(file_bytes, filename, document_id, db)
                db.commit()
                _update_job_status(document_id, "COMPLETED", completed_at=time.time(), chunks=saved, error=None)
            except Exception as err:
                db.rollback()
                _update_job_status(document_id, "FAILED", error=str(err), failed_at=time.time())
                print(f"[wiki_rag] Background indexing failed for {document_id}: {err}")
            finally:
                db.close()
                if "_file_bytes" in job_item:
                    INDEXING_QUEUE.task_done()
        except Exception as q_err:
            print(f"[wiki_rag] Worker loop error: {q_err}")
            time.sleep(0.5)


def _recover_unindexed_documents(batch_size: int = 50):
    """Find active WikiDocument records lacking WikiChunk entries and enqueue them."""
    db = SessionLocal()
    try:
        from src.db.models import WikiDocument
        bind = db.get_bind() if hasattr(db, "get_bind") else getattr(db, "bind", None)
        if bind:
            try:
                from sqlalchemy import inspect
                inspector = inspect(bind)
                if not (inspector.has_table("wiki_documents") and inspector.has_table("wiki_chunks")):
                    return
            except Exception:
                pass
        indexed_subq = db.query(WikiChunk.document_id).distinct()
        unindexed = (
            db.query(WikiDocument)
            .filter(WikiDocument.is_active == True)
            .filter(~WikiDocument.id.in_(indexed_subq))
            .order_by(WikiDocument.created_at.desc())
            .limit(batch_size)
            .all()
        )
        for doc in unindexed:
            job_state = INDEXING_JOBS.get(doc.id)
            if job_state:
                status = job_state.get("status")
                # Do not re-enqueue actively queued or processing jobs
                if status in ("QUEUED", "PROCESSING"):
                    continue
                # For failed jobs: retry after 60s cooldown, up to 3 total failure retries
                if status == "FAILED":
                    failed_at = job_state.get("failed_at", 0)
                    retries = job_state.get("retry_count", 0)
                    if retries >= 3 or (time.time() - failed_at < 60.0):
                        continue
                    job_state["retry_count"] = retries + 1

            if doc.link:
                fname = doc.link.rsplit("/", 1)[-1] if "/" in doc.link else "document"
                enqueue_indexing_job(None, fname, doc.id, object_name=doc.link)
    except Exception as e:
        err_str = str(e).lower()
        if "no such table" not in err_str and "does not exist" not in err_str:
            print(f"[wiki_rag] Recovery of unindexed documents error: {e}")
    finally:
        db.close()


def get_indexing_status(document_ids: List[str], db: Session) -> Dict[str, Dict[str, Any]]:
    """Trạng thái "AI đã học tài liệu chưa" cho màn Wiki: số đoạn trong DB + job gần nhất."""
    if not document_ids:
        return {}
    # Có người đang xem trạng thái mà worker chưa chạy (vd. vừa khởi động lại):
    # bật lên để tài liệu chờ được xử lý thay vì treo mãi.
    _ensure_worker_running()
    from sqlalchemy import func
    counts = dict(
        db.query(WikiChunk.document_id, func.count(WikiChunk.id))
        .filter(WikiChunk.document_id.in_(document_ids))
        .group_by(WikiChunk.document_id)
        .all()
    )
    result = {}
    for doc_id in document_ids:
        job = INDEXING_JOBS.get(doc_id, {})
        chunks = int(counts.get(doc_id, 0))
        status = job.get("status")
        if chunks and status not in ("QUEUED", "PROCESSING"):
            status = "COMPLETED"
        result[doc_id] = {
            "chunks": chunks,
            "status": status or ("COMPLETED" if chunks else "PENDING"),
            "error": job.get("error") if status == "FAILED" else None,
        }
    return result


def reset_indexing_job(document_id: str) -> None:
    """Cho phép "Học lại": xoá lịch sử lỗi/số lần thử để job được xếp hàng lại."""
    INDEXING_JOBS.pop(document_id, None)


def cancel_indexing_job(document_id: str) -> None:
    """Mark a job as cancelled and remove from Redis if queued."""
    _update_job_status(document_id, "CANCELLED", cancelled_at=time.time())
    redis = get_redis_client()
    if redis:
        try:
            items = redis.lrange(WIKI_INDEXING_REDIS_KEY, 0, -1)
            for item in items:
                try:
                    data = json.loads(item)
                    if data.get("document_id") == document_id:
                        redis.lrem(WIKI_INDEXING_REDIS_KEY, 0, item)
                except Exception:
                    pass
        except Exception:
            pass


def _ensure_worker_running():
    global _worker_started
    if not _worker_started:
        with _worker_lock:
            if not _worker_started:
                _worker_started = True
                t = threading.Thread(target=_indexing_worker_loop, daemon=True, name="wiki-indexing-worker")
                t.start()


def start_indexing_worker() -> None:
    """Bật worker (kèm vòng recovery mỗi phút) lúc khởi động app."""
    _ensure_worker_running()


def enqueue_indexing_job(
    file_bytes: Optional[bytes],
    filename: str,
    document_id: str,
    object_name: Optional[str] = None
) -> bool:
    """Enqueue document for background indexing. Returns False if queue is full."""
    _ensure_worker_running()
    redis = get_redis_client()
    if redis:
        try:
            payload = json.dumps({
                "document_id": document_id,
                "filename": filename,
                "object_name": object_name,
            })
            if hasattr(redis, "eval"):
                # Atomic capacity check and enqueue via Lua script
                result = redis.eval(_REDIS_ENQUEUE_LUA, 1, WIKI_INDEXING_REDIS_KEY, MAX_QUEUE_SIZE, payload)
                if result == 1 or result is True:
                    _update_job_status(document_id, "QUEUED", queued_at=time.time())
                    return True
                return False
            else:
                if redis.llen(WIKI_INDEXING_REDIS_KEY) < MAX_QUEUE_SIZE:
                    redis.rpush(WIKI_INDEXING_REDIS_KEY, payload)
                    _update_job_status(document_id, "QUEUED", queued_at=time.time())
                    return True
                return False
        except Exception as err:
            print(f"[wiki_rag] Redis enqueue error, falling back to local queue: {err}")

    with _queue_lock:
        try:
            INDEXING_QUEUE.put_nowait((file_bytes, filename, document_id, object_name))
            _update_job_status(document_id, "QUEUED", queued_at=time.time())
            return True
        except queue.Full:
            return False


def index_document_in_background(file_bytes: bytes, filename: str, document_id: str):
    """Enqueue indexing job in bounded queue."""
    enqueue_indexing_job(file_bytes, filename, document_id)

# ─── Deletion ──────────────────────────────────────────────────

def delete_document_chunks(document_id: str, db: Session):
    db.query(WikiChunk).filter(WikiChunk.document_id == document_id).delete()
    db.flush()

# ─── Search (parallel query, called from async chatbot) ────────

async def search_chunks(query: str, db: Session, top_k: int = SEARCH_LIMIT) -> List[Dict]:
    api_key = _get_gemini_api_key()
    if not api_key:
        return []
    query_embedding = await aembed_text(query, api_key)
    vec_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
    sql = text(f"""
        SELECT wc.content,
               wd.title AS doc_title, wd.category,
               1 - (wc.embedding <=> '{vec_str}'::vector) AS similarity
        FROM wiki_chunks wc
        JOIN wiki_documents wd ON wd.id = wc.document_id
        WHERE 1 - (wc.embedding <=> '{vec_str}'::vector) > :threshold
        ORDER BY similarity DESC
        LIMIT :top_k
    """)
    rows = db.execute(sql, {
        "threshold": SIMILARITY_THRESHOLD,
        "top_k": top_k,
    }).fetchall()
    return [
        {
            "content": row.content,
            "similarity": float(row.similarity),
            "doc_title": row.doc_title,
            "category": row.category,
        }
        for row in rows
    ]
