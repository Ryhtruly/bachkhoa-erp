from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

from src.core.kpi_engine import calculate_employee_kpi
from src.employee_portal.service import EmployeePortalService
from src.routes import routes_finance
from src.routes.routes_kpi import require_kpi_viewer


class _MappingsResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _KpiDb:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_args, **_kwargs):
        return _MappingsResult(self.rows)


def test_kpi_engine_uses_no_data_for_inactive_employee_and_caps_score_at_100():
    result = calculate_employee_kpi(
        _KpiDb([
            {
                "id": "emp-active",
                "full_name": "Nhân sự hoạt động",
                "total_completed": 20,
                "on_time_count": 20,
                "avg_time": 1,
                "rejections": 0,
            },
            {
                "id": "emp-inactive",
                "full_name": "Nhân sự chưa phát sinh",
                "total_completed": 0,
                "on_time_count": 0,
                "avg_time": 0,
                "rejections": 0,
            },
        ]),
        "2026-09",
    )

    active = next(row for row in result if row["employee"] == "Nhân sự hoạt động")
    inactive = next(row for row in result if row["employee"] == "Nhân sự chưa phát sinh")
    assert active["final_score"] == 100
    assert inactive["final_score"] == 0
    assert inactive["on_time_rate"] is None


def test_kpi_route_rejects_non_director_even_when_user_can_read_payroll():
    db = Mock()
    user = SimpleNamespace(id="accountant-1", username="accountant", is_active=True)

    with patch("src.routes.routes_kpi.is_director", return_value=False):
        with pytest.raises(HTTPException) as exc_info:
            require_kpi_viewer(user=user, db=db)

    assert exc_info.value.status_code == 403


def test_kpi_route_allows_director():
    db = Mock()
    user = SimpleNamespace(id="director-1", username="director", is_active=True)

    with patch("src.routes.routes_kpi.is_director", return_value=True):
        assert require_kpi_viewer(user=user, db=db) is user


class _PayrollDb:
    def __init__(self, period_status):
        self.period_status = period_status
        self.current_month = date.today().replace(day=1)

    def execute(self, statement, _params=None):
        sql = str(statement)
        if "active_work_pay_entitlements" in sql:
            return _MappingsResult([])
        if "employee_pay_adjustments" in sql:
            return _MappingsResult([])
        if "payroll_periods" in sql:
            return _MappingsResult([
                {
                    "period_month": self.current_month,
                    "status": self.period_status,
                    "locked_at": None,
                    "paid_at": None,
                    "snapshot": {
                        "emp-1": {
                            "base_salary": 10000000,
                            "piece_amount": 500000,
                            "tasks_completed": 2,
                            "adjustment_amount": 0,
                        }
                    },
                }
            ])
        if "employee_compensation_terms" in sql:
            return _MappingsResult([])
        raise AssertionError(f"Unexpected payroll query: {sql}")


@pytest.mark.parametrize("period_status", ["Locked", "Paid"])
def test_employee_payroll_preserves_current_period_locked_or_paid_status(period_status):
    current_month = date.today().replace(day=1)
    employee = SimpleNamespace(
        id="emp-1",
        join_date=current_month,
        base_salary=10000000,
        department_id=None,
        department=None,
    )

    history, selected, _latest = EmployeePortalService._calculate_payroll_history(
        _PayrollDb(period_status), employee, target_month_date=current_month
    )

    assert history[0]["status"] == period_status
    assert selected["status"] == period_status
    assert selected["is_current"] is True
    assert selected["is_locked"] is (period_status == "Locked")
    assert selected["is_paid"] is (period_status == "Paid")


@patch("src.routes.routes_finance.invalidate_cache")
@patch("src.routes.routes_finance.FinanceService.lock_payroll_period", return_value={"status": "success"})
def test_lock_payroll_invalidates_employee_portal_payroll_cache(lock_period, invalidate_cache):
    routes_finance.lock_payroll_period("period-1", Mock(), SimpleNamespace(id="director-1"))

    invalidate_cache.assert_any_call("bachkhoa:portal:payroll:*")
    lock_period.assert_called_once()


@patch("src.routes.routes_finance.invalidate_cache")
@patch("src.routes.routes_finance.FinanceService.mark_paid_payroll_period", return_value={"status": "success"})
def test_mark_paid_invalidates_employee_portal_payroll_cache(mark_paid, invalidate_cache):
    routes_finance.mark_paid_payroll_period("period-1", Mock(), SimpleNamespace(id="accountant-1"))

    invalidate_cache.assert_any_call("bachkhoa:portal:payroll:*")
    mark_paid.assert_called_once()
