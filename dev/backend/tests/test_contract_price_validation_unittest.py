import unittest
from pydantic import ValidationError
from src.contracts.schemas import ContractCreateSchema, ContractGenerateSchema


class TestContractPriceValidation(unittest.TestCase):
    def test_contract_create_schema_rejects_negative_value(self):
        with self.assertRaises(ValidationError):
            ContractCreateSchema(
                contract_template_id="tpl-1",
                task_id="task-1",
                customer_name="Test Customer",
                service_type="DO_VE",
                contract_value=-1.0,
                sales_source="Facebook",
            )

    def test_contract_create_schema_rejects_negative_paid_amount(self):
        with self.assertRaises(ValidationError):
            ContractCreateSchema(
                contract_template_id="tpl-1",
                task_id="task-1",
                customer_name="Test Customer",
                service_type="DO_VE",
                contract_value=1000000.0,
                paid_amount=-500.0,
                sales_source="Facebook",
            )

    def test_contract_create_schema_rejects_zero_value(self):
        with self.assertRaises(ValidationError):
            ContractCreateSchema(
                contract_template_id="tpl-1",
                task_id="task-1",
                customer_name="Test Customer",
                service_type="DO_VE",
                contract_value=0.0,
                paid_amount=0.0,
                sales_source="Facebook",
            )

    def test_contract_create_schema_accepts_positive_value(self):
        schema_pos = ContractCreateSchema(
            contract_template_id="tpl-1",
            task_id="task-1",
            customer_name="Test Customer",
            service_type="DO_VE",
            contract_value=1500000.0,
            paid_amount=500000.0,
            sales_source="Facebook",
        )
        self.assertEqual(schema_pos.contract_value, 1500000.0)
        self.assertEqual(schema_pos.paid_amount, 500000.0)

    def test_contract_generate_schema_rejects_negative_value(self):
        with self.assertRaises(ValidationError):
            ContractGenerateSchema(
                contract_template_id="tpl-1",
                customer_name="Test Customer",
                phone="0901234567",
                service_type="DO_VE",
                address="123 Duong ABC",
                contract_value=-100000.0,
                date_signed="2026-09-12",
                due_date="2026-09-20",
                sales_source="Facebook",
            )


if __name__ == "__main__":
    unittest.main()

