"""Tạm dừng ở cấp bước — chạy trên DB thật, rollback ở tearDown.

Chờ cơ quan ra thông báo thuế có thể mất ba tuần. Tính ba tuần đó vào KPI người
nộp hồ sơ là phạt họ vì một việc họ không điều khiển được. Đó là toàn bộ lý do
tính năng này tồn tại — nên phép cộng dồn quãng chờ phải đúng tuyệt đối.

Ca được canh kỹ nhất: **dừng → tiếp → dừng → tiếp**. Quên xoá mốc sau lần tiếp
đầu tiên thì lần sau cộng dồn lại cả quãng đã tính, và KPI thành số vô nghĩa.
"""

import unittest
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from tests.fixtures_so_giay_to import dung_boi_canh, nguoi_dung, thieu_bang


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class NodePauseTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = thieu_bang(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))
        if not self.db.execute(text("""
            select 1 from information_schema.columns
            where table_schema='public' and table_name='task_nodes'
              and column_name='pause_reason_type'
        """)).first():
            self.db.close()
            self.skipTest("Migration C2 chưa lên trên DB này")

        from src.contracts import workflow_runtime

        self.wr = workflow_runtime
        self.wr.refresh_node_config(self.db, force=True)

        # Hai Hạng mục: mỗi Hạng mục chỉ được MỘT workflow_instance (khoá duy
        # nhất), nên test cần bước thứ hai phải dựng trên Hạng mục thứ hai.
        context = dung_boi_canh(self.db, so_hang_muc=2)
        self.service_lines = [item["id"] for item in context["hang_muc"]]
        self.user_id = nguoi_dung(self.db)
        self.employee_id = self._employee()
        self.task_node_id = self._node("K05a")

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.wr.clear_node_config()

    # ── dựng bối cảnh ──

    def _employee(self):
        employee_id = db_id = _id("E")
        self.db.execute(
            text("insert into public.employees (id, full_name, is_active)"
                 " values (:id, 'Nhân viên thử', true)"),
            {"id": db_id},
        )
        return employee_id

    def _node(self, node_code, status="in_progress", *, line=0):
        instance_id = _id("WI")
        self.db.execute(
            text("insert into public.workflow_instances (id, service_line_id, status)"
                 " values (:id, :sl, 'running')"),
            {"id": instance_id, "sl": self.service_lines[line]},
        )
        revision_id = _id("REV")
        self.db.execute(
            text("insert into public.workflow_instance_revisions"
                 " (id, workflow_instance_id, revision_no, graph)"
                 " values (:id, :wi, 1, cast('{\"nodes\": {}}' as jsonb))"),
            {"id": revision_id, "wi": instance_id},
        )
        self.db.execute(
            text("insert into public.workflow_nodes (code, name) values (:c, :c)"
                 " on conflict (code) do nothing"),
            {"c": node_code},
        )
        node_id = _id("TN")
        self.db.execute(
            text("""
                insert into public.task_nodes
                    (id, workflow_instance_id, defined_by_revision_id, node_key,
                     node_code, status, started_at)
                values (:id, :wi, :rev, :key, :code, :status, now() - interval '2 hours')
            """),
            {"id": node_id, "wi": instance_id, "rev": revision_id,
             "key": node_code.lower(), "code": node_code, "status": status},
        )
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, assignment_status)
                values (:n, :e, 'SUBMITTER', 'accepted')
            """),
            {"n": node_id, "e": self.employee_id},
        )
        return node_id

    def _pause(self, reason="AGENCY", note="Chờ thông báo thuế từ chi cục"):
        return self.wr.pause_node(
            self.db, task_node_id=self.task_node_id, employee_id=self.employee_id,
            reason_type=reason, note=note, actor_id=self.user_id,
        )

    def _resume(self):
        return self.wr.resume_node(
            self.db, task_node_id=self.task_node_id,
            employee_id=self.employee_id, actor_id=self.user_id,
        )

    def _row(self):
        return self.db.execute(
            text("select pause_reason_type, paused_at, paused_note, paused_seconds"
                 " from public.task_nodes where id = :i"),
            {"i": self.task_node_id},
        ).mappings().one()

    # ── test ──

    def test_pausing_records_the_reason_and_the_note(self):
        self._pause()

        row = self._row()
        self.assertEqual(row["pause_reason_type"], "AGENCY")
        self.assertEqual(row["paused_note"], "Chờ thông báo thuế từ chi cục")
        self.assertIsNotNone(row["paused_at"])

    def test_a_reason_outside_the_three_is_refused(self):
        with self.assertRaises(Exception):
            self._pause(reason="CHO_TI_NUA")

    def test_pausing_without_saying_what_you_are_waiting_for_is_refused(self):
        # Người tiếp nhận sau đọc đúng dòng này để biết hồ sơ đứng ở đâu. "ok"
        # thì họ vẫn phải đi hỏi.
        with self.assertRaises(Exception) as caught:
            self._pause(note="ok")
        self.assertIn("đang chờ gì", str(caught.exception))

    def test_a_node_not_configured_for_pausing_is_refused(self):
        self.task_node_id = self._node("K03", line=1)

        # K03 không khai allow_pause trong danh mục. Cho dừng ở đây là mở đường
        # dừng đồng hồ cho mọi bước, kể cả bước chậm vì chính nhân viên.
        with self.assertRaises(Exception) as caught:
            self._pause()
        self.assertIn("không khai tạm dừng", str(caught.exception))

    def test_pausing_twice_is_refused(self):
        self._pause()
        with self.assertRaises(Exception):
            self._pause()

    def test_resuming_clears_the_mark_and_the_reason_together(self):
        self._pause()
        self._resume()

        row = self._row()
        # Còn sót một trong hai là lần dừng sau cộng dồn lại cả quãng đã tính.
        self.assertIsNone(row["pause_reason_type"])
        self.assertIsNone(row["paused_at"])

    def test_resuming_a_running_node_is_refused(self):
        with self.assertRaises(Exception):
            self._resume()

    def test_pause_resume_twice_adds_up_to_the_sum_of_both_gaps(self):
        self._pause()
        self._backdate_pause(seconds=600)
        first = self._resume()["paused_seconds"]

        self._pause(reason="INTERNAL", note="Chờ sếp ký duyệt hồ sơ")
        self._backdate_pause(seconds=300)
        second = self._resume()["paused_seconds"]

        # Ca dễ hỏng ngầm nhất của cả mục: tổng phải là 600 + 300, không phải
        # 600 + 900 (cộng lại quãng cũ) hay chỉ 300 (ghi đè mất quãng cũ).
        self.assertGreaterEqual(first, 600)
        self.assertGreaterEqual(second, 900)
        self.assertLess(second, 960)

    def test_a_paused_node_cannot_be_submitted_for_acceptance(self):
        self._pause()

        blocker = self.wr.node_pause_block(self.db, task_node_id=self.task_node_id)

        # Chặn ở tầng API chứ không chỉ ẩn nút — gọi thẳng API là qua mặt được
        # giao diện, và bước sẽ đóng với kết quả cơ quan chưa về.
        self.assertIsNotNone(blocker)
        self.assertIn("Chờ thông báo thuế từ chi cục", blocker)

    def test_the_gate_opens_again_after_resuming(self):
        self._pause()
        self._resume()

        self.assertIsNone(self.wr.node_pause_block(self.db, task_node_id=self.task_node_id))

    def test_surveyor_asks_for_a_rollback_instead_of_reopening_by_itself(self):
        result = self._pause(reason="SURVEYOR", note="Bản vẽ sai ranh mốc số 4")

        # SURVEYOR không tự kéo K02·K03·K04 về. Mở lại ba bước đã xong là việc
        # nặng, không để một người tự quyết.
        self.assertTrue(result["needs_rollback_request"])

    def test_the_other_reasons_do_not_ask_for_a_rollback(self):
        self.assertFalse(self._pause()["needs_rollback_request"])

    def test_paused_time_is_subtracted_from_the_working_clock(self):
        moc = datetime(2026, 9, 2, 12, 0, 0, tzinfo=timezone.utc)
        node = {
            "started_at": moc - timedelta(hours=10),
            "completed_at": None,
            "paused_seconds": 3600 * 4,
            "paused_at": None,
        }

        # Trôi 10 giờ, nằm chờ 4 giờ → KPI tính 6 giờ.
        self.assertEqual(self.wr.node_elapsed_working_seconds(node, now=moc), 3600 * 6)

    def test_an_ongoing_pause_counts_too(self):
        moc = datetime(2026, 9, 2, 12, 0, 0, tzinfo=timezone.utc)
        node = {
            "started_at": moc - timedelta(hours=10),
            "completed_at": None,
            "paused_seconds": 0,
            "paused_at": moc - timedelta(hours=3),
        }

        # Không cộng quãng đang dừng dở thì bước nào càng dừng lâu càng có vẻ
        # làm nhanh.
        self.assertEqual(self.wr.node_elapsed_working_seconds(node, now=moc), 3600 * 7)

    def test_the_rework_window_defaults_to_one_day_while_sla_is_unset(self):
        # SLA từng bước chưa khai số thật nên mọi bước dùng mốc mặc định.
        self.assertEqual(self.wr.rework_deadline_hours("K03"), 24)

    def test_the_rework_window_is_half_the_sla_but_never_over_a_day(self):
        self.wr.set_node_config([
            {"code": "K02", "sla_hours": 8},
            {"code": "K03", "sla_hours": 240},
        ])

        self.assertEqual(self.wr.rework_deadline_hours("K02"), 4)
        # Bước SLA 10 ngày mà cho sửa 5 ngày là mở cửa cho việc trôi thêm một tuần
        # vì một tờ ảnh mờ.
        self.assertEqual(self.wr.rework_deadline_hours("K03"), 24)

    def _backdate_pause(self, *, seconds):
        """Đẩy mốc tạm dừng lùi lại, giả lập đã chờ một quãng."""
        self.db.execute(
            text("update public.task_nodes"
                 " set paused_at = paused_at - make_interval(secs => :s) where id = :i"),
            {"s": seconds, "i": self.task_node_id},
        )
