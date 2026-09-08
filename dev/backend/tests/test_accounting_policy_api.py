import uuid

from src.core.auth import create_access_token, hash_password
from src.db.models import AdvanceRequest, CashflowTransaction, Employee, User


def test_employee_advance_request_does_not_create_cashflow(client, db):
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        username=f"advance_request_{uuid.uuid4().hex[:8]}",
        password_hash=hash_password("password123"),
        email=f"{uuid.uuid4().hex[:8]}@test.local",
        is_active=True,
    )
    employee = Employee(
        id=f"emp_{uuid.uuid4().hex[:10]}",
        user_id=user_id,
        full_name="Nhân viên xin tạm ứng",
        is_active=True,
    )
    db.add_all([user, employee])
    db.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user_id)}"}
    response = client.post(
        "/api/employee-portal/advance-requests",
        json={"amount": 250000, "note": "Đi công tác hiện trường", "payment_method": "CASH"},
        headers=headers,
    )

    assert response.status_code == 200
    request = db.query(AdvanceRequest).filter(AdvanceRequest.id == response.json()["id"]).one()
    assert request.status == "PENDING"
    assert db.query(CashflowTransaction).filter(CashflowTransaction.id == request.official_transaction_id).count() == 0


def test_public_official_advance_route_requires_approved_request(client, admin_headers):
    response = client.post(
        "/api/finance/advance/create",
        json={"amount": 250000, "payer_payee": "Nhân viên", "payment_method": "CASH"},
        headers=admin_headers,
    )

    assert response.status_code == 400
    assert "yêu cầu đã được Giám đốc duyệt" in response.json()["detail"]


def test_legacy_cashflow_route_cannot_create_advance_directly(client, admin_headers, db):
    response = client.post(
        "/api/cashflow/transactions",
        json={
            "transaction_type": "ADVANCE",
            "amount": 250000,
            "payer_payee_name": "Nhân viên",
            "payment_method": "CASH",
            "department": "Phòng Kế toán",
            "description": "Không được tạo tạm ứng ngoài quy trình",
        },
        headers=admin_headers,
    )

    assert response.status_code == 400
    assert "quy trình phiếu chuyên biệt" in response.json()["detail"]
    assert db.query(CashflowTransaction).filter(
        CashflowTransaction.description == "Không được tạo tạm ứng ngoài quy trình"
    ).count() == 0
