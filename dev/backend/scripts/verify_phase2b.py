"""Script to verify Phase 02B: Contracts Route-Service-Repository Split.

Run this script using the virtual environment python:
    .\.venv\Scripts\python.exe scripts\verify_phase2b.py
"""

import os
import sys

# Ensure backend and src are in the python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

print("Running Phase 2B Verification...\n")

# 1. Test importing all components of src.contracts
print("1. Verifying imports from 'src.contracts'...")
try:
    from src.contracts import (
        ContractRepository,
        ContractService,
        HopdongCreateSchema,
        ContractGenerateSchema,
        get_contract_cache_status,
        get_contract_hierarchy,
        get_contract_read_model,
        query_contract_read_model,
        sync_contract_read_model_after_write,
        warm_contract_read_model
    )
    print("✅ Successfully imported all classes/functions from package 'src.contracts'!")
except Exception as e:
    print(f"❌ Failed to import from src.contracts: {e}")
    sys.exit(1)

# 2. Test importing the refactored routes_hopdong
print("\n2. Verifying 'src.routes.routes_hopdong' compilation and imports...")
try:
    import src.routes.routes_hopdong as rh
    print("✅ Successfully imported 'src.routes.routes_hopdong'!")
    
    # Check expected endpoint handlers
    expected_endpoints = [
        "contract_cache_status", "list_hopdong", "create_hopdong", "generate_and_save_contract"
    ]
    for endpoint in expected_endpoints:
        if not hasattr(rh, endpoint):
            print(f"❌ Missing endpoint '{endpoint}' in routes_hopdong!")
            sys.exit(1)
    print("✅ All expected endpoints are defined on the routes_hopdong module!")
except Exception as e:
    print(f"❌ Failed to import routes_hopdong: {e}")
    sys.exit(1)

# 3. Test importing the modified routes_crm to ensure import resolution is correct
print("\n3. Verifying 'src.routes.routes_crm' compilation...")
try:
    import src.routes.routes_crm as rc
    print("✅ Successfully imported 'src.routes.routes_crm'!")
except Exception as e:
    print(f"❌ Failed to import routes_crm: {e}")
    sys.exit(1)

print("\n🎉 PHASE 2B CONTRACTS REFAC VERIFICATION COMPLETED SUCCESSFULLY!")
