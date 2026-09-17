"""Grant wiki read permissions to operational roles

Revision ID: b8c4d2e6f1a3
Revises: a7b3c9d1e5f2
Create Date: 2026-09-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c4d2e6f1a3'
down_revision: Union[str, Sequence[str], None] = 'a7b3c9d1e5f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Ensure permissions exist
    op.execute(
        """
        INSERT INTO permissions (code, resource_code, action_code, scope_code, name, description, is_active)
        VALUES
            ('wiki.read.all', 'wiki', 'read', 'all', 'Xem tai lieu noi bo', 'Doc tai lieu Wiki/ISO', true),
            ('wiki.create.all', 'wiki', 'create', 'all', 'Tao tai lieu noi bo', 'Dang tai lieu Wiki', true),
            ('wiki.update.all', 'wiki', 'update', 'all', 'Sua tai lieu noi bo', 'Cap nhat tai lieu Wiki', true)
        ON CONFLICT (code) DO UPDATE
        SET is_active = true;
        """
    )

    # 2. Grant wiki.read.all to accountant, sales, survey_staff, legal_staff
    op.execute(
        """
        WITH role_map(role_name, permission_code) AS (
            VALUES
                ('accountant', 'wiki.read.all'),
                ('sales', 'wiki.read.all'),
                ('survey_staff', 'wiki.read.all'),
                ('legal_staff', 'wiki.read.all')
        )
        INSERT INTO role_permission_grants (role_id, permission_code, note)
        SELECT r.id, role_map.permission_code, 'Grant wiki read access to staff roles'
        FROM role_map
        JOIN roles r ON r.role_name = role_map.role_name
        ON CONFLICT (role_id, permission_code) DO NOTHING;
        """
    )

    # 3. Populate legacy role_permissions table
    op.execute(
        """
        WITH legacy_wiki(role_name, resource, can_read, can_create, can_update, can_delete, can_approve) AS (
            VALUES
                ('admin', 'wiki', true, true, true, true, true),
                ('accountant', 'wiki', true, false, false, false, false),
                ('sales', 'wiki', true, false, false, false, false),
                ('survey_staff', 'wiki', true, false, false, false, false),
                ('legal_staff', 'wiki', true, false, false, false, false)
        )
        INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete, can_approve)
        SELECT r.id, lw.resource, lw.can_read, lw.can_create, lw.can_update, lw.can_delete, lw.can_approve
        FROM legacy_wiki lw
        JOIN roles r ON r.role_name = lw.role_name
        ON CONFLICT (role_id, resource) DO UPDATE
        SET
            can_read = EXCLUDED.can_read,
            can_create = EXCLUDED.can_create,
            can_update = EXCLUDED.can_update,
            can_delete = EXCLUDED.can_delete,
            can_approve = EXCLUDED.can_approve;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permission_grants
        WHERE permission_code = 'wiki.read.all'
          AND role_id IN (
              SELECT id FROM roles WHERE role_name IN ('accountant', 'sales', 'survey_staff', 'legal_staff')
          );
        """
    )
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE resource = 'wiki'
          AND role_id IN (
              SELECT id FROM roles WHERE role_name IN ('accountant', 'sales', 'survey_staff', 'legal_staff')
          );
        """
    )
