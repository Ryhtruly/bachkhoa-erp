import asyncio
from datetime import date
from types import SimpleNamespace

import pytest

from src.db.models import Employee
from src.finance.schemas import EmployeeUpsertIn
from src.finance.services import FinanceService
from src.routes.routes_finance import upload_employee_avatar


class EmployeeSession:
    """Minimal disposable session double for employee service behavior."""

    def __init__(self, employee):
        self.employee = employee
        self.commits = 0
        self.refreshed = []

    def query(self, model):
        assert model is Employee
        return self

    def filter(self, *_conditions):
        return self

    def first(self):
        return self.employee

    def commit(self):
        self.commits += 1

    def refresh(self, employee):
        self.refreshed.append(employee)


def linked_employee():
    return SimpleNamespace(
        id="emp-linked",
        user_id="user-original",
        full_name="Nguyễn Văn A",
        department_id=None,
        department=None,
        job_title="Kỹ sư",
        contract_status="Official",
        join_date=date(2025, 1, 15),
        probation_end_date=None,
        base_salary=12_000_000,
        is_active=True,
        email="a@example.test",
        phone="0900000000",
        gender="male",
        date_of_birth=None,
        place_of_birth="Hà Nội",
        updated_at=None,
    )


def test_salary_only_update_preserves_existing_user_link(monkeypatch):
    """Removing the update allowlist would clear user_id from an omitted field."""
    employee = linked_employee()
    db = EmployeeSession(employee)
    monkeypatch.setattr(
        "src.finance.services.serialize_employee",
        lambda serialized, _department: {"id": serialized.id, "base_salary": serialized.base_salary},
    )

    payload = EmployeeUpsertIn(full_name=employee.full_name, base_salary=15_000_000)

    result = FinanceService.update_employee(db, employee.id, payload)

    assert result == {"id": "emp-linked", "base_salary": 15_000_000}
    assert employee.user_id == "user-original"
    assert employee.base_salary == 15_000_000


def test_update_ignores_a_supplied_null_user_link(monkeypatch):
    """A malicious or stale ordinary update cannot unlink an employee account."""
    employee = linked_employee()
    db = EmployeeSession(employee)
    monkeypatch.setattr(
        "src.finance.services.serialize_employee",
        lambda serialized, _department: {"id": serialized.id, "job_title": serialized.job_title},
    )

    payload = EmployeeUpsertIn(
        full_name=employee.full_name,
        job_title="Kỹ sư trưởng",
        user_id=None,
    )

    result = FinanceService.update_employee(db, employee.id, payload)

    assert result == {"id": "emp-linked", "job_title": "Kỹ sư trưởng"}
    assert employee.user_id == "user-original"
    assert employee.job_title == "Kỹ sư trưởng"


def test_avatar_upload_compensates_storage_when_employee_update_fails(monkeypatch):
    class UploadedFile:
        content_type = "image/png"
        filename = "avatar.png"

        async def read(self):
            return b"image-data"

    deleted = []
    monkeypatch.setattr("src.routes.routes_finance.ensure_bucket", lambda: None)
    monkeypatch.setattr("src.routes.routes_finance.upload_file", lambda *_args: "http://minio.test/wiki-files/avatars/new.png")
    monkeypatch.setattr("src.routes.routes_finance.delete_file", deleted.append)
    monkeypatch.setattr(
        "src.routes.routes_finance.FinanceService.set_employee_avatar",
        lambda *_args: (_ for _ in ()).throw(RuntimeError("database write failed")),
    )

    with pytest.raises(RuntimeError, match="database write failed"):
        asyncio.run(upload_employee_avatar("emp-1", UploadedFile(), db=object(), user=object()))

    assert len(deleted) == 1
    assert deleted[0].startswith("avatars/emp-1_")
