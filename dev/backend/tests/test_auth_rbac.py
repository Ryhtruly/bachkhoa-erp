import pytest
from src.db.models import AuditLog


def test_unauthenticated_access_returns_401(client):
    protected_urls = [
        "/api/finance/cashflow",
        "/api/hopdong/",
        "/api/payroll/options",
        "/api/crm/leads",
        "/api/settings",
        "/api/wiki/",
        "/api/hoso/",
    ]
    for url in protected_urls:
        res = client.get(url)
        assert res.status_code == 401, f"Expected 401 for GET {url}, got {res.status_code}"


def test_unprivileged_user_returns_403(client, unprivileged_user):
    user, headers = unprivileged_user
    protected_urls = [
        "/api/finance/cashflow",
        "/api/hopdong/",
        "/api/payroll/options",
        "/api/crm/leads",
        "/api/settings",
        "/api/wiki/",
        "/api/hoso/",
    ]
    for url in protected_urls:
        res = client.get(url, headers=headers)
        assert res.status_code == 403, f"Expected 403 for GET {url}, got {res.status_code}"


def test_admin_superuser_access(client, admin_headers):
    res = client.get("/api/finance/cashflow", headers=admin_headers)
    assert res.status_code == 200


def test_finance_clerk_rbac_and_audit_propagation(client, finance_clerk_user, db):
    user, headers = finance_clerk_user

    # Should ALLOW finance read
    res_fin = client.get("/api/finance/cashflow", headers=headers)
    assert res_fin.status_code == 200

    # Should FORBID CRM read
    res_crm = client.get("/api/crm/leads", headers=headers)
    assert res_crm.status_code == 403

    # AuditLog actor_id verification on write
    payload = {
        "type": "Thu",
        "amount": 500000.0,
        "category": "Thu test audit",
        "payer_payee": "Khách hàng Audit Pytest",
        "payment_method": "Tiền mặt",
        "transaction_date": "2026-07-28",
        "description": "Test audit log propagation in pytest",
        "scope": "Công ty"
    }

    res_create = client.post("/api/finance/cashflow/create", json=payload, headers=headers)
    assert res_create.status_code == 200
    voucher_id = res_create.json()["id"]

    audit_entry = db.query(AuditLog).filter(
        AuditLog.action == "CREATE",
        AuditLog.object_type == "CashflowTransaction"
    ).order_by(AuditLog.id.desc()).first()

    assert audit_entry is not None
    assert audit_entry.actor_id == user.id
