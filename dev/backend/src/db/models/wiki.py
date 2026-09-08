"""Wiki & Knowledge base models: WikiDocument, WikiChunk."""

from src.db.models._base import *
from pgvector.sqlalchemy import Vector


class WikiDocument(Base):
    __tablename__ = "wiki_documents"
    id = Column(String, primary_key=True) # e.g. ISO-001
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)
    link = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String(20), nullable=True)
    effective_date = Column(Date, nullable=True)
    author_id = Column(String, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class WikiChunk(Base):
    __tablename__ = "wiki_chunks"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("wiki_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(3072))
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
