import unittest


class EmployeePortalNodeOrderTests(unittest.TestCase):
    def test_nodes_follow_workflow_transitions_instead_of_node_code(self):
        from src.employee_portal.service import _order_nodes_by_workflow

        graph = {
            "start_node": "k01",
            "nodes": {
                "k01": {"transitions": {"COMPLETED": "k02"}},
                "k02": {"transitions": {"COMPLETED": "n04"}},
                "n04": {"transitions": {"COMPLETED": "k07"}},
                "k07": {"transitions": {}},
            },
        }
        nodes = [
            {"node_key": "k07", "node_code": "K07"},
            {"node_key": "n04", "node_code": "N04"},
            {"node_key": "k02", "node_code": "K02"},
            {"node_key": "k01", "node_code": "K01"},
        ]

        ordered = _order_nodes_by_workflow(nodes, graph)

        self.assertEqual(
            [node["node_code"] for node in ordered],
            ["K01", "K02", "N04", "K07"],
        )

    def test_unconnected_nodes_are_kept_after_reachable_nodes(self):
        from src.employee_portal.service import _order_nodes_by_workflow

        graph = {
            "start_node": "k01",
            "nodes": {
                "k01": {"transitions": {"COMPLETED": "k02"}},
                "k02": {"transitions": {}},
            },
        }
        nodes = [
            {"node_key": "z99", "node_code": "Z99"},
            {"node_key": "k02", "node_code": "K02"},
            {"node_key": "k01", "node_code": "K01"},
        ]

        ordered = _order_nodes_by_workflow(nodes, graph)

        self.assertEqual(
            [node["node_code"] for node in ordered],
            ["K01", "K02", "Z99"],
        )
