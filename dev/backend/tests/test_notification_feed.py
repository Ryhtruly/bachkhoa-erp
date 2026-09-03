"""Feed thông báo cho nhân viên — chạy trên DB thật, rollback ở tearDown.

Chuông cũ dựng bằng truy vấn SUY RA nên chỉ thấy việc ĐANG CẦN LÀM. Sự kiện ĐÃ
XẢY RA thì suy không ra: "hồ sơ của bạn vừa được duyệt đạt" biến mất ngay khi
bước đi tiếp, và nhân viên không bao giờ thấy nó.

Điều được canh kỹ nhất: **lý do bị trả phải nằm ngay câu đầu**. Bắt mở ra mới
thấy là bắt nhân viên đi tìm đúng thứ mình cần sửa.
"""

import json
import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import dung_boi_canh, nguoi_dung, thieu_bang


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class NotificationFeedTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = thieu_bang(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))
        if not self.db.execute(
            text("select to_regclass('public.notification_reads')")
        ).scalar():
            self.db.close()
            self.skipTest("Migration C3 chưa lên trên DB này")

        from src.routes import routes_notifications

        self.feed = routes_notifications.employee_event_feed

        context = dung_boi_canh(self.db, so_hang_muc=1)
        self.service_line_id = context["hang_muc"][0]["id"]
        self.user_id = nguoi_dung(self.db)
        self.other_user_id = self._user()
        self.employee_id = self._employee()
        self.task_node_id = self._node()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── dựng bối cảnh ──

    def _user(self):
        user_id = _id("U")
        self.db.execute(
            text("insert into public.users (id, username, password_hash, is_active)"
                 " values (:id, :u, 'x', true)"),
            {"id": user_id, "u": f"gd-{user_id[:8]}"},
        )
        return user_id

    def _employee(self):
        employee_id = _id("E")
        self.db.execute(
            text("insert into public.employees (id, user_id, full_name, is_active)"
                 " values (:id, :u, 'Nhân viên thử', true)"),
            {"id": employee_id, "u": self.user_id},
        )
        return employee_id

    def _node(self):
        instance_id = _id("WI")
        self.db.execute(
            text("insert into public.workflow_instances (id, service_line_id, status)"
                 " values (:id, :sl, 'running')"),
            {"id": instance_id, "sl": self.service_line_id},
        )
        revision_id = _id("REV")
        self.db.execute(
            text("insert into public.workflow_instance_revisions"
                 " (id, workflow_instance_id, revision_no, graph)"
                 " values (:id, :wi, 1, cast('{\"nodes\": {}}' as jsonb))"),
            {"id": revision_id, "wi": instance_id},
        )
        self.db.execute(
            text("insert into public.workflow_nodes (code, name)"
                 " values ('K03', 'Chuẩn hoá tài liệu kỹ thuật') on conflict (code) do nothing"),
        )
        node_id = _id("TN")
        self.db.execute(
            text("""
                insert into public.task_nodes
                    (id, workflow_instance_id, defined_by_revision_id, node_key, node_code, status)
                values (:id, :wi, :rev, 'k03', 'K03', 'submitted')
            """),
            {"id": node_id, "wi": instance_id, "rev": revision_id},
        )
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, assignment_status)
                values (:n, :e, 'MAIN', 'accepted')
            """),
            {"n": node_id, "e": self.employee_id},
        )
        return node_id

    def _event(self, event_type, payload=None, *, actor=None):
        event_id = _id("EV")
        self.db.execute(
            text("""
                insert into public.task_node_events
                    (id, task_node_id, event_type, from_status, to_status,
                     actor_user_id, payload)
                values (:id, :n, :t, 'submitted', 'submitted', :a, cast(:p as jsonb))
            """),
            {"id": event_id, "n": self.task_node_id, "t": event_type,
             "a": actor, "p": json.dumps(payload or {}, ensure_ascii=False)},
        )
        return event_id

    def _read(self):
        return self.feed(self.db, user_id=self.user_id, employee_id=self.employee_id)

    # ── test ──

    def test_a_rejection_puts_the_reason_in_the_first_line(self):
        self._event("NODE_REVIEW_COMPLETED", {
            "summary": {"total": 3, "approvedCount": 1, "rejectedCount": 2, "pendingCount": 0},
            "rejectedItems": [
                {"documentName": "Sơ đồ hiện trạng", "reason": "Thiếu tọa độ mốc ranh số 4"},
                {"documentName": "Bản trích đo", "reason": "Ảnh mờ không đọc được"},
            ],
        }, actor=self.other_user_id)

        label = self._read()[0]["label"]

        self.assertIn("cần sửa 2 tờ", label)
        # Lý do phải nằm ngay đây. Bắt mở ra mới thấy là bắt nhân viên đi tìm.
        self.assertIn("Thiếu tọa độ mốc ranh số 4", label)

    def test_passing_the_whole_node_is_reported_too(self):
        self._event("NODE_REVIEW_COMPLETED", {
            "summary": {"total": 3, "approvedCount": 3, "rejectedCount": 0, "pendingCount": 0},
            "rejectedItems": [],
        }, actor=self.other_user_id)

        # Duyệt đạt cũng phải báo: bước đi tiếp là mất dấu, nhân viên không biết
        # phần việc mình đã được chốt.
        self.assertIn("duyệt đạt toàn bộ", self._read()[0]["label"])

    def test_a_half_reviewed_batch_says_how_far_it_got(self):
        self._event("NODE_REVIEW_COMPLETED", {
            "summary": {"total": 5, "approvedCount": 2, "rejectedCount": 0, "pendingCount": 3},
            "rejectedItems": [],
        }, actor=self.other_user_id)

        self.assertIn("2/5", self._read()[0]["label"])

    def test_an_expired_help_request_tells_the_sender_it_came_back(self):
        self._event("HELP_EXPIRED", {"reason": "Quá 4 giờ không có người nhận"})

        # Không báo thì người gửi tưởng đã đẩy được việc đi, và SLA vẫn chạy cho họ.
        self.assertIn("trở lại với bạn", self._read()[0]["label"])

    def test_you_are_not_notified_about_your_own_action(self):
        self._event("NODE_PAUSED", {"note": "Chờ thông báo thuế"}, actor=self.user_id)

        # Chính mình vừa bấm tạm dừng thì không cần ai báo lại.
        self.assertEqual(self._read(), [])

    def test_events_on_other_peoples_nodes_do_not_leak_in(self):
        other_employee = _id("E")
        self.db.execute(
            text("insert into public.employees (id, full_name, is_active)"
                 " values (:id, 'Người khác', true)"),
            {"id": other_employee},
        )
        self._event("NODE_REVIEW_COMPLETED", {
            "summary": {"total": 1, "approvedCount": 1, "rejectedCount": 0, "pendingCount": 0},
        }, actor=self.other_user_id)

        self.assertEqual(
            self.feed(self.db, user_id=self.other_user_id, employee_id=other_employee), []
        )

    def test_reading_an_event_removes_it_from_the_feed(self):
        event_id = self._event("HELP_CLAIMED", actor=self.other_user_id)
        self.assertEqual(len(self._read()), 1)

        self.db.execute(
            text("insert into public.notification_reads (user_id, event_id)"
                 " values (:u, :e)"),
            {"u": self.user_id, "e": event_id},
        )

        self.assertEqual(self._read(), [])

    def test_marking_the_same_event_twice_is_not_an_error(self):
        event_id = self._event("HELP_CLAIMED", actor=self.other_user_id)
        for _ in range(2):
            self.db.execute(
                text("insert into public.notification_reads (user_id, event_id)"
                     " values (:u, :e) on conflict (user_id, event_id) do nothing"),
                {"u": self.user_id, "e": event_id},
            )

        # Hai tab cùng gửi, hoặc bấm hai lần — đọc rồi đọc lại không phải lỗi.
        self.assertEqual(
            self.db.execute(
                text("select count(*) from public.notification_reads where event_id = :e"),
                {"e": event_id},
            ).scalar(),
            1,
        )

    def test_reading_it_for_one_person_does_not_silence_it_for_another(self):
        event_id = self._event("NODE_REVIEW_COMPLETED", {
            "summary": {"total": 1, "approvedCount": 1, "rejectedCount": 0, "pendingCount": 0},
        }, actor=self.other_user_id)
        second_user = self._user()
        second_employee = _id("E")
        self.db.execute(
            text("insert into public.employees (id, user_id, full_name, is_active)"
                 " values (:id, :u, 'Người cùng bước', true)"),
            {"id": second_employee, "u": second_user},
        )
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, assignment_status)
                values (:n, :e, 'ASSISTANT', 'accepted')
            """),
            {"n": self.task_node_id, "e": second_employee},
        )
        self.db.execute(
            text("insert into public.notification_reads (user_id, event_id) values (:u, :e)"),
            {"u": self.user_id, "e": event_id},
        )

        # Đây là lý do dấu đã-đọc nằm ở bảng riêng chứ không phải một cột boolean
        # trên chính sự kiện: người đầu tiên đọc không được tắt chuông của người kia.
        self.assertEqual(self._read(), [])
        self.assertEqual(
            len(self.feed(self.db, user_id=second_user, employee_id=second_employee)), 1
        )

    def test_noise_event_types_stay_out_of_the_bell(self):
        self._event("NODE_MATERIALIZED", actor=self.other_user_id)
        self._event("TASK_CLAIMED", actor=self.other_user_id)

        # Bơm mọi loại sự kiện vào chuông là biến nó thành nhật ký hệ thống, và
        # tin quan trọng chìm mất.
        self.assertEqual(self._read(), [])

    def test_no_employee_record_means_no_feed_instead_of_an_error(self):
        # Giám đốc là tài khoản admin, không có dòng employees. Trả rỗng chứ
        # không ném lỗi — nếu không cả chuông của họ vỡ.
        self.assertEqual(self.feed(self.db, user_id=self.user_id, employee_id=None), [])
