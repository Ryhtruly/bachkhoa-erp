from src.db.models import WorkItem, WorkItemRate, Department


def test_director_creates_work_item_with_initial_rates(client, admin_headers, db):
    response = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={
            "code": "KHOAN_TEST",
            "name": "Hạng mục kiểm thử",
            "default_unit": "hồ sơ",
            "output_definition": "Sản phẩm kiểm thử",
            "initial_rates": [
                {"role_code": "main", "amount": 1_000_000},
                {"role_code": "assistant", "amount": 500_000},
            ],
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["code"] == "KHOAN_TEST"
    assert data["is_active"] is True
    assert {rate["role_code"] for rate in data["rates"]} == {"MAIN", "ASSISTANT"}
    item = db.query(WorkItem).filter(WorkItem.id == data["work_item_id"]).one()
    assert item.name == "Hạng mục kiểm thử"
    assert db.query(WorkItemRate).filter(WorkItemRate.work_item_id == item.id).count() == 2


def test_catalog_mutations_require_director_permission(client, unprivileged_user, admin_headers):
    _, headers = unprivileged_user
    create_response = client.post(
        "/api/piece-rates/items",
        headers=headers,
        json={"code": "NO_PERMISSION", "name": "Không được tạo"},
    )
    assert create_response.status_code == 403

    created = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={"code": "DELETE_PERMISSION", "name": "Hạng mục quyền"},
    )
    assert created.status_code == 201, created.text
    work_item_id = created.json()["data"]["work_item_id"]
    delete_response = client.delete(f"/api/piece-rates/items/{work_item_id}", headers=headers)
    assert delete_response.status_code == 403


def test_metadata_patch_allows_updating_code_and_unit(client, admin_headers):
    created = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={"code": "MUTABLE_CODE", "name": "Tên cũ", "default_unit": "hồ sơ"},
    )
    assert created.status_code == 201, created.text
    work_item_id = created.json()["data"]["work_item_id"]

    response = client.patch(
        f"/api/piece-rates/items/{work_item_id}",
        headers=admin_headers,
        json={"name": "Tên mới", "code": "NEW_CODE_OK", "default_unit": "bộ"},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["name"] == "Tên mới"
    assert data["code"] == "NEW_CODE_OK"
    assert data["default_unit"] == "bộ"
    assert data["unit"] == "bộ"


def test_deactivation_is_soft_and_keeps_rate_history(client, admin_headers, db):
    created = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={
            "code": "SOFT_DELETE",
            "name": "Giữ lịch sử",
            "initial_rates": [{"role_code": "MAIN", "amount": 750_000}],
        },
    )
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    work_item_id = data["work_item_id"]

    response = client.delete(f"/api/piece-rates/items/{work_item_id}", headers=admin_headers)

    assert response.status_code == 200, response.text
    item = db.query(WorkItem).filter(WorkItem.id == work_item_id).one()
    assert item.is_active is False
    assert db.query(WorkItemRate).filter(WorkItemRate.work_item_id == work_item_id).count() == 1

    restored = client.post(f"/api/piece-rates/items/{work_item_id}/restore", headers=admin_headers)
    assert restored.status_code == 200, restored.text
    assert restored.json()["data"]["is_active"] is True


def test_catalog_rejects_invalid_code_blank_name_and_negative_rate(client, admin_headers):
    invalid_code = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={"code": "bad-code", "name": "Hợp lệ"},
    )
    blank_name = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={"code": "BLANK_NAME", "name": "   "},
    )
    negative_rate = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={
            "code": "NEGATIVE_RATE",
            "name": "Hợp lệ",
            "initial_rates": [{"role_code": "MAIN", "amount": -1}],
        },
    )

    assert invalid_code.status_code == 422
    assert blank_name.status_code == 422
    assert negative_rate.status_code == 422


def test_direct_rate_update_creates_new_version_without_overwriting_old(client, admin_headers, db):
    created = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={
            "code": "RATE_VERSION",
            "name": "Giữ phiên bản giá",
            "initial_rates": [{"role_code": "MAIN", "amount": 1_000_000}],
        },
    )
    assert created.status_code == 201, created.text
    work_item_id = created.json()["data"]["work_item_id"]

    updated = client.post(
        "/api/piece-rates/rates/direct",
        headers=admin_headers,
        json={
            "work_item_id": work_item_id,
            "role_code": "MAIN",
            "amount": 1_250_000,
        },
    )

    assert updated.status_code == 200, updated.text
    versions = (
        db.query(WorkItemRate)
        .filter(WorkItemRate.work_item_id == work_item_id, WorkItemRate.role_code == "MAIN")
        .order_by(WorkItemRate.amount)
        .all()
    )
    assert [float(rate.amount) for rate in versions] == [1_000_000, 1_250_000]
    assert any(rate.status == "archived" for rate in versions)
    assert any(rate.status == "published" for rate in versions)


def test_director_creates_and_patches_work_item_with_department(client, admin_headers, db):
    dept = (
        db.query(Department)
        .filter(
            Department.is_active == True,
            Department.code.notin_(["ADMIN", "ACCOUNTING"]),
        )
        .first()
    )
    if not dept:
        dept = Department(code="TEST_DEPT", name="Phòng Thử Nghiệm", is_active=True)
        db.add(dept)
        db.commit()
        db.refresh(dept)

    # 1. Create with department
    response = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={
            "code": "DEPT_TEST_ITEM",
            "name": "Hạng mục gán phòng ban",
            "department_id": dept.id,
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["department_id"] == dept.id
    assert data["department_name"] == dept.name
    work_item_id = data["work_item_id"]

    # 2. Verify list_piece_rates returns department and departments catalog
    list_res = client.get("/api/piece-rates/rates", headers=admin_headers)
    assert list_res.status_code == 200
    list_json = list_res.json()
    assert "departments" in list_json
    assert any(d["id"] == dept.id for d in list_json["departments"])
    matched_item = next(i for i in list_json["data"] if i["work_item_id"] == work_item_id)
    assert matched_item["department_id"] == dept.id
    assert matched_item["department_name"] == dept.name

    # 3. Patch department to None
    patch_res = client.patch(
        f"/api/piece-rates/items/{work_item_id}",
        headers=admin_headers,
        json={"department_id": None},
    )
    assert patch_res.status_code == 200, patch_res.text
    assert patch_res.json()["data"]["department_id"] is None
    assert patch_res.json()["data"]["department_name"] is None

    # 4. Patch back to department
    patch_back = client.patch(
        f"/api/piece-rates/items/{work_item_id}",
        headers=admin_headers,
        json={"department_id": dept.id},
    )
    assert patch_back.status_code == 200
    assert patch_back.json()["data"]["department_id"] == dept.id

    # 5. Invalid department raises 422
    invalid_create = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={
            "code": "INVALID_DEPT_ITEM",
            "name": "Hạng mục phòng ban sai",
            "department_id": "non-existent-dept-id",
        },
    )
    assert invalid_create.status_code == 422

    invalid_patch = client.patch(
        f"/api/piece-rates/items/{work_item_id}",
        headers=admin_headers,
        json={"department_id": "non-existent-dept-id"},
    )
    assert invalid_patch.status_code == 422


def test_list_piece_rate_departments_endpoint(client, admin_headers, db):
    response = client.get("/api/piece-rates/departments", headers=admin_headers)
    assert response.status_code == 200
    departments = response.json()
    assert isinstance(departments, list)
    expected_count = (
        db.query(Department)
        .filter(Department.is_active == True, Department.code.notin_(["ADMIN", "ACCOUNTING"]))
        .count()
    )
    assert len(departments) == expected_count
    assert all(d["code"] not in {"ADMIN", "ACCOUNTING"} for d in departments)


def test_director_can_update_work_item_code_and_unit(client, admin_headers, db):
    # 1. Create two work items
    res1 = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={"code": "CODE_EDIT_1", "name": "Mục 1", "default_unit": "hồ sơ"},
    )
    assert res1.status_code == 201
    wid1 = res1.json()["data"]["work_item_id"]

    res2 = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={"code": "CODE_EDIT_2", "name": "Mục 2", "default_unit": "bộ"},
    )
    assert res2.status_code == 201
    wid2 = res2.json()["data"]["work_item_id"]

    # 2. Update code and unit of item 1 successfully
    patch_res = client.patch(
        f"/api/piece-rates/items/{wid1}",
        headers=admin_headers,
        json={"code": "CODE_EDIT_UPDATED", "default_unit": "lần"},
    )
    assert patch_res.status_code == 200, patch_res.text
    data = patch_res.json()["data"]
    assert data["code"] == "CODE_EDIT_UPDATED"
    assert data["default_unit"] == "lần"
    assert data["unit"] == "lần"

    # DB verified
    item1 = db.get(WorkItem, wid1)
    assert item1.code == "CODE_EDIT_UPDATED"
    assert item1.default_unit == "lần"

    # 3. Duplicate code returns 409
    dup_res = client.patch(
        f"/api/piece-rates/items/{wid1}",
        headers=admin_headers,
        json={"code": "CODE_EDIT_2"},
    )
    assert dup_res.status_code == 409
    assert "đã tồn tại" in dup_res.text

    # 4. Invalid code regex returns 422
    invalid_code = client.patch(
        f"/api/piece-rates/items/{wid1}",
        headers=admin_headers,
        json={"code": "invalid-code"},
    )
    assert invalid_code.status_code == 422

    # 5. Blank unit returns 422
    blank_unit = client.patch(
        f"/api/piece-rates/items/{wid1}",
        headers=admin_headers,
        json={"default_unit": "   "},
    )
    assert blank_unit.status_code == 422

