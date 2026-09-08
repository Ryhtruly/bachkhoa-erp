"""Gộp cả đợt duyệt thành MỘT thông báo — chạy trên DB thật, rollback ở tearDown.

Duyệt 10 tờ mà bắn 10 tin là rác: nhân viên lướt qua, và tin quan trọng nhất
("bạn bị trả 2 tờ") chìm giữa tám tin "đã duyệt". Cả đợt phải gom thành một.

Hai thứ được canh kỹ nhất ở đây:

* **Chốt lười.** Không có nó thì sập trình duyệt, đóng tab hay mất mạng là nhân
  viên KHÔNG BAO GIỜ biết mình bị trả bài — hồ sơ nằm chờ vô hạn.
* **Phiên duyệt bị cắt ngang.** Chấm dở, chốt lười đóng Đợt 1, quay lại chấm nốt.
  Không tờ nào được lọt hai đợt, cũng không tờ nào được rơi ra ngoài.
"""

import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import build_test_context, create_test_user, get_missing_documents


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class ReviewBatchTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))
        if not self.db.execute(text("""
            select 1 from information_schema.columns
            where table_schema='public' and table_name='task_nodes'
              and column_name='last_reviewed_at'
        """)).first():
            self.db.close()
            self.skipTest("Migration C1 chưa lên trên DB này")

        from src.contracts import workflow_runtime

        self.wr = workflow_runtime
        context = build_test_context(self.db, item_count=1)
        self.contract_id = context["contract_id"]
        self.service_line_id = context["hang_muc"][0]["id"]
        self.user_id = create_test_user(self.db)
        self.task_node_id = self._node()
        self.checklist_result_id = self._checklist()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── dựng bối cảnh ──

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
            text("insert into public.workflow_nodes (code, name) values ('K03', 'Chuẩn hoá')"
                 " on conflict (code) do nothing"),
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
        return node_id

    def _checklist(self):
        result_id = _id("CR")
        self.db.execute(
            text("""
                insert into public.task_node_checklist_results
                    (id, task_node_id, checklist_key, checklist_name, is_required,
                     status, contract_id)
                values (:id, :n, :key, 'Bản vẽ kỹ thuật', true, 'pending_approval', :c)
            """),
            {"id": result_id, "n": self.task_node_id, "key": _id("k"), "c": self.contract_id},
        )
        return result_id

    def _document(self, file_name):
        document_id = _id("DOC")
        self.db.execute(
            text("""
                insert into public.dossier_documents
                    (id, contract_id, service_line_id, stage, object_key, file_name, scope)
                values (:id, :c, :sl, 'chuan-hoa-ky-thuat', :key, :fn, 'SERVICE_LINE')
            """),
            {"id": document_id, "c": self.contract_id, "sl": self.service_line_id,
             "key": f"contracts/{self.contract_id}/{document_id}", "fn": file_name},
        )
        self.db.execute(
            text("""
                insert into public.checklist_result_document_links
                    (contract_id, checklist_result_id, document_id)
                values (:c, :cr, :d)
            """),
            {"c": self.contract_id, "cr": self.checklist_result_id, "d": document_id},
        )
        return document_id

    def _review(self, document_id, decision, reason=None):
        return self.wr.review_node_document(
            self.db,
            checklist_result_id=self.checklist_result_id,
            document_id=document_id,
            decision=decision,
            reason=reason,
            actor_id=self.user_id,
        )

    def _flush(self):
        return self.wr.flush_node_review_batch(
            self.db, task_node_id=self.task_node_id, actor_id=self.user_id
        )

    def _events(self):
        return [dict(row) for row in self.db.execute(
            text("""
                select id, payload, created_at from public.task_node_events
                where task_node_id = :n and event_type = 'NODE_REVIEW_COMPLETED'
                order by created_at
            """),
            {"n": self.task_node_id},
        ).mappings().all()]

    def _age_the_batch(self, minutes):
        """Đẩy cờ tồn đọng lùi lại, giả lập Giám đốc bỏ đi đã lâu."""
        self.db.execute(
            text("update public.task_nodes"
                 " set last_reviewed_at = now() - make_interval(mins => :m) where id = :i"),
            {"m": minutes, "i": self.task_node_id},
        )

    # ── test ──

    def test_reviewing_many_sheets_sends_nothing_until_the_batch_is_closed(self):
        for name in ("to-1.pdf", "to-2.pdf", "to-3.pdf"):
            self._review(self._document(name), "approved")

        # Ba lượt duyệt, KHÔNG một thông báo nào. Đây là toàn bộ lý do mục này
        # tồn tại.
        self.assertEqual(self._events(), [])

    def test_closing_the_batch_sends_exactly_one_notification(self):
        for name in ("to-1.pdf", "to-2.pdf", "to-3.pdf"):
            self._review(self._document(name), "approved")

        self._flush()

        self.assertEqual(len(self._events()), 1)

    def test_the_notification_counts_correctly_and_lists_every_rejection(self):
        self._review(self._document("to-1.pdf"), "approved")
        self._review(self._document("to-2.pdf"), "approved")
        self._review(self._document("to-3.pdf"), "rejected", "Thiếu tọa độ mốc ranh số 4")
        self._review(self._document("to-4.pdf"), "rejected", "Ảnh mờ không đọc được số")

        result = self._flush()

        self.assertEqual(result["payload"]["summary"]["approvedCount"], 2)
        self.assertEqual(result["payload"]["summary"]["rejectedCount"], 2)
        # Nhân viên phải đọc được TỪNG lý do, không phải một câu chung cho hai tờ.
        reasons = {item["reason"] for item in result["payload"]["rejectedItems"]}
        self.assertEqual(
            reasons, {"Thiếu tọa độ mốc ranh số 4", "Ảnh mờ không đọc được số"}
        )

    def test_closing_twice_still_leaves_one_notification(self):
        self._review(self._document("to-1.pdf"), "approved")

        self._flush()
        second = self._flush()

        # Bấm [Chốt duyệt] hai nhát là chuyện thường. Tin thứ hai là tin trùng.
        self.assertIsNone(second)
        self.assertEqual(len(self._events()), 1)

    def test_closing_with_nothing_reviewed_sends_no_empty_notification(self):
        self._document("to-1.pdf")

        # Mở Drawer, không tick tờ nào, đóng lại. Một tin rỗng còn tệ hơn không tin.
        self.assertIsNone(self._flush())
        self.assertEqual(self._events(), [])

    def test_a_rejection_sends_the_node_back_without_waiting_for_the_rest(self):
        self._review(self._document("to-1.pdf"), "approved")
        self._review(self._document("to-2.pdf"), "rejected", "Ảnh mờ không đọc được")
        self._document("to-3.pdf")   # chưa chấm

        result = self._flush()

        # Biết sớm một tờ hỏng thì sửa sớm, không phải ngồi chờ chấm nốt.
        self.assertEqual(result["payload"]["overallStatus"], "REWORK_REQUIRED")

    def test_a_half_finished_batch_with_no_rejections_keeps_the_node_waiting(self):
        self._review(self._document("to-1.pdf"), "approved")
        self._review(self._document("to-2.pdf"), "approved")
        self._document("to-3.pdf")   # chưa chấm

        result = self._flush()

        # Nhánh dễ sai nhất: TUYỆT ĐỐI không cho sang hoàn tất khi còn tờ chưa ai
        # đọc — sang sớm là đóng bước với giấy chưa duyệt, tiền khoán chốt theo.
        self.assertEqual(result["payload"]["overallStatus"], "PARTIALLY_REVIEWED")
        self.assertEqual(result["payload"]["summary"]["pendingCount"], 1)
        self.assertEqual(
            self.db.execute(
                text("select status from public.task_nodes where id = :i"),
                {"i": self.task_node_id},
            ).scalar_one(),
            "submitted",
        )

    def test_an_interrupted_review_session_splits_into_two_clean_batches(self):
        first = self._document("to-1.pdf")
        second = self._document("to-2.pdf")
        third = self._document("to-3.pdf")

        # Chấm 1 tờ rồi đi.
        self._review(first, "approved")
        self._flush()                      # Đợt 1

        # Quay lại chấm nốt 2 tờ.
        self._review(second, "approved")
        self._review(third, "approved")
        self._flush()                      # Đợt 2

        events = self._events()
        self.assertEqual(len(events), 2)
        # Không tờ nào lọt hai đợt, không tờ nào rơi ra ngoài.
        self.assertEqual(events[0]["payload"]["summary"]["reviewedInBatch"], 1)
        self.assertEqual(events[1]["payload"]["summary"]["reviewedInBatch"], 2)

    def test_a_forgotten_batch_is_closed_by_the_lazy_sweep(self):
        self._review(self._document("to-1.pdf"), "rejected", "Ảnh mờ không đọc được")
        self._age_the_batch(self.wr.REVIEW_BATCH_IDLE_MINUTES + 1)

        flushed = self.wr.flush_stale_review_batches(self.db)

        # Test quan trọng nhất của cả mục: thiếu nó thì sập trình duyệt là nhân
        # viên KHÔNG BAO GIỜ biết mình bị trả bài.
        self.assertIn(self.task_node_id, flushed)
        self.assertEqual(len(self._events()), 1)

    def test_a_batch_still_being_worked_on_is_left_alone(self):
        self._review(self._document("to-1.pdf"), "approved")
        self._age_the_batch(self.wr.REVIEW_BATCH_IDLE_MINUTES - 5)

        flushed = self.wr.flush_stale_review_batches(self.db)

        # Giám đốc vừa chấm xong tờ đầu và đang đọc tờ thứ hai. Chốt lúc này là
        # cắt ngang phiên duyệt còn dở và bắn một tin thiếu.
        self.assertNotIn(self.task_node_id, flushed)
        self.assertEqual(self._events(), [])

    def test_the_pending_flag_is_cleared_after_a_batch_closes(self):
        self._review(self._document("to-1.pdf"), "approved")
        self.assertIsNotNone(self._pending_flag())

        self._flush()

        # Không xoá cờ thì lượt quét sau tìm lại đúng bước này mãi mãi.
        self.assertIsNone(self._pending_flag())

    def test_the_payload_is_built_from_the_database_not_from_the_caller(self):
        self._review(self._document("to-1.pdf"), "rejected", "Lý do thật trong DB")

        result = self._flush()

        # Client chỉ gửi lên "chốt bước này". Nhận nội dung từ client thì nó vừa
        # giả mạo được, vừa sai khi phiên duyệt bị đứt giữa chừng.
        self.assertEqual(result["payload"]["nodeCode"], "K03")
        self.assertEqual(result["payload"]["contractCode"], self.contract_id)
        self.assertEqual(
            result["payload"]["rejectedItems"][0]["reason"], "Lý do thật trong DB"
        )

    def _pending_flag(self):
        return self.db.execute(
            text("select last_reviewed_at from public.task_nodes where id = :i"),
            {"i": self.task_node_id},
        ).scalar()
