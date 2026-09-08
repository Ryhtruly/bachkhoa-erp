import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from src.routes import routes_contracts as routes


class WorkflowTemplatesComboTestCase(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(id="USR-DIR-1", username="director")

    @patch.object(routes, "get_cached_json", return_value=None)
    @patch.object(routes, "set_cached_json")
    def test_list_workflow_templates_with_combo_filters(self, mock_set_cache, mock_get_cache):
        mock_result = MagicMock()
        mock_result.mappings.return_value.all.return_value = [
            {
                "id": "TPL-01",
                "code": "WF_001",
                "version": 1,
                "name": "Quy trình Đo Đạc Chuẩn",
                "description": "Mẫu đo đạc địa chính",
                "service_package_id": "sp_001",
                "task_type_id": "tt_001",
                "is_default": True,
                "graph": {"nodes": {"K01": {}}},
                "tu_tao": True,
                "nguoi_tao": "director",
                "so_buoc": 1,
                "updated_at": None,
            }
        ]
        self.db.execute.return_value = mock_result

        res = routes.list_workflow_templates(
            package_id="sp_001",
            task_type_id="tt_001",
            db=self.db,
            user=self.user,
        )

        self.assertEqual(len(res["data"]), 1)
        self.assertEqual(res["data"][0]["name"], "Quy trình Đo Đạc Chuẩn")
        self.assertTrue(res["data"][0]["is_default"])
        mock_get_cache.assert_called_once_with("bachkhoa:catalog:workflow_templates:sp_001:tt_001")
        mock_set_cache.assert_called_once()

    @patch.object(routes, "get_cached_json", return_value={"id": "CACHED_TPL"})
    def test_list_workflow_templates_returns_cached_if_available(self, mock_get_cache):
        res = routes.list_workflow_templates(
            package_id="sp_001",
            task_type_id="tt_001",
            db=self.db,
            user=self.user,
        )
        self.assertEqual(res["data"], {"id": "CACHED_TPL"})
        self.db.execute.assert_not_called()

    @patch.object(routes, "get_cached_json", return_value=None)
    @patch.object(routes, "set_cached_json")
    def test_get_default_workflow_template(self, mock_set_cache, mock_get_cache):
        mock_row = {
            "id": "TPL-DEFAULT-01",
            "code": "WF_DEF",
            "version": 1,
            "name": "Mẫu Đo Vẽ Mặc Định",
            "service_package_id": "sp_001",
            "task_type_id": "tt_001",
            "is_default": True,
            "graph": {"nodes": {"K01": {}}},
            "tu_tao": True,
            "nguoi_tao": "director",
            "so_buoc": 1,
        }
        mock_result = MagicMock()
        mock_result.mappings.return_value.first.return_value = mock_row
        self.db.execute.return_value = mock_result

        res = routes.get_default_workflow_template(
            package_id="sp_001",
            task_type_id="tt_001",
            db=self.db,
            user=self.user,
        )

        self.assertIsNotNone(res["data"])
        self.assertEqual(res["data"]["id"], "TPL-DEFAULT-01")
        mock_get_cache.assert_called_once_with("bachkhoa:catalog:workflow_template_default:sp_001:tt_001")
        mock_set_cache.assert_called_once_with(
            "bachkhoa:catalog:workflow_template_default:sp_001:tt_001",
            mock_row,
            ttl_seconds=3600,
        )

    @patch.object(routes, "validate_workflow_graph")
    @patch.object(routes, "invalidate_cache")
    def test_create_workflow_template_with_combo_and_default(self, mock_invalidate, mock_validate):
        mock_graph = {
            "start_node": "K01",
            "nodes": {
                "K01": {"title": "Khảo sát", "transitions": {}},
            },
        }
        mock_validate.return_value = mock_graph

        mock_insert_result = MagicMock()
        mock_insert_result.mappings.return_value.first.return_value = {
            "id": "NEW-TPL",
            "code": "WF_TUTAO_123",
            "name": "Mẫu Đo Đạc Mới",
            "service_package_id": "sp_001",
            "task_type_id": "tt_001",
            "is_default": True,
        }
        self.db.execute.side_effect = [
            MagicMock(scalar=lambda: None),  # duplicate check
            MagicMock(),                     # unset previous default
            mock_insert_result,              # insert statement
        ]

        payload = routes.WorkflowTemplateIn(
            name="Mẫu Đo Đạc Mới",
            description="Mô tả mẫu",
            service_package_id="sp_001",
            task_type_id="tt_001",
            is_default=True,
            graph=mock_graph,
        )

        res = routes.create_workflow_template(payload, db=self.db, user=self.user)
        self.assertEqual(res["data"]["id"], "NEW-TPL")
        self.assertTrue(res["data"]["is_default"])
        self.db.commit.assert_called_once()
        mock_invalidate.assert_any_call("bachkhoa:catalog:*")
        mock_invalidate.assert_any_call("bachkhoa:contract_workspace:*")

    @patch.object(routes, "validate_workflow_graph")
    @patch.object(routes, "invalidate_cache")
    def test_update_workflow_template_fields(self, mock_invalidate, mock_validate):
        mock_current = {
            "id": "TPL-01",
            "code": "WF_001",
            "name": "Tên Cũ",
            "created_by": "USR-1",
            "service_package_id": "sp_001",
            "task_type_id": "tt_001",
            "is_default": False,
        }
        mock_first = MagicMock()
        mock_first.mappings.return_value.first.return_value = mock_current

        mock_updated = {
            "id": "TPL-01",
            "code": "WF_001",
            "name": "Tên Mới Cập Nhật",
            "description": "Ghi chú mới",
            "service_package_id": "sp_001",
            "task_type_id": "tt_001",
            "is_default": True,
            "graph": {"nodes": {}},
        }
        mock_update_res = MagicMock()
        mock_update_res.mappings.return_value.first.return_value = mock_updated

        self.db.execute.side_effect = [
            mock_first,                     # check current
            MagicMock(scalar=lambda: None), # duplicate name check
            MagicMock(),                     # unset existing defaults
            mock_update_res,                # update query
        ]

        payload = routes.WorkflowTemplateUpdateIn(
            name="Tên Mới Cập Nhật",
            description="Ghi chú mới",
            is_default=True,
        )

        res = routes.update_workflow_template("TPL-01", payload, db=self.db, user=self.user)
        self.assertEqual(res["data"]["name"], "Tên Mới Cập Nhật")
        self.assertTrue(res["data"]["is_default"])
        self.db.commit.assert_called_once()
        mock_invalidate.assert_any_call("bachkhoa:catalog:*")


if __name__ == "__main__":
    unittest.main()

