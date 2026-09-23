import uuid
from src.db.models import Department, Employee


def test_list_departments_manage_returns_active_status_and_employee_count(client, admin_headers, db):
    # Setup test department and employee
    dept = Department(
        id=f"dept_{uuid.uuid4().hex[:8]}",
        name=f"Phòng Thử Nghiệm {uuid.uuid4().hex[:4]}",
        code=f"TN_{uuid.uuid4().hex[:4]}".upper(),
        is_active=True,
        display_order=50,
    )
    db.add(dept)
    db.commit()

    emp = Employee(
        id=str(uuid.uuid4()),
        full_name="Nhân viên Test",
        department_id=dept.id,
        department=dept.name,
        is_active=True,
    )
    db.add(emp)
    db.commit()

    response = client.get("/api/finance/departments/manage", headers=admin_headers)
    assert response.status_code == 200, response.text
    items = response.json()
    assert isinstance(items, list)
    target = next((d for d in items if d["id"] == dept.id), None)
    assert target is not None
    assert target["name"] == dept.name
    assert target["code"] == dept.code
    assert target["is_active"] is True
    assert target["display_order"] == 50
    assert target["employee_count"] >= 1


def test_non_director_cannot_patch_department(client, unprivileged_user, db):
    _, user_headers = unprivileged_user
    dept = Department(
        id=f"dept_{uuid.uuid4().hex[:8]}",
        name=f"Phòng Bảo Mật {uuid.uuid4().hex[:4]}",
        code=f"BM_{uuid.uuid4().hex[:4]}".upper(),
        is_active=True,
    )
    db.add(dept)
    db.commit()

    res = client.patch(
        f"/api/finance/departments/manage/{dept.id}",
        headers=user_headers,
        json={"name": "Tên Phòng Không Hợp Lệ"},
    )
    assert res.status_code == 403


def test_director_can_update_department_name_and_status(client, admin_headers, db):
    dept = Department(
        id=f"dept_{uuid.uuid4().hex[:8]}",
        name=f"Phòng Ban Đầu {uuid.uuid4().hex[:4]}",
        code=f"BD_{uuid.uuid4().hex[:4]}".upper(),
        is_active=True,
    )
    db.add(dept)
    db.commit()

    # Add employee to verify Employee.department sync
    emp = Employee(
        id=str(uuid.uuid4()),
        full_name="Nhân viên Đồng Bộ",
        department_id=dept.id,
        department=dept.name,
        is_active=True,
    )
    db.add(emp)
    db.commit()

    new_name = f"Phòng Đã Đổi Tên {uuid.uuid4().hex[:4]}"
    # 1. Update name
    res = client.patch(
        f"/api/finance/departments/manage/{dept.id}",
        headers=admin_headers,
        json={"name": new_name},
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["name"] == new_name
    assert data["is_active"] is True

    # Verify DB
    db.refresh(dept)
    assert dept.name == new_name
    db.refresh(emp)
    assert emp.department == new_name

    # 2. Toggle active/disable
    res_toggle = client.patch(
        f"/api/finance/departments/manage/{dept.id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert res_toggle.status_code == 200
    assert res_toggle.json()["data"]["is_active"] is False

    db.refresh(dept)
    assert dept.is_active is False

    # 3. Duplicate name returns 409
    dept2 = Department(
        id=f"dept_{uuid.uuid4().hex[:8]}",
        name=f"Phòng Trùng Lặp {uuid.uuid4().hex[:4]}",
        code=f"TL_{uuid.uuid4().hex[:4]}".upper(),
        is_active=True,
    )
    db.add(dept2)
    db.commit()

    res_dup = client.patch(
        f"/api/finance/departments/manage/{dept2.id}",
        headers=admin_headers,
        json={"name": new_name},
    )
    assert res_dup.status_code == 409
    assert "đã tồn tại" in res_dup.text

    # 4. Blank name returns 422
    res_blank = client.patch(
        f"/api/finance/departments/manage/{dept.id}",
        headers=admin_headers,
        json={"name": "   "},
    )
    assert res_blank.status_code == 422

    # 5. Update code successfully
    new_code = f"NEW_{uuid.uuid4().hex[:4]}".upper()
    res_code = client.patch(
        f"/api/finance/departments/manage/{dept.id}",
        headers=admin_headers,
        json={"code": new_code.lower()},  # validator converts to uppercase
    )
    assert res_code.status_code == 200
    assert res_code.json()["data"]["code"] == new_code
    db.refresh(dept)
    assert dept.code == new_code

    # 6. Duplicate code returns 409
    res_dup_code = client.patch(
        f"/api/finance/departments/manage/{dept2.id}",
        headers=admin_headers,
        json={"code": new_code},
    )
    assert res_dup_code.status_code == 409
    assert "Mã phòng ban đã tồn tại" in res_dup_code.text

    # 7. Invalid code regex returns 422
    res_invalid_code = client.patch(
        f"/api/finance/departments/manage/{dept.id}",
        headers=admin_headers,
        json={"code": "INVALID-CODE!"},
    )
    assert res_invalid_code.status_code == 422

