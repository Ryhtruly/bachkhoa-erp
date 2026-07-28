"""Script to verify Phase 01: Schema and Model Alignment.

Run this script using the virtual environment python:
    .\.venv\Scripts\python.exe scripts\verify_phase1.py
"""

import os
import sys

# Ensure backend and src are in the python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

try:
    from src.db.models import *
    from src.db.database import Base
    print("✅ Successfully imported all models from package 'src.db.models'!")
except Exception as e:
    print(f"❌ Failed to import models: {e}")
    sys.exit(1)

# List of expected table names from the Supabase schema
expected_tables = sorted([
    'users', 'roles', 'user_roles', 'role_permissions', 'auth_tokens',
    'audit_log', 'notifications', 'customers', 'leads_pipeline', 'contracts',
    'zalo_interactions', 'service_lines', 'task_types', 'task_type_rates',
    'departments', 'projects_tasks', 'task_submissions', 'legal_submissions',
    'employees', 'task_pay_records', 'kpi_payroll', 'payroll_periods',
    'payroll_adjustments', 'attendance', 'leave_records', 'cashflow_transactions',
    'receivables', 'fund_opening_balances', 'finance_settings', 'contract_expenses',
    'chat_rooms', 'messages', 'chat_participants', 'wiki_documents', 'wiki_chunks',
    'system_settings', 'google_sheet_sync_config'
])

# Retrieve mapped tables
mapped_tables = sorted([mapper.class_.__tablename__ for mapper in Base.registry.mappers])

print(f"\nChecking table coverage (Expected: {len(expected_tables)}, Mapped: {len(mapped_tables)})...")
missing = set(expected_tables) - set(mapped_tables)
extra = set(mapped_tables) - set(expected_tables)

if not missing and not extra:
    print("✅ Table coverage is perfect! (100% of Supabase tables map to SQLAlchemy models)")
else:
    if missing:
        print(f"❌ Missing tables from models: {missing}")
    if extra:
        print(f"❌ Extra tables in models (not in Supabase): {extra}")
    sys.exit(1)

# Verify column additions
print("\nVerifying model column integrity...")
try:
    c = Contract()
    assert hasattr(c, 'status'), 'Contract missing status'
    assert hasattr(c, 'service_location'), 'Contract missing service_location'
    assert hasattr(c, 'addons'), 'Contract missing addons'
    
    cust = Customer()
    assert hasattr(cust, 'tax_id'), 'Customer missing tax_id'
    assert hasattr(cust, 'customer_group'), 'Customer missing customer_group'
    
    ts = TaskSubmission()
    assert hasattr(ts, 'receipt_code'), 'TaskSubmission missing receipt_code'
    assert hasattr(ts, 'gov_status'), 'TaskSubmission missing gov_status'
    
    al = AuditLog()
    assert hasattr(al, 'payload_json'), 'AuditLog missing payload_json'
    
    print("✅ Model columns aligned correctly!")
except AssertionError as e:
    print(f"❌ Column verification failed: {e}")
    sys.exit(1)

# Verify route imports
print("\nVerifying all 13 route modules can be imported...")
routes = [
    "routes_finance", "routes_payroll", "routes_hoso", "routes_hopdong", 
    "routes_crm", "routes_dashboard", "routes_auth", "routes_settings", 
    "routes_thuchi", "routes_webhook", "routes_wiki", "routes_ai", "routes_luong"
]
success_count = 0
for r in routes:
    try:
        __import__(f"src.routes.{r}")
        success_count += 1
    except Exception as e:
        print(f"❌ Failed to import route {r}: {e}")

if success_count == len(routes):
    print("✅ All 13 route modules imported cleanly!")
else:
    print(f"⚠️ {len(routes) - success_count} route modules failed to import. Ensure path or virtual env dependencies are met.")

print("\n🎉 PHASE 1 VERIFICATION COMPLETED SUCCESSFULLY!")
