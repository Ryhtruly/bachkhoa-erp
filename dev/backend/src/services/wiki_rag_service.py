import io
import os
import uuid
import httpx
from typing import List, Dict, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.db.models import WikiChunk
from src.db.database import SessionLocal

CHUNK_SIZE = 500
CHUNK_OVERLAP = 100
EMBED_MODEL = "text-embedding-004"
# Gemini API compatible models — use native API below, not OpenAI-compat
EMBED_MODEL_NATIVE = "models/gemini-embedding-001"
SEARCH_LIMIT = 5
SIMILARITY_THRESHOLD = 0.5

# ─── Text extraction ───────────────────────────────────────────

def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext == "pdf":
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        return "\n".join(page.get_text() for page in doc)
    elif ext == "docx":
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)
    elif ext in ("txt", "py", "md", "csv", "json", "xml"):
        return file_bytes.decode("utf-8", errors="replace")
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
    key = os.getenv("GEMINI_API_KEY", "")
    if not key or key == "your_gemini_api_key":
        db = SessionLocal()
        try:
            from src.db.models import SystemSetting
            row = db.query(SystemSetting).filter(SystemSetting.key == "gemini_api_key").first()
            if row and row.value:
                key = row.value
        finally:
            db.close()
    return key

# ─── Embedding (sync for indexing) ─────────────────────────────

def _embed_text(text: str, api_key: Optional[str] = None) -> List[float]:
    if not api_key:
        api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("Gemini API key is not configured")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={api_key}"
    payload = {"model": "models/gemini-embedding-001", "content": {"parts": [{"text": text}]}}
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Embedding API error: {resp.status_code} {resp.text}")
        return resp.json()["embedding"]["values"]

# ─── Embedding (async for chatbot queries) ─────────────────────

async def aembed_text(text: str, api_key: Optional[str] = None) -> List[float]:
    if not api_key:
        api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("Gemini API key is not configured")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={api_key}"
    payload = {"model": "models/gemini-embedding-001", "content": {"parts": [{"text": text}]}}
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Embedding API error: {resp.status_code} {resp.text}")
        return resp.json()["embedding"]["values"]

# ─── Indexing ──────────────────────────────────────────────────

def index_document(file_bytes: bytes, filename: str, document_id: str, db: Session):
    text_content = extract_text_from_file(file_bytes, filename)
    if not text_content.strip():
        return
    chunks = chunk_text(text_content)
    if not chunks:
        return
    api_key = _get_gemini_api_key()
    if not api_key:
        print("[wiki_rag] No Gemini API key, skipping embedding")
        return
    for i, chunk in enumerate(chunks):
        embedding = _embed_text(chunk, api_key)
        db.add(WikiChunk(
            id=str(uuid.uuid4()),
            document_id=document_id,
            chunk_index=i,
            content=chunk,
            embedding=embedding,
        ))
    db.flush()

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
