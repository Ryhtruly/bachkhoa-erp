"""Đóng Hạng mục khi bước cuối nghiệm thu xong.

Lỗ đã bịt: việc đóng trước đây chỉ chạy khi bước KHÔNG khai bước kế. Nhưng bước
cuối vẫn có thể mang một transition trỏ tới bước đã xong — vòng sửa bài cũ, hoặc
graph chỉnh tay còn sót. Lúc đó ``next_node_key`` khác rỗng, không bước nào
chuyển sang 'ready', và Hạng mục treo ở 'running' vĩnh viễn dù mọi bước đã xong.

Điều kiện đúng là "KHÔNG mở được bước mới nào", không phải "không khai bước kế".
"""

import inspect
import unittest

from src.contracts import workflow_runtime


class WorkflowCompletionGuardTests(unittest.TestCase):
    def setUp(self):
        self.source = inspect.getsource(workflow_runtime.review_task_node_acceptance)

    def test_the_completion_check_keys_off_what_was_actually_unlocked(self):
        self.assertIn("if not unlocked_node_id:", self.source)

    def test_it_no_longer_keys_off_the_declared_transition(self):
        # Câu cũ. Còn nó nghĩa là bản vá bị lùi mà không ai để ý.
        self.assertNotIn("if not next_node_key:", self.source)

    def test_the_instance_is_only_closed_when_nothing_is_left_running(self):
        # Đóng Hạng mục khi còn bước dở là khoá luôn phần việc chưa ai làm.
        self.assertIn("status not in ('accepted', 'skipped', 'cancelled')", self.source)
        self.assertIn("set status = 'completed'", self.source)

    def test_closing_only_touches_a_running_instance(self):
        # Hạng mục đã huỷ không được âm thầm thành 'completed'.
        self.assertIn("where id = :instance_id and status = 'running'", self.source)
