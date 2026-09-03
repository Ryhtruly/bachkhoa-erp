"""View bảng lương loại suất khoán đã chuyển người — chạy trên DB thật.

Tình huống: A nhờ hỗ trợ ở một bước, B nhận làm hộ. Tiền khoán bước đó phải vào
bảng lương của B. Nếu suất của A vẫn được cộng thì công ty trả hai lần cho một
phần việc, và A được trả cho việc mình không làm.

Ép lọc ở MỘT chỗ (view) thay vì trông chờ mười hai truy vấn lương đều nhớ viết
"and not is_replaced" — quên một chỗ là sai lương, và sai lương thì không ai
phát hiện qua test đơn vị.
"""

import unittest

from sqlalchemy import text

from src.db.database import SessionLocal


def _has_migration_a(db) -> bool:
    return bool(db.execute(text("""
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'work_pay_entitlements'
          and column_name = 'is_replaced'
    """)).first())


class ReplacedEntitlementViewTests(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        if not _has_migration_a(self.db):
            self.db.close()
            self.skipTest("Migration A chưa lên trên DB này")
        # Khoá ngoài trỏ tới hợp đồng, nhân viên, quy trình thật. Dựng đủ bộ chỉ
        # để kiểm một câu lọc là quá đắt, nên tắt trigger khoá ngoài trong đúng
        # transaction này rồi rollback sạch ở tearDown.
        self.db.execute(text("set session_replication_role = replica"))

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _entitlement(self, entitlement_id, employee_id, **changes):
        self.db.execute(
            text("""
                insert into public.work_pay_entitlements
                    (id, workflow_instance_id, task_node_id, employee_id, role_code,
                     amount, earned_at, calculation_snapshot, idempotency_key)
                values (:id, 'WI-TEST', 'TN-TEST', :employee_id, 'MAIN',
                        500000, now(), '{}'::jsonb, :key)
            """),
            {"id": entitlement_id, "employee_id": employee_id, "key": f"key-{entitlement_id}"},
        )
        if changes:
            self.db.execute(
                text("""
                    update public.work_pay_entitlements
                    set is_replaced = :is_replaced, replaced_by = :replaced_by
                    where id = :id
                """),
                {
                    "id": entitlement_id,
                    "is_replaced": changes.get("is_replaced", False),
                    "replaced_by": changes.get("replaced_by"),
                },
            )

    def _view_rows(self):
        return [dict(row) for row in self.db.execute(text("""
            select id, employee_id, amount from public.active_work_pay_entitlements
            where task_node_id = 'TN-TEST' order by id
        """)).mappings().all()]

    def test_a_replaced_entitlement_is_invisible_to_payroll(self):
        self._entitlement("WPE-B", "EMP-B")
        self._entitlement("WPE-A", "EMP-A", is_replaced=True, replaced_by="WPE-B")

        rows = self._view_rows()

        self.assertEqual([row["employee_id"] for row in rows], ["EMP-B"])

    def test_the_replaced_row_survives_in_the_base_table_with_its_amount(self):
        self._entitlement("WPE-B", "EMP-B")
        self._entitlement("WPE-A", "EMP-A", is_replaced=True, replaced_by="WPE-B")

        kept = self.db.execute(text("""
            select employee_id, amount, replaced_by from public.work_pay_entitlements
            where id = 'WPE-A'
        """)).mappings().one()

        # Số tiền là thứ duy nhất để đối chiếu khi có tranh chấp "ai đáng được
        # trả bao nhiêu". Xoá dòng hoặc hạ về 0 là mất luôn cái đó.
        self.assertEqual(float(kept["amount"]), 500000.0)
        self.assertEqual(kept["replaced_by"], "WPE-B")

    def test_the_sum_payroll_reads_counts_the_helper_once_not_both(self):
        self._entitlement("WPE-B", "EMP-B")
        self._entitlement("WPE-A", "EMP-A", is_replaced=True, replaced_by="WPE-B")

        total = self.db.execute(text("""
            select coalesce(sum(amount), 0) from public.active_work_pay_entitlements
            where task_node_id = 'TN-TEST'
        """)).scalar()

        self.assertEqual(float(total), 500000.0)

    def test_pointing_at_a_replacement_without_marking_replaced_is_rejected(self):
        self._entitlement("WPE-B", "EMP-B")
        self._entitlement("WPE-A", "EMP-A")

        # Vừa trỏ đi vừa còn được tính lương là trạng thái không được phép tồn tại
        # — nó cho ra đúng cái lỗi trả hai lần mà cả mục này sinh ra để chặn.
        with self.assertRaises(Exception):
            self.db.execute(
                text("update public.work_pay_entitlements set replaced_by = 'WPE-B' where id = 'WPE-A'")
            )
            self.db.flush()

    def test_an_entitlement_cannot_replace_itself(self):
        self._entitlement("WPE-A", "EMP-A")

        with self.assertRaises(Exception):
            self.db.execute(text("""
                update public.work_pay_entitlements
                set is_replaced = true, replaced_by = 'WPE-A' where id = 'WPE-A'
            """))
            self.db.flush()
