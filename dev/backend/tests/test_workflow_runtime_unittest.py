import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.contracts import workflow_runtime
from src.routes import routes_contracts


class _Result:
    def __init__(self, *, first=None, rows=None, scalar=None):
        self._first = first
        self._rows = list(rows or [])
        self._scalar = scalar

    def mappings(self):
        return self

    def first(self):
        return self._first

    def all(self):
        return self._rows

    def scalar(self):
        return self._scalar

    def scalar_one(self):
        return self._scalar


class _SubmitDb:
    def __init__(self):
        self.calls = []

    def execute(self, query, params=None):
        sql = " ".join(str(query).lower().split())
        self.calls.append(sql)
        if "with locked_checklists as materialized" in sql:
            return _Result(first={
                "missing_types": [], "unresolved_checklists": [],
                "total": 0, "approved": 0, "pending_review": 0,
            })
        if "from public.task_node_assignments" in sql:
            return _Result(first=(1,))
        if "from public.task_nodes n" in sql and "for update of n" in sql:
            return _Result(first={"id": "NODE-1", "status": "in_progress", "is_handover": False})
        if "select checklist_name from public.task_node_checklist_results" in sql:
            return _Result(rows=[])
        if "max(attempt_no)" in sql:
            return _Result(scalar=1)
        if "insert into public.task_node_acceptances" in sql:
            return _Result(scalar="ACC-1")
        return _Result()


class SubmitIntegrationTests(unittest.TestCase):
    def test_existing_node_submit_cannot_bypass_runtime_type_validation(self):
        db = _SubmitDb()
        blocked = HTTPException(status_code=422, detail="Loại giấy Biên bản chưa có tệp.")

        with patch.object(workflow_runtime, "_require_node_assignment"), \
             patch.object(workflow_runtime, "node_pause_block", return_value=None), \
             patch.object(workflow_runtime, "node_document_review_summary", return_value={
                 "rejected_count": 0, "rejected_items": [],
             }), \
             patch("src.dossiers.documents.node_shortage_report", return_value=[]), \
             patch.object(
                 workflow_runtime, "submit_types_for_node", create=True, side_effect=blocked,
             ):
            with self.assertRaises(HTTPException) as caught:
                workflow_runtime.submit_task_node_for_acceptance(
                    db, task_node_id="NODE-1", employee_id="EMP-1",
                    actor_id="USER-1", note=None,
                )

        self.assertEqual(caught.exception.status_code, 422)
        self.assertFalse(any("insert into public.task_node_acceptances" in sql for sql in db.calls))
        self.assertFalse(any("set status = 'submitted'" in sql for sql in db.calls))


class _AcceptanceDb:
    def execute(self, query, params=None):
        sql = " ".join(str(query).lower().split())
        if "from public.task_node_acceptances a" in sql:
            return _Result(first={
                "id": "ACC-1", "status": "pending", "task_node_id": "NODE-1",
                "node_key": "work", "node_status": "submitted",
                "workflow_instance_id": "WF-1", "defined_by_revision_id": "REV-1",
            })
        if "select sl.contract_id, c.total_value" in sql:
            return _Result(first={"contract_id": "HD-1", "total_value": 1, "is_handover": False})
        if "select checklist_name" in sql:
            return _Result(rows=[])
        if "select graph from public.workflow_instance_revisions" in sql:
            return _Result(first={"graph": {"nodes": {"work": {"transitions": {}}}}})
        return _Result()


class AcceptanceRuntimeTypeGateTests(unittest.TestCase):
    def test_node_acceptance_waits_until_all_runtime_types_are_approved(self):
        db = _AcceptanceDb()
        incomplete = {
            "total": 2, "approved": 1, "pending_review": 1,
            "rejected": 0, "missing_files": 0, "is_complete": False,
        }
        with patch.object(
            workflow_runtime, "node_type_review_summary", create=True, return_value=incomplete,
        ), patch.object(workflow_runtime, "node_document_review_summary", return_value={
            "total": 0, "approved_count": 0, "rejected_count": 0, "pending_count": 0,
            "rejected_items": [],
        }), patch.object(workflow_runtime, "_generate_work_pay_entitlements", return_value=(0, 0)), \
             patch.object(workflow_runtime, "_finalize_waivers_after_acceptance", return_value=[]):
            with self.assertRaises(workflow_runtime.WorkflowValidationError) as caught:
                workflow_runtime.review_task_node_acceptance(
                    db, acceptance_id="ACC-1", decision="accepted", outcome=None,
                    review_note=None, actor_id="DIRECTOR",
                )

        self.assertIn("loại giấy", str(caught.exception).lower())


class _RuntimeBatchDb:
    def __init__(self):
        self.event_payload = None

    def execute(self, query, params=None):
        sql = " ".join(str(query).lower().split())
        if "from public.task_nodes n" in sql and "last_reviewed_at" in sql:
            return _Result(first={
                "id": "NODE-1", "status": "submitted", "node_code": "K02",
                "last_reviewed_at": None, "contract_id": "HD-1",
            })
        if "select created_at from public.task_node_events" in sql:
            return _Result(scalar=None)
        if "select cl.review_status" in sql:
            return _Result(rows=[])
        if "insert into public.task_node_events" in sql:
            self.event_payload = json.loads(params["payload"])
            return _Result(scalar="EVENT-1")
        if "from public.task_node_acceptances" in sql:
            return _Result(scalar="ACC-1")
        return _Result()


class ExistingReviewBatchRuntimeTypeTests(unittest.TestCase):
    def test_runtime_type_rejection_emits_existing_batch_event_and_delegates_rework(self):
        db = _RuntimeBatchDb()
        runtime_batch = [{
            "review_status": "rejected",
            "rejection_reason": "Ảnh trang hai bị mờ",
            "checklist_name": "Ảnh mốc",
            "checklist_result_id": "CR-1",
            "document_name": "Ảnh mốc",
        }]

        with patch.object(workflow_runtime, "node_document_review_summary", return_value={
            "total": 0, "approved_count": 0, "rejected_count": 0,
            "pending_count": 0, "rejected_items": [],
        }), patch.object(workflow_runtime, "node_type_review_summary", return_value={
            "total": 1, "approved": 0, "rejected": 1,
            "pending_review": 0, "missing_files": 0, "is_complete": False,
        }), patch.object(
            workflow_runtime, "review_task_node_acceptance",
            return_value={"status": "rework"},
        ) as return_node:
            result = workflow_runtime.flush_node_review_batch(
                db, task_node_id="NODE-1", actor_id="DIRECTOR",
                runtime_batch=runtime_batch,
            )

        self.assertEqual(result["overall_status"], "REWORK_REQUIRED")
        self.assertTrue(result["node_status_changed"])
        self.assertEqual(db.event_payload["summary"]["rejectedCount"], 1)
        self.assertEqual(
            db.event_payload["rejectedItems"],
            [{
                "documentName": "Ảnh mốc",
                "checklistName": "Ảnh mốc",
                "reason": "Ảnh trang hai bị mờ",
            }],
        )
        return_node.assert_called_once_with(
            db,
            acceptance_id="ACC-1",
            decision="rework_required",
            outcome=None,
            review_note="Cần sửa 1 tờ giấy: Ảnh mốc — Ảnh trang hai bị mờ",
            actor_id="DIRECTOR",
            checklist_notes={"CR-1": "Ảnh trang hai bị mờ"},
        )


class DirectorDocumentTypeReviewRouteTests(unittest.TestCase):
    def test_route_uses_task_node_approval_and_commits_before_timeline_publish(self):
        endpoint = getattr(routes_contracts, "review_checklist_document_type", None)
        payload_type = getattr(routes_contracts, "DocumentTypeReviewPayload", None)
        self.assertTrue(callable(endpoint), "missing review_checklist_document_type")
        self.assertIsNotNone(payload_type, "missing DocumentTypeReviewPayload")
        db = MagicMock()
        user = SimpleNamespace(id="DIRECTOR")
        order = []
        db.commit.side_effect = lambda: order.append("commit")

        with patch.object(
            routes_contracts, "review_type", create=True,
            return_value={
                "id": "DT-1", "status": "approved", "node_status": "accepted",
                "node_finalized": True,
            },
        ), patch.object(
            routes_contracts, "invalidate_money_caches",
        ) as invalidate_money, patch.object(
            routes_contracts, "invalidate_cache",
        ), patch.object(
            routes_contracts, "publish_timeline_change",
            side_effect=lambda *args, **kwargs: order.append("publish"),
        ):
            result = endpoint(
                "CR-1", "DT-1", payload_type(decision="approved", reason=None), db, user,
            )

        self.assertEqual(result["status"], "approved")
        self.assertEqual(order, ["commit", "publish"])
        invalidate_money.assert_called_once_with()

    def test_route_rolls_back_domain_validation_errors(self):
        endpoint = getattr(routes_contracts, "review_checklist_document_type", None)
        payload_type = getattr(routes_contracts, "DocumentTypeReviewPayload", None)
        self.assertTrue(callable(endpoint), "missing review_checklist_document_type")
        self.assertIsNotNone(payload_type, "missing DocumentTypeReviewPayload")
        db = MagicMock()
        with patch.object(
            routes_contracts, "review_type", create=True,
            side_effect=HTTPException(status_code=422, detail="Từ chối phải có lý do."),
        ):
            with self.assertRaises(HTTPException):
                endpoint(
                    "CR-1", "DT-1", payload_type(decision="rejected", reason=""),
                    db, SimpleNamespace(id="DIRECTOR"),
                )

        db.rollback.assert_called_once()
        db.commit.assert_not_called()

    def test_route_rolls_back_unexpected_transaction_errors(self):
        endpoint = routes_contracts.review_checklist_document_type
        payload_type = routes_contracts.DocumentTypeReviewPayload
        db = MagicMock()
        with patch.object(
            routes_contracts, "review_type", side_effect=RuntimeError("database write failed"),
        ):
            with self.assertRaises(RuntimeError):
                endpoint(
                    "CR-1", "DT-1", payload_type(decision="approved", reason=None),
                    db, SimpleNamespace(id="DIRECTOR"),
                )

    def test_validate_workflow_graph_accepts_k05a_case_insensitively(self):
        db = MagicMock()
        def mock_execute(query, params=None):
            sql = str(query).lower()
            if "from public.workflow_nodes" in sql:
                return _Result(rows=[("K01",), ("K02",), ("K05a",), ("K05b",), ("K06",), ("K07",)])
            if "from public.departments" in sql:
                return _Result(rows=[("SURVEY",), ("LEGAL",)])
            return _Result(rows=[])
        db.execute.side_effect = mock_execute

        graph = {
            "start_node": "k05a",
            "nodes": {
                "k05a": {
                    "task_code": "K05A",  # Upper case, while DB has K05a
                    "name": "Nộp hồ sơ",
                    "transitions": {},
                    "checklist": [],
                }
            }
        }
        validated = workflow_runtime.validate_workflow_graph(db, graph)
        self.assertEqual(validated["nodes"]["k05a"]["task_code"], "K05a")


if __name__ == "__main__":
    unittest.main()
