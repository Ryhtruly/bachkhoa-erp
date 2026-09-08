import sys
import os
import uuid
from datetime import datetime

# Configure sys.path for backend imports
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
from src.db.models import User, Role, UserRole, RolePermission, AuditLog, CashflowTransaction
from src.core.auth import hash_password, create_access_token

def run_phase3_verification():
    print("=" * 60)
    print("RUNNING PHASE 03 SECURITY & RBAC VERIFICATION")
    print("=" * 60)

    client = TestClient(app)
    db = SessionLocal()

    try:
            # -------------------------------------------------------------
            # 1. Unauthenticated Endpoint Access Check (Expects 401)
            # -------------------------------------------------------------
            print("\n1. Testing unauthenticated endpoint access (Expects 401)...")
            protected_urls = [
                ("GET", "/api/finance/cashflow"),
                ("GET", "/api/hopdong/"),
                ("GET", "/api/payroll/options"),
                ("GET", "/api/crm/leads"),
                ("GET", "/api/settings"),
                ("GET", "/api/wiki/"),
                ("GET", "/api/hoso/"),
                ("POST", "/api/finance/cashflow/create"),
            ]

            for method, url in protected_urls:
                if method == "GET":
                    res = client.get(url)
                else:
                    res = client.post(url, json={})
                
                assert res.status_code == 401, f"Expected 401 for {method} {url}, got {res.status_code}: {res.text}"
                print(f"  ✓ {method} {url} returned 401 Unauthorized as expected")

            print("✅ 401 Unauthenticated checks passed!")

            # -------------------------------------------------------------
            # 2. Authenticated but Unauthorized User Check (Expects 403)
            # -------------------------------------------------------------
            print("\n2. Testing authenticated user without permissions (Expects 403)...")
            no_perm_username = f"test_no_perm_{uuid.uuid4().hex[:6]}"
            user_no_perm = User(
                id=str(uuid.uuid4()),
                username=no_perm_username,
                password_hash=hash_password("password123"),
                email=f"{no_perm_username}@test.local",
                is_active=True
            )
            db.add(user_no_perm)
            db.commit()

            token_no_perm = create_access_token(user_no_perm.id)
            headers_no_perm = {"Authorization": f"Bearer {token_no_perm}"}

            for method, url in protected_urls:
                if method == "GET":
                    res = client.get(url, headers=headers_no_perm)
                else:
                    res = client.post(url, json={}, headers=headers_no_perm)
                
                assert res.status_code == 403, f"Expected 403 for {method} {url}, got {res.status_code}: {res.text}"
                print(f"  ✓ {method} {url} returned 403 Forbidden as expected for unprivileged user")

            print("✅ 403 Forbidden checks passed!")

            # -------------------------------------------------------------
            # 3. Superuser Admin Access & RolePermission Evaluation
            # -------------------------------------------------------------
            print("\n3. Testing superuser admin & fine-grained RolePermission...")
            
            # Admin access test
            admin_user = db.query(User).filter(User.username == "admin").first()
            if not admin_user:
                admin_user = User(
                    id=str(uuid.uuid4()),
                    username="admin",
                    password_hash=hash_password("admin123"),
                    email="admin@test.local",
                    is_active=True
                )
                db.add(admin_user)
                db.commit()

            admin_token = create_access_token(admin_user.id)
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            res_admin = client.get("/api/finance/cashflow", headers=admin_headers)
            assert res_admin.status_code == 200, f"Admin failed GET /api/finance/cashflow: {res_admin.text}"
            print("  ✓ Admin superuser accessed /api/finance/cashflow (200 OK)")

            # Fine-grained RBAC role test: User with ONLY finance read/create permission
            custom_user_name = f"fin_clerk_{uuid.uuid4().hex[:6]}"
            fin_user = User(
                id=str(uuid.uuid4()),
                username=custom_user_name,
                password_hash=hash_password("password123"),
                email=f"{custom_user_name}@test.local",
                is_active=True
            )
            db.add(fin_user)
            db.flush()

            from sqlalchemy import func
            max_role_id = db.query(func.max(Role.id)).scalar() or 0
            role_fin = Role(id=max_role_id + 1, role_name=f"finance_clerk_{uuid.uuid4().hex[:6]}")
            db.add(role_fin)
            db.flush()

            db.add(UserRole(user_id=fin_user.id, role_id=role_fin.id))
            db.add(RolePermission(
                role_id=role_fin.id,
                resource="finance",
                can_read=True,
                can_create=True,
                can_update=False,
                can_delete=False,
                can_approve=False
            ))
            db.commit()

            fin_token = create_access_token(fin_user.id)
            fin_headers = {"Authorization": f"Bearer {fin_token}"}

            # Should ALLOW finance read
            res_fin_read = client.get("/api/finance/cashflow", headers=fin_headers)
            assert res_fin_read.status_code == 200, f"Finance clerk failed read: {res_fin_read.text}"
            print("  ✓ Finance clerk accessed /api/finance/cashflow (200 OK)")

            # Should DENY CRM read (no CRM permission)
            res_crm_read = client.get("/api/crm/leads", headers=fin_headers)
            assert res_crm_read.status_code == 403, f"Expected 403 for CRM read, got: {res_crm_read.status_code}"
            print("  ✓ Finance clerk blocked from /api/crm/leads (403 Forbidden)")

            print("✅ Fine-grained RBAC evaluation passed!")

            # -------------------------------------------------------------
            # 4. Audit Log Actor Propagation Verification
            # -------------------------------------------------------------
            print("\n4. Verifying AuditLog actor_id propagation on write paths...")

            create_payload = {
                "type": "Thu",
                "amount": 1500000.0,
                "category": "Thu tiền dịch vụ",
                "payer_payee": "Khách hàng Test Audit",
                "payment_method": "Chuyển khoản",
                "transaction_date": datetime.now().strftime("%Y-%m-%d"),
                "description": "Test audit log propagation",
                "scope": "Công ty"
            }

            res_create = client.post("/api/finance/cashflow/create", json=create_payload, headers=fin_headers)
            assert res_create.status_code == 200, f"Failed creating cashflow transaction: {res_create.text}"
            voucher_id = res_create.json()["id"]
            print(f"  ✓ Created test voucher '{voucher_id}' using finance clerk token")

            # Query AuditLog to verify actor_id equals fin_user.id
            audit_entry = db.query(AuditLog).filter(
                AuditLog.action == "CREATE",
                AuditLog.object_type == "CashflowTransaction"
            ).order_by(AuditLog.id.desc()).first()

            assert audit_entry is not None, "No AuditLog record found for CashflowTransaction creation!"
            assert audit_entry.actor_id == fin_user.id, f"AuditLog actor_id mismatch! Expected {fin_user.id}, got {audit_entry.actor_id}"
            print(f"  ✓ AuditLog correctly recorded actor_id = '{audit_entry.actor_id}'")

            # Clean up test transaction & test user relations
            tc_item = db.query(CashflowTransaction).filter(CashflowTransaction.id == voucher_id).first()
            if tc_item:
                db.delete(tc_item)
            if audit_entry:
                db.delete(audit_entry)
            
            db.query(RolePermission).filter(RolePermission.role_id == role_fin.id).delete()
            db.query(UserRole).filter(UserRole.user_id == fin_user.id).delete()
            db.delete(role_fin)
            db.delete(fin_user)
            db.delete(user_no_perm)
            db.commit()

            print("✅ AuditLog actor_id verification passed!")

    finally:
        db.close()
        from src.db.database import engine
        engine.dispose()

    print("\n" + "=" * 60, flush=True)
    print("🎉 PHASE 03 VERIFICATION COMPLETED SUCCESSFULLY!", flush=True)
    print("=" * 60, flush=True)

if __name__ == "__main__":
    run_phase3_verification()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
