"""Add immutable commission snapshot fields to contracts.

Revision ID: c1d4e7f9a2b0
Revises: b8c4d2e6f1a3
Create Date: 2026-09-18 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d4e7f9a2b0"
down_revision: Union[str, Sequence[str], None] = "b8c4d2e6f1a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "contracts",
        sa.Column("commission_rate_snapshot", sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        "contracts",
        sa.Column("commission_locked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_contracts_sale_id",
        "contracts",
        ["sale_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_contracts_sale_id", table_name="contracts")
    op.drop_column("contracts", "commission_locked_at")
    op.drop_column("contracts", "commission_rate_snapshot")
