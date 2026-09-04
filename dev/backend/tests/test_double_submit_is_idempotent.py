"""Bấm nộp nghiệm thu hai lần — chạy trên DB thật, tự dựng dữ liệu rồi rollback.

Tính đúng đắn của DỮ LIỆU vốn đã được bảo đảm: truy vấn node dùng
``for update of n`` và chốt ``status != 'in_progress'``, nên hai request song
song không thể cùng sinh bản ghi nghiệm thu.

Chỗ đã sửa là cách BÁO LẠI: lần bấm thứ hai từng nhận lỗi đỏ, trong khi người
dùng không làm gì sai — việc họ muốn đã xong rồi.
"""

import unittest

from sqlalchemy import text

from tests.fixtures_so_giay_to import (
    build_test_context,
    assign_node,
    create_test_user,
    insert_k01_node,
    get_missing_documents,
)


class DoubleSubmitTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        from src.contracts import workflow_runtime

        self.wr = workflow_runtime

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _node_ready_to_submit(self):
        context = build_test_context(self.db)
        service_line_id = context["hang_muc"][0]["id"]
        node_id = insert_k01_node(self.db, service_line_id=service_line_id, checklist=[])
        user_id = create_test_user(self.db)
        employee_id = assign_node(self.db, task_node_id=node_id, user_id=user_id)
        self.db.execute(
            text("update public.task_nodes set status='in_progress' where id=:i"),
            {"i": node_id},
        )
        return node_id, user_id, employee_id

    def _submit(self, node_id, user_id, employee_id):
        return self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=node_id, employee_id=employee_id,
            actor_id=user_id, note=None,
        )

    def _acceptance_count(self, node_id):
        return self.db.execute(
            text("select count(*) from public.task_node_acceptances where task_node_id = :i"),
            {"i": node_id},
        ).scalar_one()

    def test_submit_still_locks_the_node_row_before_deciding(self):
        """Khoá dòng là thứ DUY NHẤT chặn hai request song song cùng ghi.

        Test hành vi chạy một luồng nên không dựng lại được cuộc đua đó; giữ vết
        ở đây để không ai gỡ nhầm khoá rồi tưởng vẫn an toàn vì test còn xanh.
        """
        import inspect

        source = inspect.getsource(self.wr.submit_task_node_for_acceptance)
        self.assertIn("for update of n", source)

    def test_second_submit_returns_the_same_acceptance_without_raising(self):
        node_id, user_id, employee_id = self._node_ready_to_submit()

        first = self._submit(node_id, user_id, employee_id)
        second = self._submit(node_id, user_id, employee_id)

        self.assertEqual(second["acceptance_id"], first["acceptance_id"])
        self.assertTrue(second.get("already_submitted"))
        # Không có bản ghi thứ hai, nên Giám đốc cũng chỉ thấy một yêu cầu duyệt.
        self.assertEqual(self._acceptance_count(node_id), 1)

    def test_first_submit_does_not_claim_it_was_already_submitted(self):
        node_id, user_id, employee_id = self._node_ready_to_submit()

        first = self._submit(node_id, user_id, employee_id)

        self.assertFalse(first.get("already_submitted"))

    def test_submitting_a_node_that_never_started_still_raises(self):
        # Đường tắt chỉ dành cho node ĐÃ nộp. Node chưa bắt đầu mà im lặng báo
        # thành công là giấu lỗi thật.
        node_id, user_id, employee_id = self._node_ready_to_submit()
        self.db.execute(
            text("update public.task_nodes set status='ready' where id=:i"),
            {"i": node_id},
        )

        with self.assertRaises(self.wr.WorkflowValidationError):
            self._submit(node_id, user_id, employee_id)
