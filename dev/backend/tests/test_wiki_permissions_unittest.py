import uuid
import pytest
from src.db.models import User, Role, UserRole, RolePermission, Employee, Permission, RolePermissionGrant
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
    # Grant wiki read permission in legacy RolePermission
    perm = RolePermission(
        role_id=role_staff.id,
        resource="wiki",
        can_read=True,
        can_create=False,
    )
    db.add_all([user_role, perm])

    # Also grant normalized RBAC if table is populated
    wiki_perms = db.query(Permission).filter(
        Permission.resource_code == "wiki",
        Permission.action_code == "read",
        Permission.is_active.is_(True),
    ).all()
    for wp in wiki_perms:
        db.add(RolePermissionGrant(role_id=role_staff.id, permission_code=wp.code))

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
        db.query(RolePermissionGrant).filter(RolePermissionGrant.role_id == role_staff.id).delete()
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
    staff_role = db.query(Role).filter(Role.role_name == "accountant").first()
    created_role = False
    if not staff_role:
        staff_role = Role(
            role_name="accountant",
            display_name="Ke Toan",
            is_active=True,
        )
        db.add(staff_role)
        created_role = True
    db.add(staff_user)
    db.flush()
    db.add(UserRole(user_id=staff_user.id, role_id=staff_role.id))

    # Grant wiki read only in RolePermission
    perm = db.query(RolePermission).filter(
        RolePermission.role_id == staff_role.id,
        RolePermission.resource == "wiki",
    ).first()
    created_perm = False
    if not perm:
        perm = RolePermission(
            role_id=staff_role.id,
            resource="wiki",
            can_read=True,
            can_create=False,
        )
        db.add(perm)
        created_perm = True
    else:
        perm.can_read = True
        perm.can_create = False

    # Also grant normalized RBAC if table is populated
    wiki_perms = db.query(Permission).filter(
        Permission.resource_code == "wiki",
        Permission.action_code == "read",
        Permission.is_active.is_(True),
    ).all()
    created_grants = []
    for wp in wiki_perms:
        has_grant = db.query(RolePermissionGrant).filter(
            RolePermissionGrant.role_id == staff_role.id,
            RolePermissionGrant.permission_code == wp.code,
        ).first()
        if not has_grant:
            db.add(RolePermissionGrant(role_id=staff_role.id, permission_code=wp.code))
            created_grants.append(wp.code)

    db.commit()

    try:
        headers = {"Authorization": f"Bearer {create_access_token(staff_user.id)}"}

        # 1. GET /api/wiki/ should be ALLOWED (200)
        res_list = client.get("/api/wiki/", headers=headers)
        assert res_list.status_code == 200

        # 1b. Test cached default view
        res_list_cached = client.get("/api/wiki/", headers=headers)
        assert res_list_cached.status_code == 200
        assert res_list_cached.json()["status"] == "success"

        # 1c. Test search query filter with empty result short-circuit
        res_search_empty = client.get("/api/wiki/?search=NON_EXISTENT_DOC_XYZ", headers=headers)
        assert res_search_empty.status_code == 200
        assert res_search_empty.json()["data"] == []
        assert res_search_empty.json()["meta"]["total_items"] == 0

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
        if created_grants:
            db.query(RolePermissionGrant).filter(
                RolePermissionGrant.role_id == staff_role.id,
                RolePermissionGrant.permission_code.in_(created_grants),
            ).delete(synchronize_session=False)
        if created_perm:
            db.query(RolePermission).filter(
                RolePermission.role_id == staff_role.id,
                RolePermission.resource == "wiki",
            ).delete()
        db.query(UserRole).filter(UserRole.user_id == staff_user.id).delete()
        db.query(User).filter(User.id == staff_user.id).delete()
        if created_role:
            db.query(Role).filter(Role.id == staff_role.id).delete()
        db.commit()
