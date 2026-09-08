import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.routes.routes_employee_portal import ClaimNodeIn, claim_task


class TaskPoolClaimRouteTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(id="user-01")
        self.employee = SimpleNamespace(id="employee-01")

    @patch("src.routes.routes_employee_portal._active_employee_for_user")
    @patch("src.routes.routes_employee_portal.claim_and_start_task")
    def test_redis_race_is_exposed_as_http_409(self, claim_runtime, active_employee):
        active_employee.return_value = self.employee
        claim_runtime.side_effect = HTTPException(status_code=429, detail="locked")

        with self.assertRaises(HTTPException) as raised:
            claim_task("node-01", ClaimNodeIn(role_code="MAIN"), self.db, self.user)

        self.assertEqual(raised.exception.status_code, 409)
        self.db.rollback.assert_called_once()

    @patch("src.routes.routes_employee_portal.publish_timeline_change")
    @patch("src.routes.routes_employee_portal.invalidate_cache")
    @patch("src.routes.routes_employee_portal._active_employee_for_user")
    @patch("src.routes.routes_employee_portal.claim_and_start_task")
    def test_success_commits_invalidates_pool_and_publishes_event(
        self, claim_runtime, active_employee, invalidate, publish
    ):
        active_employee.return_value = self.employee
        claim_runtime.return_value = {"task_node_id": "node-01", "status": "in_progress"}

        result = claim_task("node-01", ClaimNodeIn(role_code="MAIN"), self.db, self.user)

        self.assertEqual(result["status"], "in_progress")
        self.db.commit.assert_called_once()
        invalidate.assert_any_call("task_pool:*")
        invalidate.assert_any_call("bachkhoa:contract_workspace:*")
        publish.assert_called_once_with("TASK_CLAIMED", entity_id="node-01")


if __name__ == "__main__":
    unittest.main()


class GiamDocNgheDuocLuongSuKien(unittest.TestCase):
    """Giám đốc không có dòng employees, nhưng vẫn phải mở được luồng sự kiện.

    Màn Hàng chờ duyệt của Giám đốc nghe chung luồng này để biết có đề xuất mới.
    Trước đây route chặn theo hồ sơ nhân sự nên Giám đốc nhận 404, rồi trình duyệt
    thử lại mỗi 1,5 giây mãi mãi — 35 dòng lỗi trong hai phút và realtime chết hẳn.
    """

    def test_khong_co_ho_so_nhan_su_van_mo_duoc_luong(self):
        from fastapi.responses import StreamingResponse

        from src.routes import routes_employee_portal as mod

        db = MagicMock()
        # Không có dòng employees nào khớp — đúng trạng thái của tài khoản admin.
        db.query.return_value.filter.return_value.first.return_value = None
        user = SimpleNamespace(id="giam-doc-khong-co-ho-so-nhan-su")

        response = mod.stream_employee_task_events(db=db, user=user)

        self.assertIsInstance(response, StreamingResponse)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.media_type.startswith("text/event-stream"))
