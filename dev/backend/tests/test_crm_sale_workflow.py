import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy import func

from src.core.auth import create_access_token, hash_password
from src.db.models import (
    Customer,
    Employee,
    LeadPipeline,
    Role,
    RolePermission,
    User,
    UserRole,
)


def _create_crm_user(db, username_prefix="sale", is_sales=True):
    uid = str(uuid.uuid4())
    username = f"{username_prefix}_{uuid.uuid4().hex[:6]}"
    user = User(
        id=uid,
        username=username,
        password_hash=hash_password("password123"),
        email=f"{username}@test.local",
        is_active=True,
    )
    db.add(user)
    db.flush()

    role_name = "sales" if is_sales else "viewer"
    role = db.query(Role).filter(Role.role_name == role_name).first()
    if role is None:
        max_role_id = db.query(func.max(Role.id)).scalar() or 0
        role = Role(
            id=max_role_id + 1,
            role_name=role_name,
            display_name="Kinh doanh" if is_sales else "Xem",
            is_active=True,
        )
        db.add(role)
        db.flush()

    user_role = UserRole(user_id=user.id, role_id=role.id)
    db.add(user_role)

    perm = db.query(RolePermission).filter(
        RolePermission.role_id == role.id,
        RolePermission.resource == "crm",
    ).first()
    if perm is None:
        perm = RolePermission(
            role_id=role.id,
            resource="crm",
            can_read=True,
            can_create=True,
            can_update=True,
            can_delete=False,
            can_approve=False,
        )
        db.add(perm)
    else:
        perm.can_read = True
        perm.can_update = True
        perm.can_create = True
        db.add(perm)

    db.commit()
    token = create_access_token(str(user.id))
    headers = {"Authorization": f"Bearer {token}"}
    return user, headers


def test_director_crm_view_shows_sales_avatar_and_name(client, admin_headers, db):
    """Giám đốc xem danh sách CRM thấy được tên và avatar của Sale đang phụ trách lead."""
    sale_user, _ = _create_crm_user(db, username_prefix="sale_avt")
    emp = Employee(
        id=f"emp_{uuid.uuid4().hex[:8]}",
        user_id=sale_user.id,
        full_name="Trần Thảo Sale",
        avatar_url="https://res.cloudinary.com/demo/image/upload/sample_avatar.jpg",
        is_active=True,
    )
    cust = Customer(
        id=str(uuid.uuid4()),
        full_name="Khách Hàng Avatar Test",
        phone="0909000111",
    )
    db.add_all([emp, cust])
    db.commit()

    lead_id = f"LEAD-{uuid.uuid4().hex[:6].upper()}"
    lead = LeadPipeline(
        id=lead_id,
        customer_id=cust.id,
        source="Facebook",
        requirements="Đo đạc hiện trạng 500m2",
        status="Tiếp cận",
        assigned_to=sale_user.id,
    )
    db.add(lead)
    db.commit()

    res = client.get("/api/crm/leads?scope=all", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    target = next((item for item in data if item["id"] == lead_id), None)
    assert target is not None
    assert target["assigned_to_name"] == "Trần Thảo Sale"
    assert target["assigned_to_avatar_url"] == "https://res.cloudinary.com/demo/image/upload/sample_avatar.jpg"


def test_sales_crm_view_mine_filters_correctly(client, db):
    """Màn hình sale lọc scope=mine chỉ hiện lead của chính mình và lead chưa ai nhận."""
    sale_a, headers_a = _create_crm_user(db, username_prefix="sale_a")
    sale_b, _ = _create_crm_user(db, username_prefix="sale_b")

    cust = Customer(id=str(uuid.uuid4()), full_name="Khách Chung", phone="0909111222")
    db.add(cust)
    db.commit()

    lead_mine = LeadPipeline(
        id=f"LEAD-MINE-{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        status="Tiếp cận",
        assigned_to=sale_a.id,
    )
    lead_free = LeadPipeline(
        id=f"LEAD-FREE-{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        status="Tiếp cận",
        assigned_to=None,
    )
    lead_other = LeadPipeline(
        id=f"LEAD-OTHER-{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        status="Tiếp cận",
        assigned_to=sale_b.id,
    )
    db.add_all([lead_mine, lead_free, lead_other])
    db.commit()

    res = client.get("/api/crm/leads?scope=mine", headers=headers_a)
    assert res.status_code == 200
    data = res.json()["data"]
    lead_ids = [l["id"] for l in data]

    assert lead_mine.id in lead_ids
    assert lead_free.id in lead_ids
    assert lead_other.id not in lead_ids


def test_sales_claim_lead_success(client, db):
    """Nhân viên sale nhận lead chưa phân công thành công."""
    sale_user, headers = _create_crm_user(db, username_prefix="sale_claim")
    cust = Customer(id=str(uuid.uuid4()), full_name="Khách Claim", phone="0909333444")
    db.add(cust)
    db.commit()

    lead = LeadPipeline(
        id=f"LEAD-CLAIM-{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        status="Tiếp cận",
        assigned_to=None,
    )
    db.add(lead)
    db.commit()

    res = client.post(f"/api/crm/leads/{lead.id}/claim", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "success"
    assert res.json()["data"]["assigned_to"] == sale_user.id

    db.refresh(lead)
    assert lead.assigned_to == sale_user.id


def test_sales_claim_already_assigned_lead_fails_409(client, db):
    """Lead đã có người nhận thì sale khác không thể nhận đè (409 Conflict)."""
    sale_owner, _ = _create_crm_user(db, username_prefix="sale_owner")
    sale_other, headers_other = _create_crm_user(db, username_prefix="sale_other")

    cust = Customer(id=str(uuid.uuid4()), full_name="Khách Conflict", phone="0909555666")
    db.add(cust)
    db.commit()

    lead = LeadPipeline(
        id=f"LEAD-CONF-{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        status="Tiếp cận",
        assigned_to=sale_owner.id,
    )
    db.add(lead)
    db.commit()

    res = client.post(f"/api/crm/leads/{lead.id}/claim", headers=headers_other)
    assert res.status_code == 409
    assert "already assigned" in res.json()["detail"].lower()


def test_update_status_unassigned_lead_fails_409(client, db):
    """Chuyển trạng thái khi lead chưa có người phụ trách bị chặn yêu cầu Claim trước (409)."""
    sale_user, headers = _create_crm_user(db, username_prefix="sale_unassigned")
    cust = Customer(id=str(uuid.uuid4()), full_name="Khách Status Unassigned", phone="0909777888")
    db.add(cust)
    db.commit()

    lead = LeadPipeline(
        id=f"LEAD-UNASS-{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        status="Tiếp cận",
        assigned_to=None,
    )
    db.add(lead)
    db.commit()

    res = client.put(
        f"/api/crm/leads/{lead.id}/status",
        json={"new_status": "Báo giá"},
        headers=headers,
    )
    assert res.status_code == 409
    assert "claim" in res.json()["detail"].lower()


def test_sales_drag_drop_after_claim_succeeds(client, db):
    """Sale đã nhận lead được phép chuyển trạng thái pipeline bình thường."""
    sale_user, headers = _create_crm_user(db, username_prefix="sale_update")
    cust = Customer(id=str(uuid.uuid4()), full_name="Khách Pipeline Update", phone="0909999000")
    db.add(cust)
    db.commit()

    lead = LeadPipeline(
        id=f"LEAD-UPD-{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        status="Tiếp cận",
        assigned_to=sale_user.id,
    )
    db.add(lead)
    db.commit()

    res = client.put(
        f"/api/crm/leads/{lead.id}/status",
        json={"new_status": "Báo giá"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    db.refresh(lead)
    assert lead.status == "Báo giá"


def test_non_manager_cannot_access_settings(client, admin_headers, db):
    """Sale không có quyền giám đốc/kế toán bị cấm truy cập /api/crm/settings."""
    _, sale_headers = _create_crm_user(db, username_prefix="sale_settings")

    res_sale = client.get("/api/crm/settings", headers=sale_headers)
    assert res_sale.status_code == 403

    res_admin = client.get("/api/crm/settings", headers=admin_headers)
    assert res_admin.status_code == 200
    assert "commission_rate_percent" in res_admin.json()["data"]
