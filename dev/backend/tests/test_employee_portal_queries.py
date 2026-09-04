"""Ba truy vấn lớn của màn nhân viên phải CHẠY ĐƯỢC trên DB thật.

Lỗi đã gặp: thêm một cột vào truy vấn Hạng mục, nhưng chuỗi neo lúc sửa trùng ở
hai nơi nên khối SQL rơi vào truy vấn BỂ VIỆC. Truy vấn đó dùng tham số
``:income_types`` mà chỗ gọi không truyền — cả portal nhân viên trả 500.

Toàn bộ 737 test lúc đó vẫn xanh, vì **không test nào gọi thật ba hàm này**: các
test khác đều mock ``db``, nên SQL sai cú pháp hay thiếu tham số không ai chạm tới.

Bộ test này cố tình rất mỏng: chỉ chạy, không dựng dữ liệu. Nó không kiểm nghiệp
vụ — nó kiểm rằng SQL còn hợp lệ và tham số còn khớp.
"""

import unittest

from sqlalchemy import text

from tests.fixtures_so_giay_to import get_missing_documents


class EmployeePortalQueriesRunTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        from src.employee_portal import service

        self.service = service
        # Một nhân viên bất kỳ, hoặc một id không tồn tại. Cả hai đều đủ để chạy
        # SQL — thứ đang kiểm là truy vấn, không phải dữ liệu.
        self.employee_id = self.db.execute(
            text("select id from public.employees limit 1")
        ).scalar() or "khong-ton-tai"

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def test_the_held_items_query_runs(self):
        self.assertIsInstance(self.service._held_items(self.db, self.employee_id), list)

    def test_the_task_pool_query_runs(self):
        # Truy vấn bể việc là chỗ đã lọt tham số lạ. Gọi thẳng SQL để không phụ
        # thuộc vào việc nhân viên đó thuộc phòng nào.
        rows = self.db.execute(self.service._TASK_POOL_QUERY).mappings().all()
        self.assertIsInstance(rows, list)

    def test_the_tasks_query_runs(self):
        rows = self.db.execute(
            self.service._TASKS_QUERY, {"employee_id": self.employee_id}
        ).mappings().all()
        self.assertIsInstance(rows, list)

    def test_the_task_checklist_query_runs(self):
        rows = self.db.execute(
            self.service._TASK_CHECKLIST_QUERY, {"task_node_ids": []}
        ).mappings().all()
        self.assertEqual(rows, [])

    def test_the_node_detail_query_runs(self):
        rows = self.db.execute(
            self.service._ITEM_NODE_DETAIL_QUERY,
            {"employee_id": self.employee_id, "instance_ids": []},
        ).mappings().all()
        self.assertEqual(rows, [])

    def test_every_bind_parameter_of_the_pool_query_is_supplied(self):
        """Chốt chặn cho đúng lỗi đã gặp.

        Truy vấn bể việc chạy KHÔNG tham số. Thêm một ``:tên`` vào đó mà quên
        truyền là 500 ngay, và test ``test_the_task_pool_query_runs`` bên trên đã
        bắt được. Test này nói rõ RÀNG BUỘC để người sửa sau biết mà giữ.
        """
        params = self.service._TASK_POOL_QUERY.compile().params
        self.assertEqual(
            params, {},
            "Truy vấn bể việc phải chạy không cần tham số — chỗ gọi không truyền gì.",
        )
