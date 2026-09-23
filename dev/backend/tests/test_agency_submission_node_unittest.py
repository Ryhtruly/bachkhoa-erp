"""K05b là bước nộp cơ quan một cửa theo ĐỊNH NGHĨA.

K05a là nộp nội nghiệp kỹ thuật (Đo vẽ), chỉ coi là bước nộp cơ quan nếu
chủ động bật cờ requires_gov_submission.
"""

import unittest
from unittest.mock import MagicMock, patch
from src.contracts import workflow_runtime
from src.contracts.workflow_runtime import (
    GOV_SUBMISSION_MODE_RECEIPT_ONLY,
    GOV_SUBMISSION_MODE_TRACK_TO_COMPLETION,
    government_submission_mode,
    is_agency_submission_node,
    is_legal_dossier_node,
    _ensure_legal_dossier_record,
    _maybe_create_legal_dossier,
    _maybe_create_legal_submission,
    start_task_node,
)


class AgencySubmissionNodeTestCase(unittest.TestCase):
    def test_k05b_is_agency_node_even_without_the_flag(self):
        # K05b theo dõi một cửa Pháp lý: quên tick cờ thì hệ thống vẫn tự nhận diện
        self.assertTrue(is_agency_submission_node(node_code="K05b", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code="K05B", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code=" k05b ", requires_gov_submission=False))

    def test_k05a_is_survey_technical_submission_unless_flagged(self):
        # K05a nộp nội nghiệp (Đo vẽ) nộp xong là hết việc, không theo dõi vòng đời
        self.assertFalse(is_agency_submission_node(node_code="K05a", requires_gov_submission=False))
        self.assertFalse(is_agency_submission_node(node_code="K05A", requires_gov_submission=False))
        # Nếu Giám đốc chủ động bật cờ nộp cơ quan cho K05a thì vẫn được nhận diện
        self.assertTrue(is_agency_submission_node(node_code="K05a", requires_gov_submission=True))

    def test_other_nodes_follow_the_manual_flag(self):
        self.assertFalse(is_agency_submission_node(node_code="K01", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code="K01", requires_gov_submission=True))
        self.assertFalse(is_agency_submission_node(node_code="K04", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code="K04", requires_gov_submission=True))

    def test_missing_node_code_is_never_guessed(self):
        self.assertFalse(is_agency_submission_node(node_code=None, requires_gov_submission=False))
        self.assertFalse(is_agency_submission_node(node_code="", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code=None, requires_gov_submission=True))

    def test_capability_gov_submission_is_agency_node(self):
        self.assertTrue(is_agency_submission_node(capability="GOV_SUBMISSION", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code="NODE_CUSTOM", capability="GOV_SUBMISSION", requires_gov_submission=False))
        self.assertFalse(is_agency_submission_node(node_code="NODE_CUSTOM", capability="SURVEY_FIELD", requires_gov_submission=False))

    def test_free_node_capabilities_have_distinct_submission_modes(self):
        self.assertEqual(
            government_submission_mode(node_code="NODE_CUSTOM", capability="GOV_SUBMIT"),
            GOV_SUBMISSION_MODE_RECEIPT_ONLY,
        )
        self.assertEqual(
            government_submission_mode(node_code="NODE_CUSTOM", capability="GOV_TRACKING"),
            GOV_SUBMISSION_MODE_TRACK_TO_COMPLETION,
        )
        self.assertTrue(is_agency_submission_node(node_code="NODE_CUSTOM", capability="GOV_SUBMIT"))
        self.assertTrue(is_agency_submission_node(node_code="NODE_CUSTOM", capability="GOV_TRACKING"))

    def test_legacy_gov_submission_and_manual_flag_keep_tracking_semantics(self):
        self.assertEqual(
            government_submission_mode(capability="GOV_SUBMISSION"),
            GOV_SUBMISSION_MODE_TRACK_TO_COMPLETION,
        )
        self.assertEqual(
            government_submission_mode(node_code="K05b"),
            GOV_SUBMISSION_MODE_TRACK_TO_COMPLETION,
        )
        self.assertEqual(
            government_submission_mode(node_code="NODE_CUSTOM", requires_gov_submission=True),
            GOV_SUBMISSION_MODE_TRACK_TO_COMPLETION,
        )

    def test_legal_prep_capability_creates_a_legal_dossier_node(self):
        self.assertTrue(is_legal_dossier_node(node_code="CUSTOM-LEGAL", capability="LEGAL_PREP"))
        self.assertTrue(is_legal_dossier_node(node_code="K04", capability="STANDARD"))
        self.assertFalse(is_legal_dossier_node(node_code="CUSTOM", capability="STANDARD"))

    def test_legal_prep_materializes_dossier_when_node_becomes_ready(self):
        def scalar(value):
            result = MagicMock()
            result.scalar.return_value = value
            return result

        assignee = MagicMock()
        assignee.mappings.return_value.first.return_value = {
            "employee_id": "EMP-1", "phone": "0900000000"
        }
        db = MagicMock()
        db.execute.side_effect = [scalar(None), assignee, scalar("DOSSIER-1"), MagicMock()]

        dossier_id = _maybe_create_legal_dossier(
            db,
            task_node={"id": "NODE-1", "node_code": "CUSTOM-LEGAL", "capability_code": "LEGAL_PREP"},
            node_def={"capability": "LEGAL_PREP", "name": "Soạn hồ sơ"},
            context={
                "service_line_id": "SL-1",
                "contract_id": "C-1",
                "customer_name": "Khách hàng",
            },
            actor_id="USER-1",
        )

        self.assertEqual(dossier_id, "DOSSIER-1")
        self.assertEqual(db.execute.call_count, 4)

    def test_existing_legal_dossier_backfills_assignee_when_employee_starts_later(self):
        """Hồ sơ mở lúc node ready phải nhận chủ khi assignment xuất hiện sau đó."""
        def scalar(value):
            result = MagicMock()
            result.scalar.return_value = value
            return result

        assignee = MagicMock()
        assignee.mappings.return_value.first.return_value = {
            "employee_id": "EMP-HUY", "phone": "0900000000"
        }
        db = MagicMock()
        db.execute.side_effect = [scalar("DOSSIER-1"), assignee, MagicMock()]

        dossier_id = _ensure_legal_dossier_record(
            db,
            task_node={"id": "NODE-LEGAL"},
            node_def={"capability": "LEGAL_PREP"},
            context={
                "service_line_id": "SL-1",
                "contract_id": "C-1",
                "customer_name": "Khách hàng",
            },
            actor_id="USER-HUY",
        )

        self.assertEqual(dossier_id, "DOSSIER-1")
        update_calls = [
            call for call in db.execute.call_args_list
            if "update public.legal_dossiers" in str(call.args[0]).lower()
        ]
        self.assertEqual(len(update_calls), 1)
        self.assertEqual(update_calls[0].args[1]["assigned_employee_id"], "EMP-HUY")

    def test_starting_legal_prep_delegates_to_idempotent_dossier_provisioning(self):
        node_result = MagicMock()
        node_result.mappings.return_value.first.return_value = {
            "id": "NODE-LEGAL", "node_code": "N03", "capability_code": "LEGAL_PREP",
            "status": "ready", "workflow_instance_id": "WF-1",
            "defined_by_revision_id": "REV-1", "node_key": "node_3",
            "node_definition": {},
        }
        db = MagicMock()
        db.execute.return_value = node_result

        with patch.object(workflow_runtime, "_require_node_assignment"), \
             patch.object(workflow_runtime, "blocking_in_progress_node", return_value=None), \
             patch.object(workflow_runtime, "recompute_planned_deadlines"), \
             patch.object(workflow_runtime, "_node_definition", return_value={"capability": "LEGAL_PREP"}), \
             patch.object(
                 workflow_runtime, "_ensure_node_module_records",
                 return_value={"legal_dossier_id": "DOSSIER-1"},
             ) as ensure_records:
            result = start_task_node(
                db, task_node_id="NODE-LEGAL", employee_id="EMP-1", actor_id="USER-1"
            )

        ensure_records.assert_called_once_with(
            db, task_node_id="NODE-LEGAL", actor_id="USER-1"
        )
        self.assertEqual(result["legal_dossier_id"], "DOSSIER-1")

    def test_gov_submit_links_receipt_to_existing_dossier_without_creating_one(self):
        def scalar(value):
            result = MagicMock()
            result.scalar.return_value = value
            return result

        assignee = MagicMock()
        assignee.mappings.return_value.first.return_value = {
            "employee_id": "EMP-1", "phone": "0900000000"
        }
        db = MagicMock()
        db.execute.side_effect = [
            assignee,
            scalar("DOSSIER-1"),
            scalar(None),
            scalar("SUBMISSION-1"),
        ]

        submission_id = _maybe_create_legal_submission(
            db,
            task_node={"id": "NODE-SUBMIT", "node_code": "CUSTOM-SUBMIT", "capability_code": "GOV_SUBMIT"},
            node_def={"capability": "GOV_SUBMIT", "name": "Nộp hồ sơ"},
            context={
                "service_line_id": "SL-1", "contract_id": "C-1",
                "customer_name": "Khách hàng", "package_category_type": "LEGAL",
                "survey_drive_folder_url": None,
            },
            actor_id="USER-1",
        )

        self.assertEqual(submission_id, "SUBMISSION-1")
        insert_params = db.execute.call_args_list[-1].args[1]
        self.assertEqual(insert_params["dossier_id"], "DOSSIER-1")
        self.assertFalse(any("insert into public.legal_dossiers" in str(call).lower() for call in db.execute.call_args_list))

    def test_gov_tracking_never_creates_a_dossier_when_legal_prep_is_missing(self):
        def scalar(value):
            result = MagicMock()
            result.scalar.return_value = value
            return result

        assignee = MagicMock()
        assignee.mappings.return_value.first.return_value = {
            "employee_id": "EMP-1", "phone": "0900000000"
        }
        db = MagicMock()
        db.execute.side_effect = [assignee, scalar(None), scalar(None)]

        submission_id = _maybe_create_legal_submission(
            db,
            task_node={"id": "NODE-TRACK", "node_code": "CUSTOM-TRACK", "capability_code": "GOV_TRACKING"},
            node_def={"capability": "GOV_TRACKING", "name": "Theo dõi hồ sơ"},
            context={
                "service_line_id": "SL-1", "contract_id": "C-1",
                "customer_name": "Khách hàng", "package_category_type": "LEGAL",
            },
            actor_id="USER-1",
        )

        self.assertIsNone(submission_id)
        self.assertEqual(db.execute.call_count, 3)
        self.assertFalse(any("insert into public.legal_dossiers" in str(call).lower() for call in db.execute.call_args_list))

    def test_gov_tracking_adds_submission_to_existing_dossier_without_moving_owner(self):
        def scalar(value):
            result = MagicMock()
            result.scalar.return_value = value
            return result

        assignee = MagicMock()
        assignee.mappings.return_value.first.return_value = {
            "employee_id": "EMP-1", "phone": "0900000000"
        }
        db = MagicMock()
        db.execute.side_effect = [assignee, scalar(None), scalar("DOSSIER-1"), scalar("SUBMISSION-1")]

        submission_id = _maybe_create_legal_submission(
            db,
            task_node={"id": "NODE-TRACK", "node_code": "CUSTOM-TRACK", "capability_code": "GOV_TRACKING"},
            node_def={"capability": "GOV_TRACKING", "name": "Theo dõi hồ sơ"},
            context={
                "service_line_id": "SL-1", "contract_id": "C-1",
                "customer_name": "Khách hàng", "package_category_type": "LEGAL",
                "survey_drive_folder_url": None,
            },
            actor_id="USER-1",
        )

        self.assertEqual(submission_id, "SUBMISSION-1")
        insert_params = db.execute.call_args_list[-1].args[1]
        self.assertEqual(insert_params["dossier_id"], "DOSSIER-1")
        self.assertFalse(any("update public.legal_dossiers" in str(call).lower() for call in db.execute.call_args_list))


if __name__ == "__main__":
    unittest.main()
