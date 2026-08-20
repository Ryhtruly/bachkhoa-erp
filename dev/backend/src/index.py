import asyncio
import contextlib
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Add app directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.routes.routes_contracts import router as contracts_router
from src.routes.routes_dashboard import router as dashboard_router
from src.routes.routes_catalog import router as catalog_router
from src.routes.routes_customers import router as customers_router
from src.routes.routes_webhook import router as webhook_router
from src.routes.routes_quotations import router as quotations_router
from src.routes.routes_ai import router as ai_router
from src.routes.routes_crm import router as crm_router
from src.routes.routes_kpi import router as kpi_router
from src.routes.routes_wiki import router as wiki_router
from src.routes.routes_finance import router as finance_router
from src.routes.routes_cashflow import router as cashflow_router
from src.routes.routes_settings import router as settings_router
from src.routes.routes_auth import router as auth_router
from src.routes.routes_employee_portal import router as employee_portal_router
from src.routes.routes_user_admin import router as user_admin_router
from src.routes.routes_notifications import router as notifications_router
from src.routes.routes_legal_submissions import router as legal_submissions_router
from src.routes.routes_legal_dossiers import router as legal_dossiers_router
from src.routes.routes_handover import router as handover_router
from src.routes.routes_survey_records import router as survey_records_router
from src.routes.routes_payroll import router as payroll_router
from src.routes.routes_piece_rates import router as piece_rates_router

from src.db.database import engine, Base, SessionLocal
from src.services.storage_service import ensure_bucket, ensure_contract_template_bucket, ensure_finance_bucket, set_bucket_public
from src.db.models import *
from src.contracts.read_model import (
    CONTRACT_CACHE_REFRESH_SECONDS,
    warm_contract_read_model,
)

from src.config.settings import settings
from src.core.logging_config import setup_logging
from src.core.middleware import RequestIdMiddleware

logger = logging.getLogger(__name__)

# Seed default admin user on first run if enabled
if settings.seed_admin_enabled:
    try:
        db = SessionLocal()
        from src.core.auth import seed_default_admin
        seed_default_admin(db)
        db.close()
    except Exception as e:
        logger.warning(f"Seed admin user failed (may already exist): {e}")

# Local MinIO can create buckets automatically. Managed production storage is
# configured to skip creation and public policy changes.
if not os.getenv("TESTING"):
    try:
        ensure_bucket()
        ensure_finance_bucket()
        ensure_contract_template_bucket()
        set_bucket_public()
        logger.info("Object-storage buckets ready")
    except Exception as e:
        logger.warning(f"MinIO bucket setup failed: {e}")


async def refresh_contract_cache_loop():
    while True:
        await asyncio.sleep(CONTRACT_CACHE_REFRESH_SECONDS)
        try:
            await asyncio.to_thread(warm_contract_read_model)
        except Exception as exc:
            logger.warning("Periodic contract cache refresh failed: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not os.getenv("TESTING"):
        try:
            await asyncio.to_thread(warm_contract_read_model)
        except Exception as exc:
            logger.warning("Initial contract cache warmup failed: %s", exc)

    refresh_task = None
    if CONTRACT_CACHE_REFRESH_SECONDS > 0:
        refresh_task = asyncio.create_task(refresh_contract_cache_loop())

    yield

    if refresh_task:
        refresh_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await refresh_task


setup_logging()

openapi_tags = [
    {
        "name": "01. Authentication & Security",
        "description": "User Login, JWT Token Authentication, and Current User Profile Management"
    },
    {
        "name": "02. Dashboard & Analytics",
        "description": "Executive Overview, Revenue/Debt Charts, and System Configurations"
    },
    {
        "name": "03. Contracts & Workflows",
        "description": "Land Surveying Contracts, Workflow Runtime Engine, and Task Assignments"
    },
    {
        "name": "04. Tasks & Workflow Nodes",
        "description": "Task Case Management, Workflow Node Execution, and Staff Assignments"
    },
    {
        "name": "05. Legal Submissions",
        "description": "Government Legal Dossier Submissions and Government Processing Status"
    },
    {
        "name": "06. Finance & Cashflow",
        "description": "Cashflow Voucher Ledger, Receivables/Payables, Advances, and Fund Balances"
    },
    {
        "name": "07. Payroll & Piece Rates",
        "description": "Piece-rate Salary Calculation, Task Rates Table, and Payroll Period Closing"
    },
    {
        "name": "08. CRM & Quotations",
        "description": "Customer Lead Pipeline Management, Service Cost Estimation, and Quotation Generation"
    },
    {
        "name": "09. Knowledge Base & Wiki",
        "description": "Enterprise Knowledge Base, RAG Document Indexing, and File Management"
    },
    {
        "name": "10. AI Assistant",
        "description": "AI Planning Document Vision Analyzer (VN2000) and RAG Intelligence Chatbot"
    },
    {
        "name": "11. System & Webhooks",
        "description": "System Settings, External Webhooks (Zalo/Hanet), and Cron Automations"
    }
]

app = FastAPI(
    title="Bach Khoa ERP - RESTful API Specification",
    description="Standardized OpenAPI Specification for Bach Khoa Enterprise Resource Planning (ERP) System.",
    version="2.0.0",
    openapi_tags=openapi_tags,
    lifespan=lifespan
)

os.makedirs(os.path.join(os.path.dirname(__file__), "..", "static", "contracts"), exist_ok=True)
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "static")), name="static")

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers - Pure 100% Standardized English REST APIs
app.include_router(auth_router)
app.include_router(user_admin_router)
app.include_router(employee_portal_router)
app.include_router(dashboard_router)
app.include_router(catalog_router)
app.include_router(customers_router)
app.include_router(contracts_router, prefix="/api/contracts")
app.include_router(finance_router)
app.include_router(cashflow_router)
app.include_router(crm_router)
app.include_router(quotations_router, prefix="/api/quotations")
app.include_router(wiki_router)
app.include_router(ai_router)
app.include_router(webhook_router)
app.include_router(settings_router)
app.include_router(kpi_router)
app.include_router(notifications_router)
app.include_router(legal_submissions_router)
app.include_router(legal_dossiers_router)
app.include_router(handover_router)
app.include_router(survey_records_router)
app.include_router(payroll_router)
app.include_router(piece_rates_router)

@app.get("/")
def read_root():
    return {"message": "OpenClaw ERP API is running"}
