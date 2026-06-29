import os
import sys
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

app = FastAPI(title="OpenClaw ERP - Bach Khoa")

os.makedirs(os.path.join(os.path.dirname(__file__), "..", "static", "contracts"), exist_ok=True)
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "static")), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(dashboard_router)
app.include_router(hoso_router)
app.include_router(hopdong_router)
app.include_router(webhook_router)
app.include_router(baogia_router)
app.include_router(ai_router)
app.include_router(crm_router)
app.include_router(kpi_router)
app.include_router(wiki_router)
app.include_router(finance_router)

@app.get("/")
def read_root():
    return {"message": "OpenClaw ERP API is running"}
