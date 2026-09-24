from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest

from src.routes.routes_payroll import get_payroll_options


def test_get_payroll_options_excludes_director_and_executive_department(monkeypatch):
    """Xác nhận get_payroll_options không trả về Ban Giám đốc và nhân sự có chức danh Giám đốc."""
    # Mock redis get/set
    monkeypatch.setattr("src.routes.routes_payroll.get_cached_json", lambda key: None)
    monkeypatch.setattr("src.routes.routes_payroll.set_cached_json", lambda key, val, ttl_seconds=300: None)
    monkeypatch.setattr("src.routes.routes_payroll.is_payroll_all_user", lambda db, user: True)

    dept_admin = SimpleNamespace(id="dept_admin", name="Ban Giám đốc", code="ADMIN")
    dept_survey = SimpleNamespace(id="dept_survey", name="Phòng Đo Đạc", code="SURVEY")
    dept_legal = SimpleNamespace(id="dept_legal", name="Phòng Pháp Lý", code="LEGAL")

    emp_director = SimpleNamespace(
        id="emp_director",
        full_name="Nguyễn Văn Giám Đốc",
        job_title="Giám đốc điều hành",
        department_id="dept_admin",
        department="Ban Giám đốc",
        is_active=True,
    )
    emp_surveyor = SimpleNamespace(
        id="emp_surveyor",
        full_name="Trần Kỹ Thuật",
        job_title="Kỹ thuật viên đo đạc",
        department_id="dept_survey",
        department="Phòng Đo Đạc",
        is_active=True,
    )
    emp_legal = SimpleNamespace(
        id="emp_legal",
        full_name="Lê Pháp Lý",
        job_title="Chuyên viên pháp lý",
        department_id="dept_legal",
        department="Phòng Pháp Lý",
        is_active=True,
    )

    mock_db = MagicMock()

    def query_side_effect(model):
        q = MagicMock()
        model_name = getattr(model, "__name__", str(model))
        if "Department" in model_name:
            q.all.return_value = [dept_admin, dept_survey, dept_legal]
            return q
        if "Employee" in model_name:
            filtered = MagicMock()
            ordered = MagicMock()
            ordered.all.return_value = [emp_director, emp_legal, emp_surveyor]
            filtered.order_by.return_value = ordered
            q.filter.return_value = filtered
            return q
        return q

    mock_db.query.side_effect = query_side_effect

    mock_user = SimpleNamespace(id="user_admin", username="admin")
    result = get_payroll_options(db=mock_db, user=mock_user)

    data = result.get("data", {})
    departments = data.get("departments", [])

    # 1. Ban Giám đốc không được có mặt trong danh sách phòng ban tính lương khoán
    dept_names = [d["name"] for d in departments]
    dept_codes = [d["code"] for d in departments]
    assert "Ban Giám đốc" not in dept_names
    assert "ADMIN" not in dept_codes
    assert "Phòng Đo Đạc" in dept_names
    assert "Phòng Pháp Lý" in dept_names

    # 2. Không có bất kỳ nhân sự nào thuộc Ban Giám đốc hoặc có chức danh Giám đốc
    all_emp_names = []
    all_emp_titles = []
    for d in departments:
        for emp in d.get("employees", []):
            all_emp_names.append(emp["full_name"])
            all_emp_titles.append(emp["job_title"])

    assert "Nguyễn Văn Giám Đốc" not in all_emp_names
    assert not any("giám đốc" in t.lower() for t in all_emp_titles)
    assert "Trần Kỹ Thuật" in all_emp_names
    assert "Lê Pháp Lý" in all_emp_names


def test_kpi_engine_query_filters_out_director():
    """Xác nhận kpi_engine thực thi câu SQL có lọc trừ Ban Giám đốc và chức danh Giám đốc."""
    from src.core import kpi_engine

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    kpi_engine.calculate_employee_kpi(mock_db, "2026-03")

    assert mock_db.execute.called
    executed_sql = str(mock_db.execute.call_args[0][0])
    # Kiểm tra các điều kiện loại trừ giám đốc trong SQL
    assert "not like '%giám đốc%'" in executed_sql
    assert "not like '%giam doc%'" in executed_sql
    assert "not in ('ADMIN', 'BGD', 'DIRECTOR')" in executed_sql


def test_list_payroll_formatted_query_filters_out_director():
    """Xác nhận list_payroll_formatted thực thi câu SQL có lọc trừ Ban Giám đốc và chức danh Giám đốc."""
    from src.finance.repository import FinanceRepository

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    FinanceRepository.list_payroll_formatted(mock_db, "2026-03")

    assert mock_db.execute.called
    executed_sql = str(mock_db.execute.call_args[0][0])
    # Kiểm tra các điều kiện loại trừ giám đốc trong SQL
    assert "not like '%giám đốc%'" in executed_sql
    assert "not like '%giam doc%'" in executed_sql
    assert "not in ('ADMIN', 'BGD', 'DIRECTOR')" in executed_sql

