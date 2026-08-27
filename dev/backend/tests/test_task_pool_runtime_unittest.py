import unittest
from datetime import datetime, timedelta, timezone

from src.contracts.workflow_runtime import (
    wip_limit_reached,
    handover_completion_gate_satisfied,
    task_pool_department_code,
    task_pool_roles,
    within_same_contract_preference_window,
)


class TaskPoolRuntimeRulesTests(unittest.TestCase):
    def test_maps_runtime_nodes_to_their_operating_department(self):
        self.assertEqual(task_pool_department_code("K02"), "SURVEY")
        self.assertEqual(task_pool_department_code("K03"), "SURVEY")
        self.assertEqual(task_pool_department_code("K05"), "LEGAL")
        self.assertEqual(task_pool_department_code("K06"), "LEGAL")
        self.assertEqual(task_pool_department_code("K01"), "SALES")

    def test_prefers_the_director_pool_configuration_over_legacy_k_code_mapping(self):
        node_definition = {
            "pool_department_code": "legal",
            "claim_roles": ["submitter", "MAIN", "SUBMITTER", ""],
        }

        self.assertEqual(task_pool_department_code("K02", node_definition), "LEGAL")
        self.assertEqual(task_pool_roles("K02", node_definition), ("SUBMITTER", "MAIN"))

    def test_explicit_empty_pool_configuration_keeps_a_manual_only_node_out_of_the_pool(self):
        node_definition = {"pool_department_code": None, "claim_roles": []}

        self.assertIsNone(task_pool_department_code("K02", node_definition))
        self.assertEqual(task_pool_roles("K02", node_definition), ())

    def test_exposes_only_roles_that_can_be_claimed_from_the_pool(self):
        self.assertEqual(task_pool_roles("K02"), ("MAIN", "ASSISTANT"))
        self.assertEqual(task_pool_roles("K03"), ("MAIN",))
        # Bước nộp cơ quan mang vai trò SUBMITTER; sau khi đánh số lại nó là K05.
        self.assertEqual(task_pool_roles("K05"), ("SUBMITTER",))
        self.assertEqual(task_pool_roles("UNKNOWN"), ())

    def test_debt_override_opens_k08_operational_completion_without_marking_debt_settled(self):
        debt = {"is_settled": False, "gate_open": True}

        self.assertTrue(handover_completion_gate_satisfied(debt))
        self.assertFalse(debt["is_settled"])

    def test_wip_limit_blocks_at_three_not_before(self):
        self.assertFalse(wip_limit_reached(2))
        self.assertTrue(wip_limit_reached(3))
        self.assertTrue(wip_limit_reached(4))

    def test_same_contract_preference_expires_after_thirty_minutes(self):
        now = datetime(2026, 8, 22, 9, 0, tzinfo=timezone.utc)
        self.assertTrue(within_same_contract_preference_window(now - timedelta(minutes=29), now=now))
        self.assertFalse(within_same_contract_preference_window(now - timedelta(minutes=31), now=now))
        self.assertFalse(within_same_contract_preference_window(None, now=now))


if __name__ == "__main__":
    unittest.main()
