import io
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from docx import Document

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.core import doc_generator
from src.routes import routes_contracts


class ContractDocumentRendererTests(unittest.TestCase):
    def test_document_route_renders_current_persisted_data_not_snapshot(self):
        document = SimpleNamespace(
            output_file_name="HopDong_2004_BK-2026.docx",
            render_data_snapshot={
                "contract_id": "2004/BK-2026",
                "customer_name": "Tên snapshot cũ",
                "customer_email": "snapshot@example.com",
                "_template_version": "mau_hop_dong_v1",
            },
        )
        current_rows = {
            "Contract": SimpleNamespace(
                id="2004/BK-2026",
                customer_id="customer-1",
                lead_id=None,
                service_type="Đo hiện trạng",
                total_value=18500000,
                date_signed="2026-08-14",
            ),
            "Customer": SimpleNamespace(
                full_name="Tên hiện tại",
                phone="0900000000",
                address="Địa chỉ hiện tại",
                email="",
            ),
            "ServiceLine": SimpleNamespace(
                service_type="Đo hiện trạng",
                property_address="Địa chỉ hiện tại",
                price=18500000,
            ),
            "Receivable": SimpleNamespace(due_date=None),
            "LeadPipeline": None,
            "ContractGeneratedDocument": document,
        }

        class CurrentDataQuery:
            def __init__(self, row):
                self.row = row

            def filter(self, *_criteria):
                return self

            def order_by(self, *_ordering):
                return self

            def first(self):
                return self.row

        db = SimpleNamespace(query=lambda model: CurrentDataQuery(current_rows.get(model.__name__)))
        rendered = {}
        original_renderer = routes_contracts.doc_generator.render_contract_document
        routes_contracts.doc_generator.render_contract_document = lambda data, version: rendered.update(data) or b"PK-docx"
        try:
            response = routes_contracts.get_contract_document("2004/BK-2026", db, None)
        finally:
            routes_contracts.doc_generator.render_contract_document = original_renderer

        self.assertEqual(response.body, b"PK-docx")
        self.assertEqual(rendered["customer_name"], "Tên hiện tại")
        self.assertEqual(rendered["customer_email"], "")
        self.assertEqual(rendered["due_date"], "")

    def test_renders_docx_bytes_without_creating_generated_docs_directory(self):
        """A new contract document must remain in memory, not in static/generated_docs."""
        with tempfile.TemporaryDirectory() as temp_dir:
            backend_dir = Path(temp_dir)
            template_dir = backend_dir / "src" / "templates"
            template_dir.mkdir(parents=True)
            template = Document()
            template.add_paragraph("Mã hợp đồng: {{contract_id}}")
            template.save(template_dir / "mau_hop_dong.docx")

            original_backend_dir = doc_generator.BACKEND_DIR
            doc_generator.BACKEND_DIR = str(backend_dir)
            try:
                output = doc_generator.render_contract_document(
                    {"contract_id": "2004/BK-2026"},
                    "mau_hop_dong_v1",
                )
            finally:
                doc_generator.BACKEND_DIR = original_backend_dir

            self.assertTrue(output.startswith(b"PK"))
            self.assertIn("2004/BK-2026", "".join(p.text for p in Document(io.BytesIO(output)).paragraphs))
            self.assertFalse((backend_dir / "static" / "generated_docs").exists())


if __name__ == "__main__":
    unittest.main()
