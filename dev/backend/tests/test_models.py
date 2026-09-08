import pytest
from sqlalchemy import text
from src.db.database import Base
from src.db.models import (
    User, Role, UserRole, RolePermission, AuthToken, AuditLog, Notification,
    Customer, LeadPipeline, Contract, ZaloInteraction, ServiceLine,
    TaskType, ServicePackage,
    CashflowTransaction, Receivable, FundOpeningBalance, FinanceSetting, ContractExpense,
    Department, Employee, PayrollPeriod, Attendance, LeaveRecord,
    ChatRoom, Message, ChatParticipant,
    WikiDocument, WikiChunk,
    SystemSetting,
    GoogleSheetSyncConfig,
)


def test_table_model_alignment(db):
    """Mapped legacy models must exist; the new workflow schema is mapped separately."""
    if db.bind.dialect.name != "postgresql":
        pytest.skip("Schema alignment requires PostgreSQL information_schema")

    db_tables = [
        r[0] for r in db.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
        ).fetchall()
        if r[0] != "alembic_version"
    ]
    db_tables = sorted(db_tables)
    mapped_tables = sorted([mapper.class_.__tablename__ for mapper in Base.registry.mappers])

    assert set(mapped_tables).issubset(set(db_tables)), (
        f"Mapped tables missing from DB: {set(mapped_tables) - set(db_tables)}"
    )
    removed_tables = {
        "task_transitions",
        "task_nodes_legacy_empty",
        "node_pay_rates_legacy_empty",
    }
    assert removed_tables.isdisjoint(db_tables)
    assert removed_tables.isdisjoint(mapped_tables)


def test_foreign_key_relationships():
    """Verify model foreign key definitions exist on key relations."""
    service_line_fk_targets = [fk.target_fullname for fk in ServiceLine.__table__.foreign_keys]
    assert "contracts.id" in service_line_fk_targets, "ServiceLine missing FK to contracts.id"

    lead_fk_targets = [fk.target_fullname for fk in LeadPipeline.__table__.foreign_keys]
    assert "customers.id" in lead_fk_targets, "LeadPipeline missing FK to customers.id"

    contract_fk_targets = [fk.target_fullname for fk in Contract.__table__.foreign_keys]
    assert "customers.id" in contract_fk_targets, "Contract missing FK to customers.id"

    cashflow_fk_targets = [fk.target_fullname for fk in CashflowTransaction.__table__.foreign_keys]
    assert "contracts.id" in cashflow_fk_targets, "CashflowTransaction missing FK to contracts.id"


def test_column_constraints_and_attributes():
    """Verify critical column attributes and constraints."""
    user = User()
    assert hasattr(user, "username")
    assert hasattr(user, "password_hash")
    assert hasattr(user, "is_active")

    contract = Contract()
    assert hasattr(contract, "status")
    assert hasattr(contract, "service_location")
    assert hasattr(contract, "addons")

    audit = AuditLog()
    assert hasattr(audit, "actor_id")
    assert hasattr(audit, "payload_json")

    service_line = ServiceLine()
    assert hasattr(service_line, "contract_id")
    assert hasattr(service_line, "service_type")
    assert hasattr(service_line, "priority")

    sp = ServicePackage()
    assert hasattr(sp, "name")
    assert hasattr(sp, "is_active")

    tx = CashflowTransaction()
    assert hasattr(tx, "transaction_type")
    assert hasattr(tx, "amount")
    assert hasattr(tx, "payment_method")


def test_no_circular_imports():
    """Verify importing package 'src.db.models' causes no circular import issues."""
    import src.db.models as models_pkg
    assert hasattr(models_pkg, "User")
    assert hasattr(models_pkg, "ServicePackage")
    assert hasattr(models_pkg, "CashflowTransaction")
    assert not hasattr(models_pkg, "LegalSubmission")
    assert not hasattr(models_pkg, "TaskTransition")
