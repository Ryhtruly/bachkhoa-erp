import pytest
from sqlalchemy import text
from src.db.database import Base
from src.db.models import (
    User, Role, UserRole, RolePermission, AuthToken, AuditLog, Notification,
    Customer, LeadPipeline, Contract, ZaloInteraction, ServiceLine,
    TaskType, TaskTypeRate, ProjectTask, TaskSubmission, TaskPayRecord, LegalSubmission,
    ServicePackage, TaskTransition,
    CashflowTransaction, Receivable, FundOpeningBalance, FinanceSetting, ContractExpense,
    Department, Employee, KpiPayroll, PayrollPeriod, PayrollAdjustment, Attendance, LeaveRecord,
    ChatRoom, Message, ChatParticipant,
    WikiDocument, WikiChunk,
    SystemSetting,
    GoogleSheetSyncConfig,
)


def test_table_model_alignment(db):
    """Verify physical DB tables in Supabase match mapped SQLAlchemy models 100% (39/39)."""
    db_tables = [
        r[0] for r in db.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
        ).fetchall()
        if r[0] != "alembic_version"
    ]
    db_tables = sorted(db_tables)
    mapped_tables = sorted([mapper.class_.__tablename__ for mapper in Base.registry.mappers])

    assert len(db_tables) == 39, f"Expected 39 DB tables in Supabase, got {len(db_tables)}"
    assert len(mapped_tables) == 39, f"Expected 39 mapped SQLAlchemy models, got {len(mapped_tables)}"
    assert set(db_tables) == set(mapped_tables), f"Mismatch: missing={set(db_tables)-set(mapped_tables)}, extra={set(mapped_tables)-set(db_tables)}"


def test_foreign_key_relationships():
    """Verify model foreign key definitions exist on key relations."""
    task_fk_targets = [fk.target_fullname for fk in ProjectTask.__table__.foreign_keys]
    assert "contracts.id" in task_fk_targets, "ProjectTask missing FK to contracts.id"
    assert "users.id" in task_fk_targets, "ProjectTask missing FK to users.id"

    lead_fk_targets = [fk.target_fullname for fk in LeadPipeline.__table__.foreign_keys]
    assert "customers.id" in lead_fk_targets, "LeadPipeline missing FK to customers.id"

    contract_fk_targets = [fk.target_fullname for fk in Contract.__table__.foreign_keys]
    assert "customers.id" in contract_fk_targets, "Contract missing FK to customers.id"

    transition_fk_targets = [fk.target_fullname for fk in TaskTransition.__table__.foreign_keys]
    assert "projects_tasks.id" in transition_fk_targets, "TaskTransition missing FK to projects_tasks.id"


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

    task = ProjectTask()
    assert hasattr(task, "service_line_id")
    assert hasattr(task, "current_package")
    assert hasattr(task, "is_overdue_flag")

    sp = ServicePackage()
    assert hasattr(sp, "name")
    assert hasattr(sp, "is_active")


def test_no_circular_imports():
    """Verify importing package 'src.db.models' causes no circular import issues."""
    import src.db.models as models_pkg
    assert hasattr(models_pkg, "User")
    assert hasattr(models_pkg, "ServicePackage")
    assert hasattr(models_pkg, "TaskTransition")
