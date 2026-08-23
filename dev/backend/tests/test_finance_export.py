import pytest
from unittest.mock import patch
from src.db.models import Employee, Department


def test_export_monthly_dashboard_excel(client, finance_clerk_user):
    user, headers = finance_clerk_user
    res = client.get("/api/finance/export/monthly-dashboard-excel?month=2026-08", headers=headers)
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("content-type", "")
    assert len(res.content) > 1000


def test_export_employee_ledger_excel(client, finance_clerk_user, db):
    user, headers = finance_clerk_user
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

