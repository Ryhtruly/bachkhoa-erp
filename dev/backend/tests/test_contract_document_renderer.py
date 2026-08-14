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
from src.contracts.services import build_contract_document_snapshot
from src.routes import routes_contracts


class ContractDocumentRendererTests(unittest.TestCase):
    def test_document_route_uses_latest_generated_snapshot(self):
        document = SimpleNamespace(
            output_file_name="HopDong_2004_BK-2026.docx",
            render_data_snapshot={
                "contract_id": "2004/BK-2026",
                "_template_version": "mau_hop_dong_v1",
            },
        )

        class SnapshotQuery:
            def filter(self, *_criteria):
                return self

            def order_by(self, *_ordering):
                return self

            def first(self):
                return document

        db = SimpleNamespace(query=lambda _model: SnapshotQuery())
        original_renderer = routes_contracts.doc_generator.render_contract_document
        routes_contracts.doc_generator.render_contract_document = lambda data, version: b"PK-docx"
        try:
            response = routes_contracts.get_contract_document("2004/BK-2026", db, None)
        finally:
            routes_contracts.doc_generator.render_contract_document = original_renderer

        self.assertEqual(response.body, b"PK-docx")

    def test_document_response_renders_snapshot_as_inline_docx(self):
        document = SimpleNamespace(
            output_file_name="HopDong_2004_BK-2026.docx",
            render_data_snapshot={
                "contract_id": "2004/BK-2026",
                "_template_version": "mau_hop_dong_v1",
            },
        )
        original_renderer = routes_contracts.doc_generator.render_contract_document
        routes_contracts.doc_generator.render_contract_document = lambda data, version: b"PK-docx"
        try:
            response = routes_contracts.render_generated_contract_document(document)
        finally:
            routes_contracts.doc_generator.render_contract_document = original_renderer

        self.assertEqual(response.body, b"PK-docx")
        self.assertEqual(
            response.media_type,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertIn("inline", response.headers["content-disposition"])
        self.assertIn("HopDong_2004_BK-2026.docx", response.headers["content-disposition"])

    def test_snapshot_keeps_issued_values_filename_and_document_route(self):
        issued_data = {
            "contract_id": "2004/BK-2026",
            "customer_name": "Lê Thị Kiểm Thử",
            "contract_value": 18500000,
        }

        snapshot, filename, route = build_contract_document_snapshot(issued_data)

        issued_data["customer_name"] = "Đã chỉnh sửa"
        self.assertEqual(snapshot["customer_name"], "Lê Thị Kiểm Thử")
        self.assertEqual(snapshot["_template_version"], "mau_hop_dong_v1")
        self.assertEqual(filename, "HopDong_2004_BK-2026_Lê_Thị_Kiểm_Thử.docx")
        self.assertEqual(route, "/api/contracts/2004/BK-2026/document")

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
