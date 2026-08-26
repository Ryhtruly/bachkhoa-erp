import unittest

from src.employee_portal.service import _TASK_POOL_QUERY


class TaskPoolQueryContractTests(unittest.TestCase):
    def test_query_projects_node_definition_consumed_by_task_pool_mapper(self):
        emitted_query = str(_TASK_POOL_QUERY).lower()

        self.assertIn(" as node_definition", emitted_query)


if __name__ == "__main__":
    unittest.main()
