import pytest
from unittest.mock import patch
from datetime import date, datetime, timezone
import uuid

from src.db.models import CashflowTransaction, Employee, Department, User
from src.core.auth import hash_password
from src.finance.repository import FinanceRepository
from src.finance.enums import TransactionStatus, TransactionType, PaymentMethod, TransactionScope


def test_export_monthly_dashboard_excel(client, admin_headers):
    headers = admin_headers
    res = client.get("/api/finance/export/monthly-dashboard-excel?month=2026-08", headers=headers)
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("content-type", "")
    assert len(res.content) > 1000


def test_monthly_dashboard_uses_created_at_when_transaction_date_is_missing(db):
    transaction = CashflowTransaction(
        id=f"TEST-EXPORT-{uuid.uuid4().hex[:10]}",
        transaction_date=None,
        created_at=datetime(2026, 8, 15, 10, 0, tzinfo=timezone.utc),
        transaction_type=TransactionType.EXPENSE.value,
        amount=123456,
        category_code="Chi phí kiểm thử báo cáo",
        payment_method=PaymentMethod.CASH.value,
        scope=TransactionScope.COMPANY.value,
        status=TransactionStatus.COMPLETED.value,
    )
    db.add(transaction)
    db.flush()

    result = FinanceRepository.get_monthly_dashboard(db, "2026-08")

    assert result["total_expenditure"] >= 123456

    db.delete(transaction)
    db.flush()


def test_cashflow_cash_returns_period_balance_context(client, admin_headers):
    response = client.get(
        "/api/finance/cashflow/cash?month=2026-08",
        headers=admin_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "opening_balance" in body
    assert "closing_balance" in body


def test_export_employee_ledger_excel(client, finance_clerk_user, db):
    user, headers = finance_clerk_user
    emp = db.query(Employee).filter(Employee.id == "emp-01").first()
    if not emp:
        emp = Employee(id="emp-01", full_name="Nguyen Hoan Khai", is_active=True)
        db.add(emp)
        db.commit()

    mock_ledger = {
        "status": "success",
        "data": {
            "employee": {
                "id": "emp-01",
                "full_name": "Nguyen Hoan Khai",
                "job_title": "Ky thuat vien do ve",
                "department": "Phong Do ve"
            },
            "period_range": "26/07/2026 – 25/08/2026",
            "period_status": "Open",
            "summary": {
                "approved": 5000000.0,
                "pending": 1200000.0,
                "estimated": 0.0,
                "total_allowance": 200000.0,
                "total_bonus": 300000.0,
                "total_deduction": 0.0,
                "total_net": 5500000.0
            },
            "details": [
                {
                    "contract_code": "HD-2026-001",
                    "task_name": "Đo đạc hiện trạng",
                    "role": "main",
                    "recorded_at": "12/08/2026",
                    "piece_rate": 2500000.0,
                    "allowance": 100000.0,
                    "bonus": 0.0,
                    "penalty": 0.0,
                    "net_amount": 2600000.0,
                    "payment_status": "Đã duyệt"
                }
            ],
            "adjustments": []
        }
    }

    with patch("src.routes.routes_finance_export.get_employee_ledger", return_value=mock_ledger):
        res = client.get("/api/payroll/export/employee-ledger-excel?employee_id=emp-01&year=2026&month=8", headers=headers)
        assert res.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("content-type", "")
        assert len(res.content) > 1000


def test_unprivileged_employee_can_export_own_ledger_excel(client, unprivileged_user, db):
    user, headers = unprivileged_user
    emp_id = f"emp-own-{uuid.uuid4().hex[:6]}"
    emp = Employee(id=emp_id, user_id=user.id, full_name="Nhan Vien Rieng", is_active=True)
    db.add(emp)
    db.commit()

    mock_ledger = {
        "status": "success",
        "data": {
            "employee": {"id": emp_id, "full_name": "Nhan Vien Rieng"},
            "summary": {"approved": 1000000.0, "total_net": 1000000.0},
            "details": [],
            "adjustments": []
        }
    }
    try:
        with patch("src.routes.routes_finance_export.get_employee_ledger", return_value=mock_ledger):
            res = client.get(f"/api/payroll/export/employee-ledger-excel?employee_id={emp_id}&year=2026&month=8", headers=headers)
            assert res.status_code == 200
            assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("content-type", "")
            assert len(res.content) > 500
    finally:
        db.delete(emp)
        db.commit()


def test_unprivileged_employee_cannot_export_other_employee_ledger_excel(client, unprivileged_user, db):
    user, headers = unprivileged_user
    other_uid = str(uuid.uuid4())
    other_u = User(
        id=other_uid,
        username=f"other_{uuid.uuid4().hex[:6]}",
        password_hash=hash_password("password123"),
        email=f"other_{uuid.uuid4().hex[:6]}@test.local",
        is_active=True,
    )
    db.add(other_u)
    db.flush()
    other_emp = Employee(id=f"emp-other-{uuid.uuid4().hex[:6]}", user_id=other_uid, full_name="Nhan Vien Khac", is_active=True)
    db.add(other_emp)
    db.commit()

    try:
        res = client.get(f"/api/payroll/export/employee-ledger-excel?employee_id={other_emp.id}&year=2026&month=8", headers=headers)
        assert res.status_code == 403
        assert "Bạn chỉ được xem bảng lương của chính mình." in res.json()["detail"]
    finally:
        db.delete(other_emp)
        db.delete(other_u)
        db.commit()


def test_export_employee_ledger_excel_returns_404_for_nonexistent_employee(client, finance_clerk_user, db):
    _, headers = finance_clerk_user
    res = client.get("/api/payroll/export/employee-ledger-excel?employee_id=nonexistent-999&year=2026&month=8", headers=headers)
    assert res.status_code == 404
    assert "Không tìm thấy hồ sơ nhân sự." in res.json()["detail"]


def test_unprivileged_employee_cannot_export_department_summary(client, unprivileged_user):
    _, headers = unprivileged_user
    res = client.get("/api/payroll/export/department-summary-excel?department_id=dept_general&year=2026&month=8", headers=headers)
    assert res.status_code == 403


def test_export_department_summary_excel(client, finance_clerk_user, db):
    user, headers = finance_clerk_user
    mock_ledger = {
        "status": "success",
        "data": {
            "summary": {
                "approved": 5000000.0,
                "pending": 0.0,
                "total_allowance": 200000.0,
                "total_bonus": 0.0,
                "total_deduction": 0.0,
                "total_net": 5200000.0
            }
        }
    }

    # Tạo phòng ban có chữ Đ để kiểm tra encoding Latin-1
    test_dept = db.query(Department).filter(Department.id == "dept_test_do_ve").first()
    if not test_dept:
        test_dept = Department(id="dept_test_do_ve", name="Phòng Đo vẽ & Khảo sát", code="DO_VE")
        db.add(test_dept)
        db.commit()

    with patch("src.routes.routes_finance_export.get_employee_ledger", return_value=mock_ledger):
        res = client.get("/api/payroll/export/department-summary-excel?department_id=dept_test_do_ve&year=2026&month=8", headers=headers)
        assert res.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("content-type", "")
        content_disposition = res.headers.get("content-disposition", "")
        assert "Bang_Luong_Tong_Hop_Phong_Do_ve" in content_disposition
        assert len(res.content) > 1000

