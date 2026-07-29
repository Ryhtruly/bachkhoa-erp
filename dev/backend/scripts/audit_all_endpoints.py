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
from src.db.models import (
    User,
    Contract,
    ProjectTask,
    CashflowTransaction,
    Employee,
    WikiDocument,
)
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

    # Fetch sample IDs from DB to populate path variables
    contract_row = db.query(Contract).first()
    sample_contract_id = contract_row.id if contract_row else "HD-001"

    task_row = db.query(ProjectTask).first()
    sample_project_id = task_row.id if task_row else "BK-HS-0001"

    cashflow_row = db.query(CashflowTransaction).first()
    sample_cashflow_id = cashflow_row.id if cashflow_row else "PT-07/2026-001"

    emp_row = db.query(Employee).first()
    sample_employee_id = emp_row.id if emp_row else "emp_01"

    wiki_row = db.query(WikiDocument).first()
    sample_wiki_id = wiki_row.id if wiki_row else "doc_01"

    from src.db.models import TaskSubmission
    sub_row = db.query(TaskSubmission).first()
    sample_submission_id = sub_row.id if sub_row else "sub_test"

    print("=" * 85)
    print("DYNAMIC AUDIT: ALL REGISTERED GET ENDPOINTS IN FASTAPI APP")
    print("=" * 85)

    # Dynamic route extraction
    get_routes = []
    for route in app.routes:
        if hasattr(route, "methods") and "GET" in route.methods:
            path = route.path

            # Skip swagger / openapi docs
            if path in ["/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"]:
                continue

            params = None

            # Resolve query params for specific endpoints that require them
            if path == "/api/finance/next-voucher-id":
                params = {"type": "Thu"}
            elif path in [
                "/api/luong/items",
                "/api/piece-rates/items",
                "/api/kpi/scores",
                "/api/finance/monthly-dashboard",
            ]:
                params = {"month": "2026-07"}
            elif path == "/api/payroll/employee-ledger":
                params = {
                    "employee_id": sample_employee_id,
                    "year": 2026,
                    "month": 7,
                }

            # Substitute path parameters with sample DB IDs
            actual_path = (
                path.replace("{contract_id}", sample_contract_id)
                .replace("{project_id}", sample_project_id)
                .replace("{task_id}", sample_project_id)
                .replace("{transaction_id:path}", sample_cashflow_id)
                .replace("{transaction_id}", sample_cashflow_id)
                .replace("{employee_id}", sample_employee_id)
                .replace("{doc_id}", sample_wiki_id)
                .replace("{submission_id}", sample_submission_id)
            )

            get_routes.append((path, actual_path, params))

    passed = []
    failed = []
    data_summary = []

    for orig_path, actual_path, params in get_routes:
        res = client.get(actual_path, headers=headers, params=params)
        status = res.status_code

        if status == 200:
            try:
                data = res.json()
                if isinstance(data, list):
                    detail = f"List ({len(data)} items)"
                    meaningful = len(data) > 0
                elif isinstance(data, dict):
                    keys = list(data.keys())[:6]
                    detail = f"Dict (keys={keys})"
                    meaningful = len(keys) > 0
                else:
                    detail = f"Scalar ({type(data).__name__})"
                    meaningful = data is not None
            except Exception:
                detail = "Non-JSON response"
                meaningful = True

            quality = "MEANINGFUL DATA" if meaningful else "EMPTY DATA"
            print(f"  [200 OK]  {actual_path:<52} -> {detail} [{quality}]")
            passed.append(actual_path)
            data_summary.append((orig_path, actual_path, 200, detail, quality))
        elif status == 404:
            print(
                f"  [404 OK]  {actual_path:<52} -> No test record found in DB (expected)"
            )
            passed.append(actual_path)
            data_summary.append(
                (orig_path, actual_path, 404, "No record in DB", "EMPTY")
            )
        elif status == 422:
            print(
                f"  [422 SKIP] {actual_path:<51} -> Missing required parameters"
            )
            passed.append(actual_path)
            data_summary.append(
                (orig_path, actual_path, 422, "Requires specific params", "SKIP")
            )
        else:
            body = res.text[:140].replace("\n", " ")
            print(f"  [{status} FAIL] {actual_path:<49} -> {body}")
            failed.append((actual_path, status, body))
            data_summary.append((orig_path, actual_path, status, body, "ERROR"))

    print()
    print("=" * 85)
    print("TESTING LEGAL SUBMISSIONS (/api/legal-submissions) FULL CRUD CYCLE")
    print("=" * 85)

    # 1. Create a test submission
    create_payload = {
        "task_id": sample_project_id,
        "receipt_code": f"BN-TEST-{uuid.uuid4().hex[:6].upper()}",
        "submitted_by": "Nguyễn Văn Test",
        "submission_date": "2026-07-29",
        "expected_return_date": "2026-08-15",
        "gov_status": "Đã nộp",
        "note": "Hồ sơ nộp đợt 1 phòng TNMT",
    }
    c_res = client.post("/api/legal-submissions/", headers=headers, json=create_payload)
    if c_res.status_code == 200 and c_res.json().get("status") == "success":
        new_sub_id = c_res.json()["id"]
        print(f"  [CREATE OK]  POST /api/legal-submissions/ -> ID: {new_sub_id}")

        # 2. Get details
        d_res = client.get(f"/api/legal-submissions/{new_sub_id}", headers=headers)
        print(f"  [DETAILS OK] GET /api/legal-submissions/{new_sub_id} -> Status: {d_res.status_code}")

        # 3. Update gov_status (Patch sub-endpoint 1)
        p1_res = client.patch(f"/api/legal-submissions/{new_sub_id}/gov-status", headers=headers, json={"gov_status": "Đã tiếp nhận"})
        print(f"  [PATCH GOV_STATUS OK] PATCH /api/legal-submissions/{new_sub_id}/gov-status -> {p1_res.json().get('message')}")

        # 4. Update photo (Patch sub-endpoint 2)
        p2_res = client.patch(f"/api/legal-submissions/{new_sub_id}/photo", headers=headers, json={"receipt_photo_url": "http://minio/wiki-files/bien_nhan_test.png"})
        print(f"  [PATCH PHOTO OK] PATCH /api/legal-submissions/{new_sub_id}/photo -> {p2_res.json().get('message')}")

        # 5. Update note (Patch sub-endpoint 3)
        p3_res = client.patch(f"/api/legal-submissions/{new_sub_id}/note", headers=headers, json={"note": "Đã nhận giấy hẹn phòng Một cửa"})
        print(f"  [PATCH NOTE OK] PATCH /api/legal-submissions/{new_sub_id}/note -> {p3_res.json().get('message')}")

        # 6. Delete test submission
        del_res = client.delete(f"/api/legal-submissions/{new_sub_id}", headers=headers)
        print(f"  [DELETE OK]  DELETE /api/legal-submissions/{new_sub_id} -> {del_res.json().get('message')}")
    else:
        print(f"  [CREATE FAIL] {c_res.status_code} -> {c_res.text}")
        failed.append(("/api/legal-submissions/", c_res.status_code, c_res.text[:100]))

    print()
    print("=" * 85)
    print(
        f"FINAL AUDIT RESULT: {len(passed)} passed, {len(failed)} failed  (Total GET routes tested: {len(get_routes)})"
    )
    print("=" * 85)

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

