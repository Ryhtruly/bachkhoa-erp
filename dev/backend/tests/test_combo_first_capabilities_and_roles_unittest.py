"""Unit tests for Combo-First Architecture, Standard Capabilities, and Role Auto-Derivation."""

import unittest
from unittest.mock import MagicMock
from src.contracts.workflow_runtime import (
    TASK_POOL_DEPARTMENTS_BY_NODE_CODE,
    TASK_POOL_ROLES_BY_NODE_CODE,
    NODES_SUBMITTED_TO_AGENCY,
    EVIDENCE_INHERITED_FROM_NODE,
    task_pool_departments,
    task_pool_roles,
    is_agency_submission_node,
    validate_workflow_graph,
    WorkflowValidationError,
)
from src.files.references import STAGE_BY_NODE_CODE, STAGE_BY_UPPER_NODE_CODE
from src.dossiers.slot_requests import default_source_for_node, _DEFAULT_SOURCE_BY_NODE


class ComboFirstCapabilitiesAndRolesTestCase(unittest.TestCase):
    def test_standard_capabilities_in_task_pool_constants(self):
        expected_caps = [
            "STANDARD",
            "SURVEY_FIELD",
            "SURVEY_CAD",
            "LEGAL_PREP",
            "GOV_SUBMISSION",
            "HANDOVER",
        ]
        for cap in expected_caps:
            self.assertIn(cap, TASK_POOL_DEPARTMENTS_BY_NODE_CODE)
            self.assertIn(cap, TASK_POOL_ROLES_BY_NODE_CODE)

        self.assertEqual(TASK_POOL_ROLES_BY_NODE_CODE["SURVEY_FIELD"], ("MAIN", "ASSISTANT"))
        self.assertEqual(TASK_POOL_ROLES_BY_NODE_CODE["STANDARD"], ("MAIN",))
        self.assertIn("GOV_SUBMISSION", NODES_SUBMITTED_TO_AGENCY)
        self.assertIn("HANDOVER", NODES_SUBMITTED_TO_AGENCY)

    def test_evidence_inherited_capabilities(self):
        self.assertEqual(EVIDENCE_INHERITED_FROM_NODE["SURVEY_CAD"], "SURVEY_FIELD")
        self.assertEqual(EVIDENCE_INHERITED_FROM_NODE["LEGAL_PREP"], "SURVEY_CAD")
        self.assertEqual(EVIDENCE_INHERITED_FROM_NODE["GOV_SUBMISSION"], "LEGAL_PREP")

    def test_stage_by_node_code_capabilities(self):
        self.assertEqual(STAGE_BY_NODE_CODE["SURVEY_FIELD"], "do-hien-truong")
        self.assertEqual(STAGE_BY_NODE_CODE["SURVEY_CAD"], "chuan-hoa-ky-thuat")
        self.assertEqual(STAGE_BY_NODE_CODE["LEGAL_PREP"], "soan-ho-so")
        self.assertEqual(STAGE_BY_NODE_CODE["GOV_SUBMISSION"], "nop-co-quan")
        self.assertEqual(STAGE_BY_NODE_CODE["HANDOVER"], "ket-qua")

        # Upper code dictionary
        self.assertEqual(STAGE_BY_UPPER_NODE_CODE["SURVEY_FIELD"], "do-hien-truong")

    def test_default_source_for_node(self):
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["STANDARD"], "KHACH_HANG")
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["SURVEY_FIELD"], "CONG_TY")
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["SURVEY_CAD"], "CONG_TY")
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["LEGAL_PREP"], "CONG_TY")
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["GOV_SUBMISSION"], "CO_QUAN")
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["HANDOVER"], "CO_QUAN")

        # Mock DB returning capability_code
        db = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.first.return_value = {
            "node_code": "CUSTOM_STEP_1",
            "capability_code": "SURVEY_FIELD",
        }
        db.execute.return_value = mock_result
        source = default_source_for_node(db, "node_123")
        self.assertEqual(source, "CONG_TY")

        mock_result.mappings.return_value.first.return_value = {
            "node_code": "CUSTOM_STEP_2",
            "capability_code": "GOV_SUBMISSION",
        }
        source = default_source_for_node(db, "node_456")
        self.assertEqual(source, "CO_QUAN")

    def test_zero_config_role_derivation_in_validate_workflow_graph(self):
        db = MagicMock()
        # Mock active departments
        db.execute.return_value.all.return_value = [("SURVEY",), ("LEGAL",), ("SALES",), ("FINANCE",)]

        # Mock work item rates query
        work_item_rates_row_main = {
            "work_item_id": "wi_gps",
            "code": "GPS",
            "name": "Đo GPS",
            "rate_id": "r1",
            "role_code": "MAIN",
            "amount": 250000,
        }
        work_item_rates_row_assistant = {
            "work_item_id": "wi_gps",
            "code": "GPS",
            "name": "Đo GPS",
            "rate_id": "r2",
            "role_code": "ASSISTANT",
            "amount": 100000,
        }
        
        # When rate has ASSISTANT > 0, claim_roles should be automatically derived as ["MAIN", "ASSISTANT"]
        graph = {
            "start_node": "step_1",
            "nodes": {
                "step_1": {
                    "task_code": "SURVEY_FIELD",
                    "name": "Đo đạc hiện trường mốc ranh",
                    "pool_department_code": "SURVEY",
                    # No explicit claim_roles!
                    "checklist": [
                        {
                            "key": "cl_1",
                            "name": "Chạy máy GPS RTK",
                            "compensation": {
                                "is_payable": True,
                                "work_item_id": "wi_gps",
                            }
                        }
                    ],
                    "transitions": {},
                }
            }
        }

        # Mock db execute sequence:
        # 1. select code from public.workflow_nodes
        # 2. select code from public.departments
        # 3. _current_work_item_rates
        mock_nodes_result = MagicMock()
        mock_nodes_result.all.return_value = [("SURVEY_FIELD",), ("STANDARD",), ("GOV_SUBMISSION",)]

        mock_depts_result = MagicMock()
        mock_depts_result.all.return_value = [("SURVEY",), ("LEGAL",), ("SALES",), ("FINANCE",)]

        mock_rates_result = MagicMock()
        mock_rates_result.mappings.return_value.all.return_value = [
            work_item_rates_row_main,
            work_item_rates_row_assistant,
        ]

        db.execute.side_effect = [mock_nodes_result, mock_depts_result, mock_rates_result]

        validated = validate_workflow_graph(db, graph, require_connected=False)
        step_1 = validated["nodes"]["step_1"]
        self.assertEqual(step_1["claim_roles"], ["MAIN", "ASSISTANT"])
        self.assertEqual(step_1["name"], "Đo đạc hiện trường mốc ranh")
        self.assertEqual(step_1["capability"], "SURVEY_FIELD")

    def test_zero_config_role_derivation_single_main_when_no_assistant_rate(self):
        db = MagicMock()
        mock_nodes_result = MagicMock()
        mock_nodes_result.all.return_value = [("LEGAL_PREP",), ("STANDARD",)]

        mock_depts_result = MagicMock()
        mock_depts_result.all.return_value = [("LEGAL",), ("SURVEY",)]

        mock_rates_result = MagicMock()
        mock_rates_result.mappings.return_value.all.return_value = [
            {
                "work_item_id": "wi_prep",
                "code": "LEGAL_PREP",
                "name": "Soạn hồ sơ",
                "rate_id": "r10",
                "role_code": "MAIN",
                "amount": 200000,
            },
            # ASSISTANT rate is 0
            {
                "work_item_id": "wi_prep",
                "code": "LEGAL_PREP",
                "name": "Soạn hồ sơ",
                "rate_id": "r11",
                "role_code": "ASSISTANT",
                "amount": 0,
            }
        ]

        db.execute.side_effect = [mock_nodes_result, mock_depts_result, mock_rates_result]

        graph = {
            "start_node": "step_1",
            "nodes": {
                "step_1": {
                    "task_code": "LEGAL_PREP",
                    "name": "Soạn đơn đăng ký biến động",
                    "pool_department_code": "LEGAL",
                    "checklist": [
                        {
                            "key": "cl_1",
                            "name": "Soạn hồ sơ pháp lý",
                            "compensation": {
                                "is_payable": True,
                                "work_item_id": "wi_prep",
                            }
                        }
                    ],
                    "transitions": {},
                }
            }
        }

        validated = validate_workflow_graph(db, graph, require_connected=False)
        step_1 = validated["nodes"]["step_1"]
        # Assistant rate = 0 -> only MAIN
        self.assertEqual(step_1["claim_roles"], ["MAIN"])

    def test_explicit_claim_roles_preserved(self):
        db = MagicMock()
        mock_nodes_result = MagicMock()
        mock_nodes_result.all.return_value = [("STANDARD",)]

        mock_depts_result = MagicMock()
        mock_depts_result.all.return_value = [("SALES",), ("LEGAL",)]

        mock_rates_result = MagicMock()
        mock_rates_result.mappings.return_value.all.return_value = []

        db.execute.side_effect = [mock_nodes_result, mock_depts_result, mock_rates_result]

        graph = {
            "start_node": "step_1",
            "nodes": {
                "step_1": {
                    "task_code": "STANDARD",
                    "name": "Tiếp nhận hồ sơ khách hàng",
                    "pool_department_code": "SALES",
                    "claim_roles": ["MAIN"],
                    "transitions": {},
                }
            }
        }

        validated = validate_workflow_graph(db, graph, require_connected=False)
        step_1 = validated["nodes"]["step_1"]
        self.assertEqual(step_1["claim_roles"], ["MAIN"])


if __name__ == "__main__":
    unittest.main()
