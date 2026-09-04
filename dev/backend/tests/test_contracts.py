import pytest
import uuid
from src.db.models import Customer, Contract, Receivable, ContractTemplate, ServiceLine


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

    template = db.query(ContractTemplate).filter(
        ContractTemplate.status == "published",
        ContractTemplate.template_storage_key.isnot(None)
    ).first()

    if not template:
        template = ContractTemplate(
            id=str(uuid.uuid4()),
            code="MAU_TEST",
            name="Mẫu Test Pytest",
            status="published",
            template_storage_key="contract-templates/MAU_TEST/v1.docx"
        )
        db.add(template)
        db.commit()

    payload = {
        "contract_id": contract_code,
        "task_id": task_code,
        "customer_name": "Test Customer Pytest",
        "service_type": "Design Consulting",
        "contract_value": 15000000.0,
        "sales_source": "Staff A",
        "contract_template_id": template.id
    }

    res = client.post("/api/contracts/", json=payload, headers=admin_headers)
    assert res.status_code in (200, 201), f"Failed creating contract: {res.text}"
    data = res.json()
    assert "status" in data or "message" in data or "id" in data

    # Cleanup
    db.query(Receivable).filter(Receivable.contract_id == contract_code).delete()
    db.query(ServiceLine).filter(ServiceLine.contract_id == contract_code).update(
        {ServiceLine.contract_id: None},
        synchronize_session=False,
    )
    c = db.query(Contract).filter(Contract.id == contract_code).first()
    if c:
        db.delete(c)
        db.commit()
