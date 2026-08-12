import pytest
import uuid
from src.db.models import Customer, Contract, Receivable


def test_contract_cache_status(client, admin_headers):
    res = client.get("/api/contracts/cache/status", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "status" in data or "cache" in data or "redis" in data or "contract_count" in data


def test_list_contracts(client, admin_headers):
    res = client.get("/api/contracts/", headers=admin_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list) or "items" in res.json() or "data" in res.json()


def test_create_contract(client, admin_headers, db):
    contract_code = f"HD-TEST-{uuid.uuid4().hex[:4]}"
    task_code = f"HS-TEST-{uuid.uuid4().hex[:4]}"

    payload = {
        "contract_id": contract_code,
        "task_id": task_code,
        "customer_name": "Test Customer Pytest",
        "service_type": "Design Consulting",
        "contract_value": 15000000.0,
        "sales_source": "Staff A"
    }

    res = client.post("/api/contracts/", json=payload, headers=admin_headers)
    assert res.status_code in (200, 201), f"Failed creating contract: {res.text}"
    data = res.json()
    assert "status" in data or "message" in data or "id" in data

    # Cleanup
    db.query(Receivable).filter(Receivable.contract_id == contract_code).delete()
    c = db.query(Contract).filter(Contract.id == contract_code).first()
    if c:
        db.delete(c)
        db.commit()
