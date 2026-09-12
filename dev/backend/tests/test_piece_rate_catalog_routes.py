from src.db.models import WorkItem, WorkItemRate


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


def test_metadata_patch_keeps_code_immutable(client, admin_headers):
    created = client.post(
        "/api/piece-rates/items",
        headers=admin_headers,
        json={"code": "IMMUTABLE_CODE", "name": "Tên cũ"},
    )
    assert created.status_code == 201, created.text
    work_item_id = created.json()["data"]["work_item_id"]

    response = client.patch(
        f"/api/piece-rates/items/{work_item_id}",
        headers=admin_headers,
        json={"name": "Tên mới"},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["name"] == "Tên mới"
    assert data["code"] == "IMMUTABLE_CODE"

    tampered = client.patch(
        f"/api/piece-rates/items/{work_item_id}",
        headers=admin_headers,
        json={"code": "SHOULD_NOT_CHANGE"},
    )
    assert tampered.status_code == 422

    unit_tampered = client.patch(
        f"/api/piece-rates/items/{work_item_id}",
        headers=admin_headers,
        json={"default_unit": "hồ sơ"},
    )
    assert unit_tampered.status_code == 422


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
