import pytest
import uuid
from datetime import date
from src.db.models import Customer, Contract

def test_list_customers_empty(client, admin_headers, db):
    res = client.get("/api/customers", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert isinstance(data["data"], list)

def test_create_and_get_customer(client, admin_headers, db):
    cust_id = str(uuid.uuid4())
    customer = Customer(
        id=cust_id,
        customer_type="individual",
        full_name="Nguyễn Văn Test",
        phone="0987654321",
        id_card_number="079123456789",
        id_card_date=date(2022, 5, 20),
        id_card_place="Cục CSQLHC về TTXH",
        address="123 Đường Test, Quận 1, TP.HCM",
        email="test@example.com"
    )
    db.add(customer)
    db.commit()

    # Get by ID
    res = client.get(f"/api/customers/{cust_id}", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    cust_data = data["data"]
    assert cust_data["full_name"] == "Nguyễn Văn Test"
    assert cust_data["id_card_number"] == "079123456789"
    assert cust_data["id_card_date"] == "2022-05-20"
    assert isinstance(cust_data["contracts"], list)

    # Search
    search_res = client.get("/api/customers/search?q=079123456789", headers=admin_headers)
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert any(c["id"] == cust_id for c in search_data["data"])

    # Update Customer
    update_payload = {
        "customer_type": "individual",
        "full_name": "Nguyễn Văn Test Đã Cập Nhật",
        "phone": "0987654321",
        "id_card_number": "079123456789",
        "id_card_date": "2023-08-15",
        "id_card_place": "Cục Cảnh Sát QLHC",
        "address": "456 Đường Mới, Quận 3, TP.HCM",
        "email": "updated@example.com",
        "zalo_phone": "0987654321"
    }
    put_res = client.put(f"/api/customers/{cust_id}", json=update_payload, headers=admin_headers)
    assert put_res.status_code == 200

    # Verify updated detail
    verify_res = client.get(f"/api/customers/{cust_id}", headers=admin_headers)
    assert verify_res.json()["data"]["full_name"] == "Nguyễn Văn Test Đã Cập Nhật"
    assert verify_res.json()["data"]["id_card_date"] == "2023-08-15"

def test_lookup_tax_code_invalid(client, admin_headers):
    res = client.get("/api/customers/lookup-tax/123", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["data"]["found"] is False

def test_customer_validation_and_business_type(client, admin_headers, db):
    cust_id = str(uuid.uuid4())
    customer = Customer(
        id=cust_id,
        customer_type="business",
        full_name="Công Ty TNHH Bách Khoa",
        tax_id="0312345678",
        representative_name="Lê Văn Sáu",
        representative_role="Giám đốc",
        address="789 Đường Doanh Nghiệp, TP.HCM"
    )
    db.add(customer)
    db.commit()

    # Query with customer_type=business
    res = client.get("/api/customers?customer_type=business", headers=admin_headers)
    assert res.status_code == 200
    biz_list = res.json()["data"]
    assert any(c["id"] == cust_id for c in biz_list)

    # Validation: Individual without CCCD should fail with 422
    invalid_indiv = {
        "customer_type": "individual",
        "full_name": "Khách Thiếu CCCD",
        "id_card_number": ""
    }
    res_err = client.put(f"/api/customers/{cust_id}", json=invalid_indiv, headers=admin_headers)
    assert res_err.status_code == 422

    # Validation: Business without tax_id should fail with 422
    invalid_biz = {
        "customer_type": "business",
        "full_name": "Công Ty Thiếu MST",
        "tax_id": ""
    }
    res_err2 = client.put(f"/api/customers/{cust_id}", json=invalid_biz, headers=admin_headers)
    assert res_err2.status_code == 422
