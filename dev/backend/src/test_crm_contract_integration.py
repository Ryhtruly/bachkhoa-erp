"""
Test CRM Lead Closing to Automatic Contract Creation Pipeline.
Tests field population, contract code generation (xxx/BK-2026), ServiceLine linking,
Receivables creation, docx generation, and Contract Workspace querying.
"""

import sys
import os
import uuid
import datetime
from decimal import Decimal

# Ensure src is in python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.db.database import SessionLocal
from src.db.models import LeadPipeline, Customer, ServiceLine, Contract, AuditLog
from src.db.models.crm import ContractTemplate, CustomerIntakeSubmission, ContractGeneratedDocument
from src.db.models.finance import Receivable
from src.db.models.operations import TaskType, ServicePackage
from src.db.models.auth import User
from src.contracts.services import ContractService
from src.routes.routes_crm import update_lead_status, LeadStatusUpdate

def run_tests():
    db = SessionLocal()
    print("=" * 60)
    print("RUNNING CRM TO CONTRACT AUTOMATION PIPELINE TESTS")
    print("=" * 60)

    try:
        # 1. Setup mock test user
        user = db.query(User).filter(User.username == "admin").first()
        if not user:
            user = db.query(User).first()
        assert user is not None, "A user must exist in DB for audit log"

        # 2. Setup mock customer & intake submission & lead
        test_phone = f"0988{datetime.datetime.now().strftime('%M%S')}"
        customer = Customer(
            id=str(uuid.uuid4()),
            full_name="Khach Hang Test Hop Dong",
            phone=test_phone,
            address="Thua 99, To 88, Cu Chi, TP.HCM"
        )
        db.add(customer)
        db.flush()

        lead = LeadPipeline(
            id=f"LEAD-TEST-{uuid.uuid4().hex[:6].upper()}",
            customer_id=customer.id,
            source="Web Form (Zalo)",
            requirements="Dịch vụ: Đo hiện trạng | Quy mô: 250 m2 | Vị trí BĐS: Thua 99, To 88, Cu Chi",
            status="Báo giá"
        )
        db.add(lead)
        db.flush()

        intake_sub = CustomerIntakeSubmission(
            id=str(uuid.uuid4()),
            source_channel="zalo_oa",
            status="new",
            linked_customer_id=customer.id,
            linked_lead_id=lead.id,
            raw_payload={"full_name": customer.full_name, "phone": customer.phone}
        )
        db.add(intake_sub)
        db.commit()

        print(f"[1] Created test customer ({customer.full_name}), lead ({lead.id}), and intake submission ({intake_sub.id})")

        # 3. Trigger Deal Closing via update_lead_status
        payload = LeadStatusUpdate(
            new_status="Chốt",
            price="18000000",
            tax_id="0312345678",
            area="250 m2"
        )
        res = update_lead_status(lead_id=lead.id, body=payload, db=db, user=user)

        print("[2] update_lead_status response:", res)
        assert res["status"] == "success"
        contract_id = res["data"]["contract_id"]
        assert contract_id is not None, "Contract ID must be returned"
        assert "/BK-2026" in contract_id, f"Contract ID '{contract_id}' should contain /BK-2026"
        print(f"[PASS] Generated valid contract code: {contract_id}")

        # 4. Verify Contract record in database
        contract = db.query(Contract).filter(Contract.id == contract_id).first()
        assert contract is not None, "Contract record must exist in DB"
        assert contract.customer_id == customer.id, "Customer ID mismatch"
        assert contract.lead_id == lead.id, "Lead ID mismatch"
        assert contract.total_value == Decimal("18000000.00"), f"Total value mismatch: {contract.total_value}"
        assert contract.service_area == Decimal("250.00"), f"Service area mismatch: {contract.service_area}"
        assert contract.service_location == customer.address, f"Location mismatch: {contract.service_location}"
        assert contract.service_type == "Đo hiện trạng", f"Service type mismatch: {contract.service_type}"
        assert contract.file_link is not None, "file_link must not be None"
        print(f"[PASS] Contract fields verified: total_value={contract.total_value}, area={contract.service_area}, file_link={contract.file_link}")

        # 5. Verify Customer tax_id updated
        updated_cust = db.query(Customer).filter(Customer.id == customer.id).first()
        assert updated_cust.tax_id == "0312345678", f"Customer tax_id not updated: {updated_cust.tax_id}"
        print(f"[PASS] Customer tax_id updated: {updated_cust.tax_id}")

        # 6. Verify ServiceLine record & package mapping
        service_line = db.query(ServiceLine).filter(ServiceLine.contract_id == contract_id).first()
        assert service_line is not None, "ServiceLine must exist"
        assert service_line.task_type_id == "tt_001", f"Task type mismatch: {service_line.task_type_id}"
        assert service_line.service_package_id == "sp_001", f"Package ID mismatch: {service_line.service_package_id}"
        assert service_line.service_package == "Đo Vẽ", f"Package name mismatch: {service_line.service_package}"
        assert service_line.service_type == "Đo hiện trạng", f"Service line type mismatch: {service_line.service_type}"
        assert service_line.price == Decimal("18000000.00"), f"Service line price mismatch: {service_line.price}"
        print(f"[PASS] ServiceLine verified: task_type={service_line.task_type_id}, package={service_line.service_package}, price={service_line.price}")

        # 7. Verify Finance Receivable record
        receivable = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
        assert receivable is not None, "Receivable must exist for financial tracking"
        assert receivable.paid_amount == Decimal("0.00"), f"Paid amount mismatch: {receivable.paid_amount}"
        assert receivable.remaining_amount == Decimal("18000000.00"), f"Remaining amount mismatch: {receivable.remaining_amount}"
        print(f"[PASS] Receivable verified: paid={receivable.paid_amount}, remaining={receivable.remaining_amount}")

        # 8. Verify CustomerIntakeSubmission link
        sub_updated = db.query(CustomerIntakeSubmission).filter(CustomerIntakeSubmission.id == intake_sub.id).first()
        assert sub_updated.linked_contract_id == contract_id, "Submission not linked to contract"
        assert sub_updated.linked_service_line_id == service_line.id, "Submission not linked to service_line"
        assert sub_updated.status == "converted", f"Submission status not updated: {sub_updated.status}"
        print(f"[PASS] CustomerIntakeSubmission linked: status={sub_updated.status}, contract={sub_updated.linked_contract_id}")

        # 9. Verify generated .docx file exists on disk
        if contract.file_link and contract.file_link.startswith("/static/"):
            rel_path = contract.file_link.replace("/static/", "")
            full_path = os.path.join(os.path.dirname(__file__), "..", "static", rel_path)
            assert os.path.exists(full_path), f"DOCX file does not exist at {full_path}"
            assert os.path.getsize(full_path) > 1000, f"DOCX file seems empty ({os.path.getsize(full_path)} bytes)"
            print(f"[PASS] DOCX file successfully generated: {full_path} ({os.path.getsize(full_path)} bytes)")

        # 10. Verify workspace list API query
        from src.routes.routes_contracts import list_contract_workspace
        ws_res = list_contract_workspace(
            search=contract_id,
            service=None,
            task_type_id=None,
            date_signed=None,
            sort="desc",
            page=1,
            page_size=15,
            db=db,
            user=user
        )
        assert ws_res["status"] == "success"
        matched_contracts = [c for c in ws_res["data"] if c["id"] == contract_id]
        assert len(matched_contracts) == 1, f"Contract {contract_id} not found in workspace list"
        ws_contract = matched_contracts[0]
        assert ws_contract["customer_name"] == customer.full_name
        assert ws_contract["total_value"] == 18000000.0
        assert ws_contract["remaining_amount"] == 18000000.0
        assert len(ws_contract["service_lines"]) >= 1
        assert ws_contract["service_lines"][0]["name"] == "Đo hiện trạng"
        assert ws_contract["service_lines"][0]["service_package"] == "Đo Vẽ"
        print(f"[PASS] Contract workspace query returned exact matching row with status '{ws_contract['status']}'")

        print("=" * 60)
        print("ALL 10/10 INTEGRATION VERIFICATION CHECKS PASSED!")
        print("=" * 60)

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
