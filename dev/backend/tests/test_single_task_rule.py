"""Đơn nhiệm: nhận bao nhiêu cũng được, nhưng chỉ chạy MỘT bước một lúc.

Chạy trên DB thật, tự dựng dữ liệu rồi rollback.

Chỗ chặn nằm ở lúc BẮT ĐẦU chứ không phải lúc nhận. Đây là điều kiện để nhận cả
cụm: gán 5 bước một lúc vẫn hợp lệ vì chúng nằm ở 'ready'/'assigned', chỉ đúng
một bước được 'in_progress'.
"""

import unittest

from sqlalchemy import text

from tests.fixtures_so_giay_to import (
    dung_boi_canh,
    giao_viec,
    nguoi_dung,
    them_buoc_k01,
    thieu_bang,
)


class SingleTaskRuleTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = thieu_bang(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        from src.contracts import workflow_runtime

        self.wr = workflow_runtime
        # Mỗi Hạng mục chỉ được MỘT workflow_instance (khoá duy nhất), nên hai
        # bước phải nằm ở hai Hạng mục khác nhau.
        context = dung_boi_canh(self.db, so_hang_muc=2)
        self.service_lines = [item["id"] for item in context["hang_muc"]]
        self.user_id = nguoi_dung(self.db)

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _node(self, index=0, *, status="ready"):
        node_id = them_buoc_k01(
            self.db, service_line_id=self.service_lines[index], checklist=[])
        employee_id = giao_viec(self.db, task_node_id=node_id, user_id=self.user_id)
        self.db.execute(
            text("update public.task_nodes set status=:s where id=:i"),
            {"s": status, "i": node_id},
        )
        return node_id, employee_id

    def _status(self, node_id):
        return self.db.execute(
            text("select status from public.task_nodes where id = :i"), {"i": node_id}
        ).scalar_one()

    def test_starting_a_second_node_is_blocked_and_names_the_busy_one(self):
        busy_node, employee_id = self._node(0, status="in_progress")
        other_node, _ = self._node(1, status="ready")

        with self.assertRaises(self.wr.WorkflowValidationError) as caught:
            self.wr.start_task_node(
                self.db, task_node_id=other_node,
                employee_id=employee_id, actor_id=self.user_id,
            )

        # Thông báo phải nói ĐANG VƯỚNG CÁI GÌ, không phải "bạn đang bận".
        self.assertIn("K01", str(caught.exception))
        self.assertEqual(self._status(other_node), "ready")
        self.assertEqual(self._status(busy_node), "in_progress")

    def test_starting_is_allowed_when_nothing_else_is_running(self):
        node_id, employee_id = self._node(status="ready")

        self.wr.start_task_node(
            self.db, task_node_id=node_id,
            employee_id=employee_id, actor_id=self.user_id,
        )

        self.assertEqual(self._status(node_id), "in_progress")

    def test_the_rule_ignores_the_node_being_started(self):
        # Bấm Bắt đầu hai lần trên cùng một bước không được tự chặn chính nó.
        node_id, employee_id = self._node(status="ready")
        busy = self.wr.blocking_in_progress_node(
            self.db, employee_id=employee_id, task_node_id=node_id
        )
        self.assertIsNone(busy)


class ClaimWithoutStartingTests(unittest.TestCase):
    """``start_now=False`` là nền cho đường nhận cả cụm."""

    def test_claim_helper_accepts_the_flag_and_defaults_to_starting(self):
        import inspect

        from src.contracts import workflow_runtime

        signature = inspect.signature(workflow_runtime.claim_and_start_task)
        start_now = signature.parameters["start_now"]
        # Mặc định True để đường nhận lẻ đang chạy giữ nguyên hành vi.
        self.assertTrue(start_now.default)

        source = inspect.getsource(workflow_runtime.claim_and_start_task)
        # Nhận mà không bắt đầu thì KHÔNG vướng đơn nhiệm — bước nằm ở 'ready'.
        self.assertIn("if start_now:", source)
        self.assertIn("if start_now and previous_status ==", source)
