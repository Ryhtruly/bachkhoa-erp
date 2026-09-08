from src.employee_portal.service import _CURRENT_PAYROLL_QUERY


def test_employee_payroll_falls_back_to_current_employee_base_salary():
    """A missing published compensation term must not display a stored salary as 0."""
    query = _CURRENT_PAYROLL_QUERY.text

    assert "employee_base as (" in query
    assert "coalesce((select base_salary from base), (select base_salary from employee_base), 0)" in query
