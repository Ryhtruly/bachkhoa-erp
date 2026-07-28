"""Script to verify Phase 02A: Finance Route-Service-Repository Split.

Run this script using the virtual environment python:
    .\.venv\Scripts\python.exe scripts\verify_phase2a.py
"""

import os
import sys

# Ensure backend and src are in the python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

print("Running Phase 2A Verification...\n")

# 1. Test importing all components of src.finance
print("1. Verifying imports from 'src.finance'...")
try:
    from src.finance import (
        FinanceRepository,
        FinanceService,
        CashflowIn,
        CashflowUpdateIn,
        CashflowVoidIn,
        AdvanceCreateIn,
        AdvanceClearIn,
        FundCloseIn,
        WageCreateIn,
        EmployeeUpsertIn,
        FinanceSettingsIn,
        serialize_cashflow,
        serialize_cashflow_bulk,
        serialize_employee
    )
    print("✅ Successfully imported all classes/functions from package 'src.finance'!")
except Exception as e:
    print(f"❌ Failed to import from src.finance: {e}")
    sys.exit(1)

# 2. Test importing the refactored routes_finance
print("\n2. Verifying 'src.routes.routes_finance' compilation and imports...")
try:
    import src.routes.routes_finance as rf
    print("✅ Successfully imported 'src.routes.routes_finance'!")
    
    # Check if some route functions are present
    expected_endpoints = [
        "get_next_voucher_id", "list_cashflow", "cashflow_by_contract",
        "cashflow_by_project", "cashflow_cash", "cashflow_bank",
        "create_cashflow", "get_cashflow_detail", "update_cashflow",
        "void_cashflow", "list_contracts", "list_receivables",
        "list_payables", "list_advance", "create_advance", "clear_advance",
        "list_employee_departments", "list_employees", "get_employee",
        "create_employee", "update_employee", "delete_employee",
        "list_payroll", "list_worker_wages", "get_worker_wage_records",
        "create_worker_wage", "get_summary", "list_projects",
        "get_finance_settings", "save_finance_settings", "calculate_system_balance",
        "get_fund_balances_history", "close_fund", "get_monthly_dashboard"
    ]
    
    missing_endpoints = []
    for endpoint in expected_endpoints:
        if not hasattr(rf, endpoint):
            missing_endpoints.append(endpoint)
            
    if not missing_endpoints:
        print("✅ All 34 expected endpoint handlers are defined on the route module!")
    else:
        print(f"❌ Missing expected endpoints in route module: {missing_endpoints}")
        sys.exit(1)
        
except Exception as e:
    print(f"❌ Failed to import or compile route module: {e}")
    sys.exit(1)

print("\n🎉 PHASE 2A FINANCE REFAC VERIFICATION COMPLETED SUCCESSFULLY!")
