"""Unit tests for Customer Loyalty / Priority Discounts functionality."""

import pytest
import uuid
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.db.models._base import Base
from src.db.models.crm import Customer, Contract, CustomerLoyaltyTier
from src.routes.routes_customers import check_loyalty_eligibility, _tier_to_dict


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database session for unit testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed default tiers
    silver = CustomerLoyaltyTier(
        id="tier_silver",
        tier_name="Khách hàng Thân Thiết",
        min_contracts=2,
        discount_percent=Decimal("5.00"),
        description="Áp dụng từ 2 HĐ",
        is_active=True,
    )
    gold = CustomerLoyaltyTier(
        id="tier_gold",
        tier_name="Khách hàng VIP Vàng",
        min_contracts=5,
        discount_percent=Decimal("10.00"),
        description="Áp dụng từ 5 HĐ",
        is_active=True,
    )
    session.add_all([silver, gold])
    session.commit()

    yield session
    session.close()


def test_customer_with_no_contracts_not_eligible(db_session):
    """Customer with 0 contracts is not eligible for loyalty discount."""
    customer = Customer(id=str(uuid.uuid4()), full_name="Khách Mới", phone="0901234567")
    db_session.add(customer)
    db_session.commit()

    result = check_loyalty_eligibility(db_session, customer.id, original_value=10_000_000)
    assert result["eligible"] is False
    assert result["contract_count"] == 0


def test_customer_with_2_contracts_gets_silver(db_session):
    """Customer with 2 completed contracts qualifies for Silver tier (5% discount)."""
    customer = Customer(id=str(uuid.uuid4()), full_name="Khách Thân Thiết", phone="0901234568")
    db_session.add(customer)
    db_session.flush()

    # Add 2 non-cancelled contracts
    c1 = Contract(id="HD01", customer_id=customer.id, status="Đang thực hiện", total_value=5_000_000)
    c2 = Contract(id="HD02", customer_id=customer.id, status="Hoàn tất", total_value=8_000_000)
    db_session.add_all([c1, c2])
    db_session.commit()

    result = check_loyalty_eligibility(db_session, customer.id, original_value=20_000_000)
    assert result["eligible"] is True
    assert result["contract_count"] == 2
    assert result["tier"]["tier_name"] == "Khách hàng Thân Thiết"
    assert result["discount_percent"] == 5.0
    assert result["discount_amount"] == 1_000_000
    assert result["final_value"] == 19_000_000


def test_customer_with_5_contracts_gets_gold(db_session):
    """Customer with 5 contracts qualifies for Gold tier (10% discount)."""
    customer = Customer(id=str(uuid.uuid4()), full_name="Khách VIP", phone="0901234569")
    db_session.add(customer)
    db_session.flush()

    for i in range(1, 6):
        db_session.add(Contract(
            id=f"HD_GOLD_{i}", customer_id=customer.id, status="Hoàn tất", total_value=10_000_000
        ))
    db_session.commit()

    result = check_loyalty_eligibility(db_session, customer.id, original_value=50_000_000)
    assert result["eligible"] is True
    assert result["contract_count"] == 5
    assert result["tier"]["tier_name"] == "Khách hàng VIP Vàng"
    assert result["discount_percent"] == 10.0
    assert result["discount_amount"] == 5_000_000
    assert result["final_value"] == 45_000_000


def test_cancelled_contracts_not_counted(db_session):
    """Cancelled contracts should not count towards loyalty eligibility."""
    customer = Customer(id=str(uuid.uuid4()), full_name="Khách Huỷ", phone="0901234570")
    db_session.add(customer)
    db_session.flush()

    c1 = Contract(id="HD_VALID", customer_id=customer.id, status="Hoàn tất", total_value=5_000_000)
    c2 = Contract(id="HD_CANCELLED_1", customer_id=customer.id, status="Đã huỷ", total_value=5_000_000)
    c3 = Contract(id="HD_CANCELLED_2", customer_id=customer.id, status="cancelled", total_value=5_000_000)
    db_session.add_all([c1, c2, c3])
    db_session.commit()

    result = check_loyalty_eligibility(db_session, customer.id, original_value=10_000_000)
    assert result["eligible"] is False
    assert result["contract_count"] == 1  # Only 1 valid contract


def test_inactive_tier_not_applied(db_session):
    """Inactive tiers should not be applied to customers."""
    customer = Customer(id=str(uuid.uuid4()), full_name="Khách Inactive", phone="0901234571")
    db_session.add(customer)
    db_session.flush()

    # Disable both tiers
    for t in db_session.query(CustomerLoyaltyTier).all():
        t.is_active = False
    for i in range(1, 10):
        db_session.add(Contract(id=f"HD_INACTIVE_{i}", customer_id=customer.id, status="Hoàn tất"))
    db_session.commit()

    result = check_loyalty_eligibility(db_session, customer.id, original_value=10_000_000)
    assert result["eligible"] is False


def test_contract_model_loyalty_columns(db_session):
    """Verify Contract model correctly stores discount info."""
    customer = Customer(id=str(uuid.uuid4()), full_name="Khách Lưu", phone="0901234572")
    db_session.add(customer)
    db_session.flush()

    contract = Contract(
        id="HD_LOYALTY_TEST",
        customer_id=customer.id,
        total_value=19_000_000,
        original_value=20_000_000,
        loyalty_discount_percent=5.0,
        loyalty_discount_amount=1_000_000,
        addons={"loyalty_discount": {"tier_name": "Khách Thân Thiết"}},
    )
    db_session.add(contract)
    db_session.commit()

    saved = db_session.query(Contract).filter(Contract.id == "HD_LOYALTY_TEST").first()
    assert float(saved.total_value) == 19_000_000
    assert float(saved.original_value) == 20_000_000
    assert float(saved.loyalty_discount_percent) == 5.0
    assert float(saved.loyalty_discount_amount) == 1_000_000
    assert saved.addons["loyalty_discount"]["tier_name"] == "Khách Thân Thiết"


def test_api_loyalty_endpoints(client, admin_headers):
    """Test loyalty REST endpoints via FastAPI TestClient."""
    # 1. GET /api/customers/loyalty-tiers
    res = client.get("/api/customers/loyalty-tiers", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert isinstance(data["data"], list)

    # 2. GET /api/customers/loyalty-qualifying-customers
    res = client.get("/api/customers/loyalty-qualifying-customers", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert isinstance(data["data"], list)


def test_contract_schema_and_service_loyalty_fields():
    """Verify ContractCreateSchema and ContractGenerateSchema accept loyalty fields."""
    from src.contracts.schemas import ContractCreateSchema, ContractGenerateSchema

    create_data = ContractCreateSchema(
        contract_template_id="tpl_01",
        task_id="task_01",
        customer_name="Nguyễn Văn A",
        service_type="Đo đạc địa chính",
        contract_value=19_000_000,
        sales_source="Facebook",
        loyalty_discount_percent=5.0,
        loyalty_discount_amount=1_000_000,
        original_value=20_000_000,
    )
    assert create_data.loyalty_discount_percent == 5.0
    assert create_data.loyalty_discount_amount == 1_000_000
    assert create_data.original_value == 20_000_000

    gen_data = ContractGenerateSchema(
        contract_template_id="tpl_01",
        customer_name="Công ty TNHH B",
        phone="0912345678",
        service_type="Pháp lý nhà đất",
        address="123 Lê Lợi, Q1, TP.HCM",
        contract_value=45_000_000,
        date_signed="2026-09-23",
        due_date="2026-09-30",
        sales_source="Zalo",
        loyalty_discount_percent=10.0,
        loyalty_discount_amount=5_000_000,
        original_value=50_000_000,
    )
    assert gen_data.loyalty_discount_percent == 10.0
    assert gen_data.loyalty_discount_amount == 5_000_000
    assert gen_data.original_value == 50_000_000
    assert gen_data.loyalty_tier_id is None
    assert gen_data.loyalty_tier_name is None


def test_duplicate_min_contracts_rejected(client, admin_headers, db_session):
    """Admin creating a tier with duplicate min_contracts must return HTTP 409."""
    # Tạo tier 1: min_contracts = 20
    res1 = client.post(
        "/api/customers/loyalty-tiers",
        json={"tier_name": "Tier Diamond", "min_contracts": 20, "discount_percent": 15.0},
        headers=admin_headers,
    )
    assert res1.status_code == 200

    # Tạo tier 2 cùng min_contracts = 20
    res2 = client.post(
        "/api/customers/loyalty-tiers",
        json={"tier_name": "Tier Platinum", "min_contracts": 20, "discount_percent": 20.0},
        headers=admin_headers,
    )
    assert res2.status_code == 409
    assert "Đã có bậc ưu đãi" in res2.json()["detail"]


def test_contract_service_auto_discounts_gross_value(db_session):
    """When frontend sends undiscounted gross value, ContractService auto-subtracts discount."""
    from src.contracts.schemas import ContractCreateSchema
    from src.contracts.services import ContractService
    from src.db.models import Contract, ContractTemplate, Customer

    tpl = db_session.query(ContractTemplate).filter(ContractTemplate.status == "published").first()
    if not tpl:
        tpl = ContractTemplate(
            id="tpl_published_test",
            code="TPL_TEST",
            version=1,
            name="Mẫu test",
            status="published",
            template_storage_key="contracts/templates/test.docx",
        )
        db_session.add(tpl)
        db_session.commit()
    elif not tpl.template_storage_key:
        tpl.template_storage_key = "contracts/templates/test.docx"
        db_session.commit()

    from sqlalchemy import text
    try:
        db_session.execute(text("ALTER TABLE service_lines ADD COLUMN document_register_version INTEGER DEFAULT 2"))
        db_session.commit()
    except Exception:
        db_session.rollback()

    cust = Customer(id="cust_auto_disc_test", full_name="Khách Hàng Auto Disc")
    db_session.add(cust)
    db_session.commit()

    # Payload gửi contract_value = 10,000,000 (giá gốc), original_value = 10,000,000, discount_pct = 10%
    payload = ContractCreateSchema(
        contract_id="HD_AUTO_DISC_01",
        contract_template_id=tpl.id,
        task_id="task_auto_disc",
        customer_name="Khách Hàng Auto Disc",
        customer_id=cust.id,
        service_type="Đo đạc địa chính",
        contract_value=10_000_000,
        original_value=10_000_000,
        loyalty_discount_percent=10.0,
        loyalty_discount_amount=1_000_000,
        loyalty_tier_id="tier_gold",
        loyalty_tier_name="Khách VIP Vàng",
        sales_source="Trực tiếp",
    )

    from unittest.mock import patch, MagicMock
    from types import SimpleNamespace

    with patch("src.contracts.services._create_initial_service_line") as mock_sl, \
         patch("src.contracts.services.telegram_service.notify_new_contract"), \
         patch("src.dossiers.register.open_contract_register"):
        mock_sl.return_value = SimpleNamespace(id="sl_01")
        res = ContractService.create_contract(db_session, payload)
        assert res["status"] == "success"

    saved = db_session.query(Contract).filter(Contract.id == "HD_AUTO_DISC_01").first()
    assert saved is not None
    # total_value phải được tự động khấu trừ xuống 9,000,000
    assert float(saved.total_value) == 9_000_000
    assert float(saved.original_value) == 10_000_000
    assert float(saved.loyalty_discount_amount) == 1_000_000
    assert float(saved.loyalty_discount_percent) == 10.0
    assert saved.loyalty_tier_id == "tier_gold"
    assert saved.loyalty_tier_name == "Khách VIP Vàng"



