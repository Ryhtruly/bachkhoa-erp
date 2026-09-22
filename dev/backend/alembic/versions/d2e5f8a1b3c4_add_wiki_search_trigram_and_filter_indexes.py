"""Add wiki search trigram and filter indexes.

Revision ID: d2e5f8a1b3c4
Revises: c1d4e7f9a2b0
Create Date: 2026-09-22 21:55:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d2e5f8a1b3c4"
down_revision: Union[str, Sequence[str], None] = "c1d4e7f9a2b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. B-tree indexes for filter and sort columns (compatible with both PostgreSQL and SQLite)
    op.create_index(
        "ix_wiki_documents_category",
        "wiki_documents",
        ["category"],
        unique=False,
    )
    op.create_index(
        "ix_wiki_documents_is_active",
        "wiki_documents",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_wiki_documents_created_at",
        "wiki_documents",
        ["created_at"],
        unique=False,
    )

    # 2. PostgreSQL-specific GIN Trigram index for fast fuzzy & substring ILIKE search
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
        op.execute(
            "CREATE INDEX IF NOT EXISTS idx_wiki_documents_title_trgm "
            "ON wiki_documents USING gin (title gin_trgm_ops);"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS idx_wiki_documents_title_trgm;")

    op.drop_index("ix_wiki_documents_created_at", table_name="wiki_documents")
    op.drop_index("ix_wiki_documents_is_active", table_name="wiki_documents")
    op.drop_index("ix_wiki_documents_category", table_name="wiki_documents")
