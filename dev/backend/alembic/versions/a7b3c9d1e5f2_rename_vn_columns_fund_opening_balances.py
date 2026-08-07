"""Rename Vietnamese columns in fund_opening_balances to English and add created_at

Revision ID: a7b3c9d1e5f2
Revises: 122f7a9c63e6
Create Date: 2026-08-07 19:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b3c9d1e5f2'
down_revision: Union[str, Sequence[str], None] = '122f7a9c63e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename Vietnamese columns to English in fund_opening_balances and add created_at."""
    op.alter_column('fund_opening_balances', 'hinh_thuc', new_column_name='payment_method')
    op.alter_column('fund_opening_balances', 'so_tien_dau_ky', new_column_name='opening_balance')
    op.alter_column('fund_opening_balances', 'ngay_ap_dung', new_column_name='effective_date')
    op.alter_column('fund_opening_balances', 'nguoi_chot', new_column_name='closing_user')
    op.alter_column('fund_opening_balances', 'ghi_chu', new_column_name='notes')
    op.add_column('fund_opening_balances', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade() -> None:
    """Revert English columns back to Vietnamese in fund_opening_balances and drop created_at."""
    op.drop_column('fund_opening_balances', 'created_at')
    op.alter_column('fund_opening_balances', 'payment_method', new_column_name='hinh_thuc')
    op.alter_column('fund_opening_balances', 'opening_balance', new_column_name='so_tien_dau_ky')
    op.alter_column('fund_opening_balances', 'effective_date', new_column_name='ngay_ap_dung')
    op.alter_column('fund_opening_balances', 'closing_user', new_column_name='nguoi_chot')
    op.alter_column('fund_opening_balances', 'notes', new_column_name='ghi_chu')
