import uuid
import pytest
from src.db.models import User, Role, UserRole, RolePermission, Employee
from src.routes.routes_auth import _build_user_profile
from src.core.auth import check_user_permission, create_access_token


def test_build_user_profile_includes_wiki_permission(db):
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        username=f"user_wiki_{user_id[:8]}",
        password_hash="hashed",
        is_active=True,
    )
    role_staff = Role(
        role_name=f"role_wiki_{user_id[:8]}",
        display_name="Role with Wiki",
        is_active=True,
    )
    db.add_all([user, role_staff])
    db.flush()

    user_role = UserRole(user_id=user.id, role_id=role_staff.id)
    # Grant wiki read permission
    perm = RolePermission(
        role_id=role_staff.id,
        resource="wiki",
        can_read=True,
        can_create=False,
    )
    db.add_all([user_role, perm])
    db.commit()

    try:
        profile = _build_user_profile(user, db)
        assert "wiki" in profile["permissions"], "Profile permissions must include 'wiki'"
        assert profile["permissions"]["wiki"] is True, "User with wiki can_read must have permissions.wiki = True"

        # Now test user without wiki read
        user_no_wiki = User(
            id=str(uuid.uuid4()),
            username=f"no_wiki_{user_id[:8]}",
            password_hash="hashed",
            is_active=True,
        )
        role_no_wiki = Role(
            role_name=f"role_no_wiki_{user_id[:8]}",
            display_name="Role without Wiki",
            is_active=True,
        )
        db.add_all([user_no_wiki, role_no_wiki])
        db.flush()
        db.add(UserRole(user_id=user_no_wiki.id, role_id=role_no_wiki.id))
        db.commit()

        profile_no_wiki = _build_user_profile(user_no_wiki, db)
        assert profile_no_wiki["permissions"]["wiki"] is False, "User without wiki read must have permissions.wiki = False"

    finally:
        db.query(RolePermission).filter(RolePermission.role_id == role_staff.id).delete()
        db.query(UserRole).filter(UserRole.user_id.in_([user.id, user_no_wiki.id])).delete()
        db.query(User).filter(User.id.in_([user.id, user_no_wiki.id])).delete()
        db.query(Role).filter(Role.id.in_([role_staff.id, role_no_wiki.id])).delete()
        db.commit()


def test_wiki_endpoint_permissions_enforcement(client, db):
    """Staff roles (accountant, sales, survey_staff, legal_staff) may read Wiki but not upload."""
    uid = str(uuid.uuid4())
    staff_user = User(
        id=uid,
        username=f"staff_{uid[:8]}",
        password_hash="hashed",
        is_active=True,
    )
    staff_role = Role(
        role_name="accountant",
        display_name="Ke Toan",
        is_active=True,
    )
    db.add_all([staff_user, staff_role])
    db.flush()
    db.add(UserRole(user_id=staff_user.id, role_id=staff_role.id))
    # Grant wiki read only
    db.add(RolePermission(
        role_id=staff_role.id,
        resource="wiki",
        can_read=True,
        can_create=False,
    ))
    db.commit()

    try:
        headers = {"Authorization": f"Bearer {create_access_token(staff_user.id)}"}

        # 1. GET /api/wiki/ should be ALLOWED (200)
        res_list = client.get("/api/wiki/", headers=headers)
        assert res_list.status_code == 200

        # 2. POST /api/wiki/upload should be FORBIDDEN (403)
        res_upload = client.post(
            "/api/wiki/upload",
            headers=headers,
            data={"id": "W-01", "title": "Test", "category": "ISO"},
            files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
        )
        assert res_upload.status_code == 403
        assert "Không có quyền" in res_upload.json().get("detail", "")

    finally:
        db.query(RolePermission).filter(RolePermission.role_id == staff_role.id).delete()
        db.query(UserRole).filter(UserRole.user_id == staff_user.id).delete()
        db.query(User).filter(User.id == staff_user.id).delete()
        db.query(Role).filter(Role.id == staff_role.id).delete()
        db.commit()
