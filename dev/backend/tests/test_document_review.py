"""Duyệt TỪNG TỜ giấy — chạy trên DB thật, tự dựng dữ liệu rồi rollback.

Trước đây Giám đốc chỉ quyết được một lần cho cả bước. Duyệt gộp nghĩa là ký vào
một tập giấy mà không đọc từng tờ — đúng thứ luật "đủ 100% giấy mới chốt khoán"
sinh ra để chặn.

Điều dễ sai nhất và được canh kỹ nhất ở đây: **còn một tờ chưa ai đọc thì không
được đóng bước**. Đóng sớm là chốt hồ sơ với giấy chưa duyệt, và tiền khoán chốt
theo.
"""

import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import dung_boi_canh, nguoi_dung, thieu_bang


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class DocumentReviewTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = thieu_bang(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))
        if not self.db.execute(text("""
            select 1 from information_schema.columns
            where table_schema='public' and table_name='checklist_result_document_links'
              and column_name='review_status'
        """)).first():
            self.db.close()
            self.skipTest("Migration B chưa lên trên DB này")

        from src.contracts import workflow_runtime

        self.wr = workflow_runtime
        context = dung_boi_canh(self.db, so_hang_muc=1)
        self.contract_id = context["contract_id"]
        self.service_line_id = context["hang_muc"][0]["id"]
        self.user_id = nguoi_dung(self.db)
        self.task_node_id = self._node()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── dựng bối cảnh ──

    def _node(self, status="submitted"):
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
                values (:id, :wi, :rev, 'k03', 'K03', :status)
            """),
            {"id": node_id, "wi": instance_id, "rev": revision_id, "status": status},
        )
        return node_id

    def _checklist(self, name="Bản vẽ kỹ thuật", *, is_required=True):
        result_id = _id("CR")
        self.db.execute(
            text("""
                insert into public.task_node_checklist_results
                    (id, task_node_id, checklist_key, checklist_name, is_required,
                     status, contract_id)
                values (:id, :n, :key, :name, :req, 'pending_approval', :c)
            """),
            {"id": result_id, "n": self.task_node_id, "key": _id("k"),
             "name": name, "req": is_required, "c": self.contract_id},
        )
        return result_id

    def _document(self, checklist_result_id, file_name="ban-ve.pdf"):
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
            {"c": self.contract_id, "cr": checklist_result_id, "d": document_id},
        )
        return document_id

    def _review(self, checklist_result_id, document_id, decision, reason=None):
        return self.wr.review_node_document(
            self.db,
            checklist_result_id=checklist_result_id,
            document_id=document_id,
            decision=decision,
            reason=reason,
            actor_id=self.user_id,
        )

    def _link_status(self, document_id):
        return self.db.execute(
            text("select review_status, rejection_reason, reviewed_by"
                 " from public.checklist_result_document_links where document_id = :d"),
            {"d": document_id},
        ).mappings().one()

    # ── test ──

    def test_attaching_a_document_leaves_it_waiting_for_review(self):
        checklist_result_id = self._checklist()
        document_id = self._document(checklist_result_id)

        # Gán tệp KHÔNG phải là được duyệt. Mặc định 'approved' là mọi tờ tự duyệt
        # chính nó và cả mục này thành vô nghĩa.
        self.assertEqual(self._link_status(document_id)["review_status"], "pending_review")

    def test_approving_records_who_decided(self):
        checklist_result_id = self._checklist()
        document_id = self._document(checklist_result_id)

        self._review(checklist_result_id, document_id, "approved")

        row = self._link_status(document_id)
        self.assertEqual(row["review_status"], "approved")
        self.assertEqual(row["reviewed_by"], self.user_id)

    def test_rejecting_without_a_reason_is_refused(self):
        checklist_result_id = self._checklist()
        document_id = self._document(checklist_result_id)

        # Trả bài mà không nói sai chỗ nào là bắt nhân viên đoán.
        with self.assertRaises(Exception) as caught:
            self._review(checklist_result_id, document_id, "rejected")
        self.assertIn("lý do", str(caught.exception))
        self.assertEqual(self._link_status(document_id)["review_status"], "pending_review")

    def test_rejecting_with_a_reason_keeps_the_reason_on_the_row(self):
        checklist_result_id = self._checklist()
        document_id = self._document(checklist_result_id)

        self._review(checklist_result_id, document_id, "rejected",
                     "Thiếu tọa độ mốc ranh số 4")

        row = self._link_status(document_id)
        self.assertEqual(row["review_status"], "rejected")
        self.assertEqual(row["rejection_reason"], "Thiếu tọa độ mốc ranh số 4")

    def test_a_node_with_one_unreviewed_sheet_is_not_ready_to_close(self):
        checklist_result_id = self._checklist()
        first = self._document(checklist_result_id, "to-1.pdf")
        self._document(checklist_result_id, "to-2.pdf")

        result = self._review(checklist_result_id, first, "approved")

        # Đây là chốt chặn quan trọng nhất của cả mục: 1/2 tờ đã duyệt KHÔNG phải
        # là đủ điều kiện đóng bước.
        self.assertFalse(result["all_approved"])
        self.assertEqual(result["summary"]["pending_count"], 1)

    def test_a_node_is_ready_only_when_every_sheet_is_approved(self):
        checklist_result_id = self._checklist()
        first = self._document(checklist_result_id, "to-1.pdf")
        second = self._document(checklist_result_id, "to-2.pdf")

        self._review(checklist_result_id, first, "approved")
        result = self._review(checklist_result_id, second, "approved")

        self.assertTrue(result["all_approved"])

    def test_one_rejected_sheet_blocks_the_node_even_if_the_rest_passed(self):
        checklist_result_id = self._checklist()
        first = self._document(checklist_result_id, "to-1.pdf")
        second = self._document(checklist_result_id, "to-2.pdf")

        self._review(checklist_result_id, first, "approved")
        result = self._review(checklist_result_id, second, "rejected", "Ảnh mờ không đọc được")

        self.assertFalse(result["all_approved"])
        self.assertEqual(result["summary"]["rejected_count"], 1)
        self.assertEqual(
            result["summary"]["rejected_items"][0]["reason"], "Ảnh mờ không đọc được"
        )

    def test_approved_sheets_stay_approved_when_a_sibling_is_rejected(self):
        checklist_result_id = self._checklist()
        first = self._document(checklist_result_id, "to-1.pdf")
        second = self._document(checklist_result_id, "to-2.pdf")

        self._review(checklist_result_id, first, "approved")
        self._review(checklist_result_id, second, "rejected", "Ảnh mờ không đọc được")

        # Nhân viên chỉ phải làm lại đúng tờ bị trả. Hạ cả bộ về chờ duyệt là bắt
        # họ nộp lại những tờ đã đạt.
        self.assertEqual(self._link_status(first)["review_status"], "approved")

    def test_sheets_on_optional_checklist_items_do_not_hold_the_node(self):
        required = self._checklist("Bản vẽ kỹ thuật", is_required=True)
        optional = self._checklist("Ảnh tham khảo", is_required=False)
        approved_doc = self._document(required, "ban-ve.pdf")
        self._document(optional, "anh-tham-khao.jpg")

        result = self._review(required, approved_doc, "approved")

        # Tệp tham khảo gán thêm vào mục không bắt buộc không được phép giữ cả
        # bước lại.
        self.assertTrue(result["all_approved"])

    def test_a_document_not_linked_to_that_checklist_is_refused(self):
        checklist_result_id = self._checklist()
        other = self._checklist("Mục khác")
        document_id = self._document(other)

        with self.assertRaises(Exception):
            self._review(checklist_result_id, document_id, "approved")

    def test_reviewing_is_refused_while_the_node_is_still_being_worked_on(self):
        checklist_result_id = self._checklist()
        document_id = self._document(checklist_result_id)
        # Hạ trạng thái node sẵn có chứ không dựng node thứ hai: mỗi Hạng mục chỉ
        # được MỘT workflow_instance (khoá duy nhất), nên node thứ hai không dựng
        # được trong cùng bối cảnh.
        self.db.execute(
            text("update public.task_nodes set status='in_progress' where id=:i"),
            {"i": self.task_node_id},
        )

        # Duyệt giấy của bước nhân viên còn đang làm là chấm một bài chưa nộp.
        with self.assertRaises(Exception) as caught:
            self._review(checklist_result_id, document_id, "approved")
        self.assertIn("chờ nghiệm thu", str(caught.exception))

    def test_a_wrong_decision_word_is_refused(self):
        checklist_result_id = self._checklist()
        document_id = self._document(checklist_result_id)

        with self.assertRaises(Exception):
            self._review(checklist_result_id, document_id, "maybe")

    def test_a_mistaken_verdict_can_be_corrected(self):
        checklist_result_id = self._checklist()
        document_id = self._document(checklist_result_id)

        self._review(checklist_result_id, document_id, "rejected", "Bấm nhầm tờ này")
        self._review(checklist_result_id, document_id, "approved")

        # Bấm nhầm là chuyện có thật. Khoá cứng phán quyết đầu tiên là buộc phải
        # trả cả bước về sửa chỉ để gỡ một cú bấm nhầm.
        row = self._link_status(document_id)
        self.assertEqual(row["review_status"], "approved")
