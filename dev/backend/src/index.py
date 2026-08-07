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

from src.routes.routes_hoso import router as hoso_router
from src.routes.routes_hopdong import router as hopdong_router
from src.routes.routes_dashboard import router as dashboard_router
from src.routes.routes_webhook import router as webhook_router
from src.routes.routes_baogia import router as baogia_router
from src.routes.routes_ai import router as ai_router
from src.routes.routes_crm import router as crm_router
from src.routes.routes_kpi import router as kpi_router
from src.routes.routes_wiki import router as wiki_router
from src.routes.routes_finance import router as finance_router
from src.routes.routes_payroll import router as payroll_router
from src.routes.routes_luong import router as luong_router
from src.routes.routes_hoso_phaply import router as hoso_phaply_router
from src.routes.routes_settings import router as settings_router
from src.routes.routes_auth import router as auth_router
from src.db.database import engine, Base, SessionLocal
from src.services.storage_service import ensure_bucket, set_bucket_public
from src.db.models import *
from src.contracts.read_model import (
    CONTRACT_CACHE_REFRESH_SECONDS,
    warm_contract_read_model,
)

from src.config.settings import settings

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

# Ensure MinIO bucket exists and is public
if not os.getenv("TESTING"):
    try:
        ensure_bucket()
        set_bucket_public()
        logger.info("MinIO bucket ready (public)")
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


from src.core.logging_config import setup_logging
from src.core.middleware import RequestIdMiddleware

setup_logging()

app = FastAPI(title="OpenClaw ERP - Bach Khoa", lifespan=lifespan)

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

# Include routers - Standardized English REST prefixes with legacy aliases
app.include_router(dashboard_router)
app.include_router(hoso_router, prefix="/api/tasks")  # Primary English
app.include_router(hoso_router, prefix="/api/hoso", include_in_schema=False)  # Legacy alias
app.include_router(hopdong_router, prefix="/api/contracts")  # Primary English
app.include_router(hopdong_router, prefix="/api/hopdong", include_in_schema=False)  # Legacy alias
app.include_router(webhook_router)
app.include_router(baogia_router, prefix="/api/quotations")  # Primary English
app.include_router(baogia_router, prefix="/api/baogia", include_in_schema=False)  # Legacy alias
app.include_router(ai_router)
app.include_router(crm_router)
app.include_router(kpi_router)
app.include_router(wiki_router)
app.include_router(finance_router)
app.include_router(payroll_router)
app.include_router(luong_router, prefix="/api/piece-rates")  # Primary English
app.include_router(luong_router, prefix="/api/luong", include_in_schema=False)  # Legacy alias
app.include_router(hoso_phaply_router, prefix="/api/legal-submissions")  # Primary English
app.include_router(hoso_phaply_router, prefix="/api/hoso-phaply", include_in_schema=False)  # Alias
app.include_router(settings_router)
app.include_router(auth_router)

@app.get("/")
def read_root():
    return {"message": "OpenClaw ERP API is running"}
