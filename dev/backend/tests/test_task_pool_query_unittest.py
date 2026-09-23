import unittest

from src.employee_portal.service import _TASK_POOL_QUERY, available_task_pool_roles


class TaskPoolQueryContractTests(unittest.TestCase):
    def test_query_projects_node_definition_consumed_by_task_pool_mapper(self):
        emitted_query = str(_TASK_POOL_QUERY).lower()

        self.assertIn(" as node_definition", emitted_query)

    def test_primary_submitter_hides_the_remaining_main_button(self):
        roles = available_task_pool_roles(
            ["SUBMITTER", "MAIN"],
            [{"role_code": "SUBMITTER", "employee_id": "EMP-A", "is_primary": True}],
        )
        self.assertEqual(roles, [])

    def test_primary_main_keeps_an_assistant_slot_visible(self):
        roles = available_task_pool_roles(
            ["MAIN", "ASSISTANT"],
            [{"role_code": "MAIN", "employee_id": "EMP-A", "is_primary": True}],
        )
        self.assertEqual(roles, ["ASSISTANT"])


if __name__ == "__main__":
    unittest.main()
