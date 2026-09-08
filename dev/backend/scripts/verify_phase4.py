import os
import sys

# Configure sys.path for backend imports
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_dir = os.path.join(backend_dir, "src")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

os.environ["CONTRACT_CACHE_REFRESH_SECONDS"] = "0"
os.environ["TESTING"] = "1"

from sqlalchemy import text
from src.db.database import SessionLocal, Base, engine
import src.db.models
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext

def run_phase4_verification():
    print("=" * 60, flush=True)
    print("RUNNING PHASE 04 DATABASE MIGRATION & INTEGRITY VERIFICATION", flush=True)
    print("=" * 60, flush=True)

    db = SessionLocal()

    try:
        # -------------------------------------------------------------
        # 1. 39/39 Model & Supabase Schema Alignment Verification
        # -------------------------------------------------------------
        print("\n1. Verifying 39/39 table alignment between Supabase DB & SQLAlchemy models...", flush=True)
        db_tables = [r[0] for r in db.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).fetchall() if r[0] != "alembic_version"]
        db_tables = sorted(db_tables)

        mapped_tables = sorted([mapper.class_.__tablename__ for mapper in Base.registry.mappers])

        missing_models = set(db_tables) - set(mapped_tables)
        extra_models = set(mapped_tables) - set(db_tables)

        assert len(db_tables) == 39, f"Expected 39 DB tables in Supabase, found {len(db_tables)}: {db_tables}"
        assert len(mapped_tables) == 39, f"Expected 39 mapped SQLAlchemy models, found {len(mapped_tables)}: {mapped_tables}"
        assert len(missing_models) == 0, f"Unmapped DB tables found: {missing_models}"
        assert len(extra_models) == 0, f"Extra models without DB tables found: {extra_models}"

        print(f"  ✓ Supabase physical tables: {len(db_tables)}/39")
        print(f"  ✓ Mapped SQLAlchemy models: {len(mapped_tables)}/39")
        print("✅ 39/39 Schema & Model alignment verification passed!")

        # -------------------------------------------------------------
        # 2. Alembic Migration State Verification
        # -------------------------------------------------------------
        print("\n2. Verifying Alembic migration framework & database revision...", flush=True)
        alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
        
        script = ScriptDirectory.from_config(alembic_cfg)
        head_revision = script.get_current_head()

        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current_revision = context.get_current_revision()

        assert head_revision is not None, "Alembic head revision is missing!"
        assert current_revision == head_revision, f"Alembic database revision mismatch! DB current: {current_revision}, Head: {head_revision}"

        print(f"  ✓ Alembic script head: {head_revision}")
        print(f"  ✓ Database stamped current: {current_revision}")
        print("✅ Alembic migration framework verification passed!")

        # -------------------------------------------------------------
        # 3. Startup DDL Side-Effect Cleanliness Check
        # -------------------------------------------------------------
        print("\n3. Verifying startup DDL side-effect cleanliness...", flush=True)
        with open(os.path.join(src_dir, "index.py"), "r", encoding="utf-8") as f:
            index_content = f.read()
        assert "Base.metadata.create_all" not in index_content or "# Base.metadata.create_all" in index_content, "Found active Base.metadata.create_all in index.py!"

        with open(os.path.join(src_dir, "db", "database.py"), "r", encoding="utf-8") as f:
            db_content = f.read()
        assert "CREATE EXTENSION IF NOT EXISTS vector" not in db_content, "Found active CREATE EXTENSION in database.py import path!"

        print("  ✓ `Base.metadata.create_all` removed from startup flow")
        print("  ✓ `CREATE EXTENSION` removed from database.py import path")
        print("✅ Startup side-effect cleanliness check passed!")

        # -------------------------------------------------------------
        # 4. Regression Verification (Phase 1, 2A, 2B imports; Phase 3 RBAC)
        # -------------------------------------------------------------
        print("\n4. Running regression checks...", flush=True)

        # Phase 1: Model imports & route imports
        from src.db.models import (
            User, Role, UserRole, RolePermission, AuthToken, AuditLog, Notification,
            Customer, LeadPipeline, Contract, ZaloInteraction, ServiceLine,
            TaskType, TaskTypeRate, ProjectTask, TaskSubmission, TaskPayRecord,
            ServicePackage,
            CashflowTransaction, Receivable, FundOpeningBalance, FinanceSetting, ContractExpense,
            Department, Employee, KpiPayroll, PayrollPeriod, PayrollAdjustment, Attendance, LeaveRecord,
            ChatRoom, Message, ChatParticipant,
            WikiDocument, WikiChunk,
            SystemSetting,
            GoogleSheetSyncConfig,
        )
        print("  ✓ Legacy model classes imported successfully")

        route_modules = [
            "routes_finance", "routes_payroll", "routes_hoso", "routes_hopdong",
            "routes_crm", "routes_dashboard", "routes_auth", "routes_settings",
            "routes_thuchi", "routes_webhook", "routes_wiki", "routes_ai", "routes_luong",
            "routes_kpi",
        ]
        for rm in route_modules:
            __import__(f"src.routes.{rm}")
        print(f"  ✓ Phase 1: All {len(route_modules)} route modules imported cleanly")

        # Phase 2A: Finance package
        from src.finance import FinanceRepository, FinanceService, CashflowIn
        import src.routes.routes_finance as rf
        assert hasattr(rf, "create_cashflow"), "routes_finance missing create_cashflow"
        print("  ✓ Phase 2A: Finance package & routes verified")

        # Phase 2B: Contracts package
        from src.contracts import ContractRepository, ContractService, HopdongCreateSchema
        import src.routes.routes_hopdong as rh
        assert hasattr(rh, "create_hopdong"), "routes_hopdong missing create_hopdong"
        print("  ✓ Phase 2B: Contracts package & routes verified")

        # Phase 3: RBAC dependencies exist
        from src.core.auth import require_permission, require_any_permission, require_authenticated_user, check_user_permission
        print("  ✓ Phase 3: RBAC auth dependencies imported successfully")

        print("✅ All regression checks passed!")

    finally:
        db.close()
        engine.dispose()

    print("\n" + "=" * 60, flush=True)
    print("🎉 PHASE 04 VERIFICATION COMPLETED SUCCESSFULLY!", flush=True)
    print("=" * 60, flush=True)

if __name__ == "__main__":
    run_phase4_verification()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
