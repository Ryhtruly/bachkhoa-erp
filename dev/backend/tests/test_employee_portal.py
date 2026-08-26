import uuid
from datetime import date, datetime, timezone

from src.core.auth import create_access_token, hash_password
from src.db.models import (
    Attendance,
    Employee,
    KpiPayroll,
    LeaveRecord,
    ProjectTask,
    User,
)
def test_employee_portal_returns_live_profile_and_enforces_access(client, db, admin_headers):
    suffix = uuid.uuid4().hex[:8]
    owner = User(
        id=str(uuid.uuid4()),
        username=f"portal_owner_{suffix}",
        password_hash=hash_password("password123"),
        email=f"portal_owner_{suffix}@test.local",
        is_active=True,
    )
    other_user = User(
        id=str(uuid.uuid4()),
        username=f"portal_other_{suffix}",
        password_hash=hash_password("password123"),
        email=f"portal_other_{suffix}@test.local",
        is_active=True,
    )
    owner_employee = Employee(
        id=str(uuid.uuid4()),
        user_id=owner.id,
        full_name="Portal Owner",
        department="Survey",
        job_title="Surveyor",
        base_salary=12000000,
        is_active=True,
        join_date=date(2026, 1, 15),
    )
    other_employee = Employee(
        id=str(uuid.uuid4()),
        user_id=other_user.id,
        full_name="Portal Other",
        is_active=True,
    )
    task_ids = [f"portal-main-{suffix}", f"portal-support-{suffix}"]
    db.add_all([owner, other_user])
    db.commit()
    db.add_all([owner_employee, other_employee])
    db.commit()

    try:
        db.add_all([
        ProjectTask(
            id=task_ids[0],
            task_name="Assigned task",
            assignee_id=owner.id,
            deadline=date(2026, 8, 20),
            status="Đang thực hiện",
        ),
        ProjectTask(
            id=task_ids[1],
            task_name="Support task",
            support_id=owner.id,
            deadline=date(2026, 8, 21),
            status="Mới",
        ),
        LeaveRecord(
            id=str(uuid.uuid4()),
            employee_id=owner_employee.id,
            leave_type="Nghỉ phép",
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 2),
            status="Đã duyệt",
        ),
        Attendance(
            id=str(uuid.uuid4()),
            employee_id=owner_employee.id,
            date=date(2026, 8, 7),
            check_in=datetime(2026, 8, 7, 8, 0, tzinfo=timezone.utc),
            status="Có mặt",
        ),
        KpiPayroll(
            id=str(uuid.uuid4()),
            employee_id=owner_employee.id,
            month=date(2026, 7, 1),
            total_salary=13500000,
            kpi_score=95,
        ),
        ])
        db.commit()

        owner_headers = {"Authorization": f"Bearer {create_access_token(owner.id)}"}

        assert client.get("/api/employee-portal/me").status_code == 401

        own_profile = client.get("/api/employee-portal/me", headers=owner_headers)
        assert own_profile.status_code == 200
        payload = own_profile.json()
        assert payload["employee"] == {
            "id": owner_employee.id,
            "full_name": "Portal Owner",
            "department": "Survey",
            "job_title": "Surveyor",
            "email": owner.email,
            "join_date": "2026-01-15",
            "base_salary": 12000000.0,
            "is_active": True,
        }
        assert {task["id"] for task in payload["tasks"]} == set(task_ids)
        assert payload["leave_records"][0]["status"] == "Đã duyệt"
        assert payload["attendance"][0]["check_in"].startswith("2026-08-07T08:00:00")
        assert payload["latest_payroll"]["total_salary"] == 13500000.0

        assert client.get(
            f"/api/employee-portal/employees/{other_employee.id}",
            headers=owner_headers,
        ).status_code == 403
        assert client.get(
            f"/api/employee-portal/employees/{other_employee.id}",
            headers=admin_headers,
        ).status_code == 200
    finally:
        db.query(KpiPayroll).filter(KpiPayroll.employee_id == owner_employee.id).delete(
            synchronize_session=False,
        )
        db.query(Attendance).filter(Attendance.employee_id == owner_employee.id).delete(
            synchronize_session=False,
        )
        db.query(LeaveRecord).filter(LeaveRecord.employee_id == owner_employee.id).delete(
            synchronize_session=False,
        )
        db.query(ProjectTask).filter(ProjectTask.id.in_(task_ids)).delete(
            synchronize_session=False,
        )
        db.query(Employee).filter(Employee.id.in_([owner_employee.id, other_employee.id])).delete(
            synchronize_session=False,
        )
        db.query(User).filter(User.id.in_([owner.id, other_user.id])).delete(
            synchronize_session=False,
        )
        db.commit()
