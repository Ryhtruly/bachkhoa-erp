import pytest
import uuid
from sqlalchemy import text

from src.db.models import Customer, Contract, Receivable, ContractTemplate, ServiceLine
from tests.fixtures_so_giay_to import (
    build_test_context,
    insert_checklist_item_with_document,
    insert_document,
    insert_k01_node,
    insert_template,
)


def _require_postgresql(db):
    if db.bind.dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL because the contract fixture uses the public schema")


def test_contract_cache_status(client, admin_headers):
    res = client.get("/api/contracts/cache/status", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "status" in data or "cache" in data or "redis" in data or "contract_count" in data


def test_list_contracts(client, admin_headers):
    res = client.get("/api/contracts/", headers=admin_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list) or "items" in res.json() or "data" in res.json()


def test_contract_workspace_returns_runtime_document_types_and_files(
    client, admin_headers, admin_user, db,
):
    """Màn Giám đốc phải đọc đúng loại giấy nhân viên vừa nộp, không rơi về graph cũ."""
    _require_postgresql(db)
    context = build_test_context(db)
    service_line_id = context["hang_muc"][0]["id"]
    template_id = insert_template(db, name="CCCD runtime")
    task_node_id = insert_k01_node(db, service_line_id=service_line_id, checklist=[{
        "key": "cl-runtime",
        "name": "Tiếp nhận hồ sơ",
        "output_documents": [{
            "template_id": template_id,
            "min_count": 2,
            "required_before_submit": True,
        }],
    }])
    checklist_result_id = insert_checklist_item_with_document(
        db,
        task_node_id=task_node_id,
        name="Tiếp nhận hồ sơ",
        checklist_key="cl-runtime",
    )
    document_type_id = db.execute(text("""
        insert into public.checklist_result_document_types
            (checklist_result_id, template_id, name, normalized_name,
             source, origin, status, created_by)
        values (:checklist_result_id, :template_id, 'CCCD runtime', 'cccd runtime',
                'KHACH_HANG', 'CONFIGURED', 'pending_review', :actor_id)
        returning id
    """), {
        "checklist_result_id": checklist_result_id,
        "template_id": template_id,
        "actor_id": admin_user.id,
    }).scalar_one()
    document_id = insert_document(
        db,
        contract_id=context["contract_id"],
        file_name="cccd-mat-truoc.jpg",
    )
    db.execute(text("""
        insert into public.checklist_result_document_type_files
            (document_type_id, document_id, created_by)
        values (:document_type_id, :document_id, :actor_id)
    """), {
        "document_type_id": document_type_id,
        "document_id": document_id,
        "actor_id": admin_user.id,
    })

    response = client.get(
        "/api/contracts/workspace",
        params={"contract_id": context["contract_id"]},
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    execution_node = response.json()["service_lines"][0]["workflow"]["execution_nodes"][0]
    checklist = execution_node["checklist_results"][0]
    assert checklist["document_types"] == [{
        "id": document_type_id,
        "template_id": template_id,
        "name": "CCCD runtime",
        "source": "KHACH_HANG",
        "source_label": "Khách hàng cung cấp",
        "origin": "CONFIGURED",
        "status": "pending_review",
        "rejection_reason": None,
        "employee_change_reason": None,
        "files": [{
            "document_id": document_id,
            "file_name": "cccd-mat-truoc.jpg",
            "content_type": "application/pdf",
            "change_reason": None,
        }],
        "file_count": 1,
    }]


def test_contract_cabinet_shows_files_when_the_document_type_is_approved(
    client, admin_headers, admin_user, db,
):
    """Duyệt ở cấp loại giấy phải đưa file vào tủ dù file không có verdict riêng."""
    _require_postgresql(db)
    context = build_test_context(db)
    service_line_id = context["hang_muc"][0]["id"]
    template_id = insert_template(db, name="CCCD đã duyệt")
    task_node_id = insert_k01_node(db, service_line_id=service_line_id, checklist=[{
        "key": "cl-cabinet",
        "name": "Tiếp nhận hồ sơ",
        "output_documents": [{"template_id": template_id}],
    }])
    checklist_result_id = insert_checklist_item_with_document(
        db,
        task_node_id=task_node_id,
        name="Tiếp nhận hồ sơ",
        checklist_key="cl-cabinet",
    )
    document_type_id = db.execute(text("""
        insert into public.checklist_result_document_types
            (checklist_result_id, template_id, name, normalized_name,
             source, origin, status, created_by)
        values (:checklist_result_id, :template_id, 'CCCD đã duyệt', 'cccd đã duyệt',
                'KHACH_HANG', 'CONFIGURED', 'approved', :actor_id)
        returning id
    """), {
        "checklist_result_id": checklist_result_id,
        "template_id": template_id,
        "actor_id": admin_user.id,
    }).scalar_one()
    document_id = insert_document(
        db,
        contract_id=context["contract_id"],
        file_name="cccd-da-duyet.jpg",
    )
    # File không có quyết định riêng: toàn bộ verdict nằm trên loại giấy. Bảng
    # liên kết đời đầu thậm chí chưa có cột ``status`` và vẫn phải đọc được.
    db.execute(text("""
        insert into public.checklist_result_document_type_files
            (document_type_id, document_id, created_by)
        values (:document_type_id, :document_id, :actor_id)
    """), {
        "document_type_id": document_type_id,
        "document_id": document_id,
        "actor_id": admin_user.id,
    })

    response = client.get(
        "/api/document-register/register",
        params={
            "contract_id": context["contract_id"],
            "service_line_id": service_line_id,
        },
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    groups = response.json()["checklist_cabinet_by_node"]
    assert len(groups) == 1
    assert groups[0]["node_code"] == "K01"
    assert groups[0]["done"] == 1
    assert groups[0]["documents"][0]["files"] == [{
        "id": document_id,
        "document_id": document_id,
        "file_name": "cccd-da-duyet.jpg",
        "content_type": "application/pdf",
    }]


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
