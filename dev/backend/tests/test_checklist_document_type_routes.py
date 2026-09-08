import asyncio
import inspect
import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException, UploadFile

from src.routes import routes_employee_portal as routes


def required_route(test_case, name):
    function = getattr(routes, name, None)
    test_case.assertTrue(callable(function), f"missing route {name}")
    return function


class ChecklistDocumentTypeRouteTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(id="USER-1")
        self.employee = SimpleNamespace(id="EMP-1")
        publish_patcher = patch.object(routes, "publish_timeline_change")
        self.publish = publish_patcher.start()
        self.addCleanup(publish_patcher.stop)

    def _route_patches(self, domain_name, result):
        return (
            patch.object(routes, "_active_employee_for_user", return_value=self.employee),
            patch.object(routes.EmployeePortalService, "authorize_checklist_evidence_submission"),
            patch(f"src.dossiers.checklist_document_types.{domain_name}", return_value=result),
        )

    def test_router_exposes_all_four_required_paths(self):
        expected = {
            ("GET", "/api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-type-suggestions"),
            ("POST", "/api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types"),
            ("POST", "/api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types/{type_id}/files"),
            ("DELETE", "/api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types/{type_id}/files/{document_id}"),
        }
        actual = {
            (method, route.path)
            for route in routes.router.routes
            for method in (route.methods or set())
        }
        self.assertTrue(expected.issubset(actual), expected - actual)

    def test_suggestions_authorize_before_returning_server_context(self):
        endpoint = required_route(self, "get_checklist_document_type_suggestions")
        active, authorize, domain = self._route_patches(
            "exact_combo_suggestions", {"data": [], "context": {"node_code": "K02"}},
        )
        with active, authorize as auth, domain:
            result = endpoint("NODE-1", "CR-1", self.db, self.user)
        auth.assert_called_once_with(
            self.db, self.employee, "NODE-1", "CR-1", evidence_provided=True,
        )
        self.assertEqual(result["context"]["node_code"], "K02")

    def test_create_forwards_only_payload_fields_and_commits(self):
        endpoint = required_route(self, "create_checklist_document_type")
        payload_type = getattr(routes, "ChecklistDocumentTypeIn", None)
        self.assertIsNotNone(payload_type, "missing ChecklistDocumentTypeIn")
        active, authorize, domain = self._route_patches("add_type", {"id": "DT-1"})
        payload = payload_type(template_id="TPL-1", name="forged", source="CONG_TY")
        with active, authorize as auth, domain as add_type:
            result = endpoint("NODE-1", "CR-1", payload, self.db, self.user)
        auth.assert_called_once()
        add_type.assert_called_once_with(
            self.db, checklist_result_id="CR-1", template_id="TPL-1",
            name="forged", source="CONG_TY", actor_id="USER-1",
        )
        self.db.commit.assert_called_once()
        self.assertEqual(result, {"status": "success", "data": {"id": "DT-1"}})

    def test_upload_requires_at_least_one_file(self):
        endpoint = required_route(self, "upload_checklist_document_type_files")
        with patch.object(routes, "_active_employee_for_user", return_value=self.employee), \
             patch.object(routes.EmployeePortalService, "authorize_checklist_evidence_submission"):
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(endpoint("NODE-1", "CR-1", "DT-1", [], self.db, self.user))
        self.assertEqual(caught.exception.status_code, 422)

    def test_upload_accepts_change_reason_for_an_already_approved_type(self):
        endpoint = required_route(self, "upload_checklist_document_type_files")
        self.assertIn("change_reason", inspect.signature(endpoint).parameters)

    def test_upload_reads_multiple_files_and_passes_one_batch(self):
        endpoint = required_route(self, "upload_checklist_document_type_files")
        files = [
            UploadFile(filename="one.pdf", file=BytesIO(b"one"), headers={"content-type": "application/pdf"}),
            UploadFile(filename="two.jpg", file=BytesIO(b"two"), headers={"content-type": "image/jpeg"}),
        ]
        active, authorize, domain = self._route_patches(
            "add_files", [{"status": "success"}, {"status": "success"}],
        )
        with active, authorize as auth, domain as add_files:
            result = asyncio.run(endpoint("NODE-1", "CR-1", "DT-1", files, self.db, self.user))
        auth.assert_called_once_with(
            self.db, self.employee, "NODE-1", "CR-1", evidence_provided=True,
        )
        self.assertEqual(add_files.call_args.kwargs["uploads"], [
            ("one.pdf", "application/pdf", b"one"),
            ("two.jpg", "image/jpeg", b"two"),
        ])
        self.db.commit.assert_called_once()
        self.assertEqual(len(result["data"]), 2)

    def test_upload_rejects_type_from_another_checklist_before_domain_write(self):
        endpoint = required_route(self, "upload_checklist_document_type_files")
        self.db.execute.return_value.first.return_value = None
        file = UploadFile(
            filename="one.pdf", file=BytesIO(b"one"),
            headers={"content-type": "application/pdf"},
        )
        active, authorize, domain = self._route_patches("add_files", [])
        with active, authorize, domain as add_files:
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(endpoint("NODE-1", "CR-1", "DT-OTHER", [file], self.db, self.user))
        self.assertEqual(caught.exception.status_code, 404)
        add_files.assert_not_called()

    def test_delete_authorizes_forwards_change_reason_and_commits(self):
        endpoint = required_route(self, "delete_checklist_document_type_file")
        payload_type = getattr(routes, "ChecklistDocumentChangeIn", None)
        self.assertIsNotNone(payload_type, "missing ChecklistDocumentChangeIn")
        active, authorize, domain = self._route_patches(
            "remove_file", {"document_type_id": "DT-1", "document_id": "D-1"},
        )
        with active, authorize as auth, domain as remove_file:
            result = endpoint(
                "NODE-1", "CR-1", "DT-1", "D-1",
                payload_type(change_reason="Thay bản ký mới"), self.db, self.user,
            )
        auth.assert_called_once()
        remove_file.assert_called_once_with(
            self.db, document_type_id="DT-1", document_id="D-1", actor_id="USER-1",
            change_reason="Thay bản ký mới",
        )
        self.db.commit.assert_called_once()
        self.assertEqual(result["data"]["document_id"], "D-1")

    def test_raw_assignment_payload_prefers_runtime_document_type(self):
        payload_type = routes.ClassifySourceDocumentIn
        payload = payload_type(document_type_id="DT-1", template_id="TPL-OLD")
        with patch.object(routes, "_active_employee_for_user", return_value=self.employee), \
             patch.object(routes.EmployeePortalService, "authorize_checklist_evidence_submission"), \
             patch("src.dossiers.checklist_document_types.attach_existing_file", return_value={
                 "document_type_id": "DT-1",
             }) as attach:
            routes.classify_source_document("NODE-1", "CR-1", "D-RAW", payload, self.db, self.user)
        attach.assert_called_once_with(
            self.db, document_type_id="DT-1", document_id="D-RAW", actor_id="USER-1",
        )


if __name__ == "__main__":
    unittest.main()
