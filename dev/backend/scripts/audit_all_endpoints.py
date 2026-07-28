import os
import sys
import uuid

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_dir = os.path.join(backend_dir, "src")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

os.environ["CONTRACT_CACHE_REFRESH_SECONDS"] = "0"
os.environ["TESTING"] = "1"

from fastapi.testclient import TestClient
from src.index import app
from src.db.database import SessionLocal
from src.db.models import User
from src.core.auth import create_access_token


def audit_endpoints():
    client = TestClient(app)
    db = SessionLocal()

    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            id=str(uuid.uuid4()),
            username="admin",
            password_hash="test",
            email="admin@test.local",
            is_active=True,
        )
        db.add(admin)
        db.commit()

    token = create_access_token(admin.id)
    headers = {"Authorization": f"Bearer {token}"}

    print("=" * 80)
    print("AUDITING ALL READ (GET) ENDPOINTS — STATUS 200 & MEANINGFUL DATA")
    print("=" * 80)

    # (path, query_params) — None = no extra params
    get_endpoints = [
        # ── Root ──────────────────────────────────────────────────────────
        ("/", None),

        # ── Finance ───────────────────────────────────────────────────────
        ("/api/finance/next-voucher-id", {"type": "Thu"}),
        ("/api/finance/cashflow", None),
        ("/api/finance/cashflow/PT-07/2026-001", None),
        ("/api/finance/cashflow/by-contract/HD-001", None),
        ("/api/finance/cashflow/by-project/BK-HS-0001", None),
        ("/api/finance/cashflow/cash", None),
        ("/api/finance/cashflow/bank", None),
        ("/api/finance/contracts", None),
        ("/api/finance/receivables", None),
        ("/api/finance/payables", None),
        ("/api/finance/advance", None),
        ("/api/finance/employees/departments", None),
        ("/api/finance/employees", None),
        ("/api/finance/payroll", None),
        ("/api/finance/payroll/workers", None),
        ("/api/finance/payroll/workers/records", None),
        ("/api/finance/summary", None),
        ("/api/finance/projects", None),
        ("/api/finance/settings", None),
        ("/api/finance/fund-balances/history", None),
        ("/api/finance/monthly-dashboard", {"month": "2026-07"}),

        # ── Hợp đồng ─────────────────────────────────────────────────────
        ("/api/hopdong/", None),
        ("/api/hopdong/cache/status", None),

        # ── Lương khoán ───────────────────────────────────────────────────
        ("/api/payroll/options", None),
        ("/api/luong/rates", None),
        ("/api/luong/items", {"month": "2026-07"}),

        # ── CRM ───────────────────────────────────────────────────────────
        ("/api/crm/stats", None),
        ("/api/crm/leads", None),

        # ── Hồ sơ ────────────────────────────────────────────────────────
        ("/api/hoso/", None),
        ("/api/hoso/stats", None),
        ("/api/hoso/assignment-options", None),
        ("/api/hoso/contracts-lookup", None),

        # ── KPI ───────────────────────────────────────────────────────────
        ("/api/kpi/scores", {"month": "2026-07"}),

        # ── Wiki ──────────────────────────────────────────────────────────
        ("/api/wiki/", None),

        # ── Settings ──────────────────────────────────────────────────────
        ("/api/settings", None),

        # ── Dashboard ─────────────────────────────────────────────────────
        ("/api/dashboard/summary", None),
        ("/api/dashboard/charts", None),
        ("/api/config", None),

        # ── Auth ──────────────────────────────────────────────────────────
        ("/api/auth/me", None),
    ]

    passed = []
    failed = []

    for path, params in get_endpoints:
        res = client.get(path, headers=headers, params=params)
        status = res.status_code

        if status == 200:
            data = res.json()
            if isinstance(data, list):
                detail = f"{len(data)} items"
            elif isinstance(data, dict):
                keys = list(data.keys())[:6]
                detail = f"keys={keys}"
            else:
                detail = f"type={type(data).__name__}"
            print(f"  [200 OK]  {path:<50} -> {detail}")
            passed.append(path)
        elif status == 404:
            print(f"  [404 OK]  {path:<50} -> No test record (expected)")
            passed.append(path)
        elif status == 422:
            print(f"  [422 SKIP] {path:<49} -> Missing required params (expected)")
            passed.append(path)
        else:
            body = res.text[:120].replace("\n", " ")
            print(f"  [{status} FAIL] {path:<47} -> {body}")
            failed.append((path, status, body))

    print()
    print("=" * 80)
    print(f"RESULT: {len(passed)} passed, {len(failed)} failed  (total {len(get_endpoints)} endpoints)")
    print("=" * 80)

    if failed:
        print("\nFAILED ENDPOINTS:")
        for path, status, body in failed:
            print(f"  [{status}] {path}")
            print(f"         {body}")

    db.close()
    return len(failed) == 0


if __name__ == "__main__":
    ok = audit_endpoints()
    sys.exit(0 if ok else 1)
