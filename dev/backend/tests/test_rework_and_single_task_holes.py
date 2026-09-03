"""Bốn lỗ hổng đã ship, nay vá — chạy trên DB thật, rollback ở tearDown.

Cả bốn đều chưa nổ trên live vì dữ liệu còn trống. Chúng lộ ra khi soi lại luồng
vận hành thật, không phải khi đọc code.

* **A6** — nộp lại tệp sửa sinh dòng nối MỚI, dòng cũ vẫn mang `rejected`. Đếm cả
  hai là `rejected_count` vĩnh viễn ≥ 1 và bước **không bao giờ** nghiệm thu đạt
  được, dù tệp mới đã được duyệt.
* **A6b** — "bản mới nhất thắng" cho phép gán đè lên tờ Giám đốc ĐÃ DUYỆT, tức
  thay tệp sau lưng người duyệt.
* **A7** — bước tạm dừng giữ nguyên `in_progress` nên chặn hết mọi việc khác. Chờ
  cơ quan ba tuần là nhân viên ngồi không ba tuần.
* **A7b** — vá A7 xong thì `resume_node` thành cửa sau: tạm dừng, bắt đầu việc
  khác, rồi Tiếp tục → hai bước cùng chạy.
"""

import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import dung_boi_canh, nguoi_dung, thieu_bang


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class _Base(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = thieu_bang(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))
        for table, column in (
            ("checklist_result_document_links", "review_status"),
            ("task_nodes", "pause_reason_type"),
        ):
            if not self.db.execute(text("""
                select 1 from information_schema.columns
                where table_schema='public' and table_name=:t and column_name=:c
            """), {"t": table, "c": column}).first():
                self.db.close()
                self.skipTest(f"Thiếu {table}.{column} — migration chưa lên")

        from src.contracts import workflow_runtime

        self.wr = workflow_runtime
        self.wr.refresh_node_config(self.db, force=True)
        # Ba Hạng mục: mỗi Hạng mục chỉ được MỘT workflow_instance, mà test
        # đơn nhiệm cần tới ba bước nằm ở ba Hạng mục khác nhau.
        context = dung_boi_canh(self.db, so_hang_muc=3)
        self.contract_id = context["contract_id"]
        self.service_lines = [item["id"] for item in context["hang_muc"]]
        self.user_id = nguoi_dung(self.db)

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.wr.clear_node_config()

    # ── dựng bối cảnh ──

    def _employee(self, name="Nhân viên thử"):
        employee_id = _id("E")
        self.db.execute(
            text("insert into public.employees (id, full_name, is_active)"
                 " values (:id, :n, true)"),
            {"id": employee_id, "n": name},
        )
        return employee_id

    def _node(self, node_code, *, line=0, status="submitted", employee_id=None):
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
                values (:id, :wi, :rev, :key, :code, :status, now())
            """),
            {"id": node_id, "wi": instance_id, "rev": revision_id,
             "key": node_code.lower(), "code": node_code, "status": status},
        )
        if employee_id:
            self.db.execute(
                text("""
                    insert into public.task_node_assignments
                        (task_node_id, employee_id, role_code, assignment_status)
                    values (:n, :e, 'MAIN', 'accepted')
                """),
                {"n": node_id, "e": employee_id},
            )
        return node_id

    def _checklist(self, task_node_id, name="Bản vẽ kỹ thuật"):
        result_id = _id("CR")
        self.db.execute(
            text("""
                insert into public.task_node_checklist_results
                    (id, task_node_id, checklist_key, checklist_name, is_required,
                     status, contract_id)
                values (:id, :n, :key, :name, true, 'pending_approval', :c)
            """),
            {"id": result_id, "n": task_node_id, "key": _id("k"),
             "name": name, "c": self.contract_id},
        )
        return result_id

    def _slot(self, name="Sơ đồ hiện trạng vị trí", line=0):
        slot_id = _id("S")
        self.db.execute(
            text("""
                insert into public.dossier_document_slots
                    (id, scope, contract_id, service_line_id, name, source)
                values (:id, 'SERVICE_LINE', :c, :sl, :n, 'CONG_TY')
            """),
            {"id": slot_id, "c": self.contract_id, "sl": self.service_lines[line], "n": name},
        )
        return slot_id

    def _document(self, checklist_result_id, *, slot_id, file_name, line=0,
                  minutes_ago=0):
        """Một tệp gắn vào một ô giấy, kèm dòng nối tới mục checklist.

        ``minutes_ago`` phải đặt rõ khi test có hai bản cùng ô giấy: ngoài đời hai
        lần nộp là hai request, hai giao dịch, nên ``uploaded_at`` khác nhau. Trong
        test thì cùng một giao dịch, mà ``now()`` đứng yên suốt giao dịch — hai bản
        sẽ trùng mốc và "bản mới nhất thắng" không còn nghĩa gì.
        """
        document_id = _id("DOC")
        self.db.execute(
            text("""
                insert into public.dossier_documents
                    (id, contract_id, service_line_id, stage, object_key, file_name,
                     scope, slot_id, uploaded_at)
                values (:id, :c, :sl, 'chuan-hoa-ky-thuat', :key, :fn,
                        'SERVICE_LINE', :slot,
                        clock_timestamp() - make_interval(mins => :ago))
            """),
            {"id": document_id, "c": self.contract_id, "sl": self.service_lines[line],
             "key": f"contracts/{self.contract_id}/{document_id}", "fn": file_name,
             "slot": slot_id, "ago": minutes_ago},
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
            self.db, checklist_result_id=checklist_result_id, document_id=document_id,
            decision=decision, reason=reason, actor_id=self.user_id,
        )


class ReworkCycleClosesTests(_Base):
    """A6 — vòng sửa bài phải đóng lại được."""

    def setUp(self):
        super().setUp()
        self.task_node_id = self._node("K03")
        self.checklist_result_id = self._checklist(self.task_node_id)
        self.slot_id = self._slot()

    def _summary(self):
        return self.wr.node_document_review_summary(self.db, task_node_id=self.task_node_id)

    def test_a_replaced_file_lets_the_node_pass_once_the_new_one_is_approved(self):
        first = self._document(self.checklist_result_id, slot_id=self.slot_id,
                               file_name="ban-ve-mo.pdf", minutes_ago=10)
        self._review(self.checklist_result_id, first, "rejected", "Ảnh mờ không đọc được")

        # Nhân viên nộp lại vào ĐÚNG ô giấy đó.
        second = self._document(self.checklist_result_id, slot_id=self.slot_id,
                                file_name="ban-ve-ro.pdf")
        self._review(self.checklist_result_id, second, "approved")

        summary = self._summary()

        # Trước bản vá: rejected_count = 1 vĩnh viễn, bước không bao giờ đóng được.
        self.assertEqual(summary["rejected_count"], 0)
        self.assertTrue(self.wr.node_documents_all_approved(summary))

    def test_the_superseded_link_stops_being_counted_at_all(self):
        first = self._document(self.checklist_result_id, slot_id=self.slot_id,
                               file_name="ban-ve-mo.pdf", minutes_ago=10)
        self._review(self.checklist_result_id, first, "rejected", "Ảnh mờ không đọc được")
        self._document(self.checklist_result_id, slot_id=self.slot_id,
                       file_name="ban-ve-ro.pdf")

        # Một ô giấy đếm đúng MỘT tờ, không phải một tờ cho mỗi lần nộp lại.
        self.assertEqual(self._summary()["total"], 1)

    def test_two_different_slots_still_count_as_two_sheets(self):
        other_slot = self._slot("Bản trích đo địa chính")
        self._document(self.checklist_result_id, slot_id=self.slot_id, file_name="a.pdf")
        self._document(self.checklist_result_id, slot_id=other_slot, file_name="b.pdf")

        # Gom theo ô giấy, không gom tất cả về một. Nhầm chỗ này là hai loại giấy
        # khác nhau bị đếm thành một, và bước đóng được khi mới nộp một nửa.
        self.assertEqual(self._summary()["total"], 2)

    def test_the_batch_notification_also_ignores_the_replaced_file(self):
        first = self._document(self.checklist_result_id, slot_id=self.slot_id,
                               file_name="ban-ve-mo.pdf", minutes_ago=10)
        self._review(self.checklist_result_id, first, "rejected", "Ảnh mờ không đọc được")
        second = self._document(self.checklist_result_id, slot_id=self.slot_id,
                                file_name="ban-ve-ro.pdf")
        self._review(self.checklist_result_id, second, "approved")

        result = self.wr.flush_node_review_batch(
            self.db, task_node_id=self.task_node_id, actor_id=self.user_id
        )

        # Thông báo phải nói "đạt", không kèm lý do từ chối của tệp đã bị thay.
        self.assertEqual(result["payload"]["summary"]["rejectedCount"], 0)
        self.assertEqual(result["payload"]["rejectedItems"], [])


class ApprovedSheetIsLockedTests(_Base):
    """A6b — tờ đã duyệt không cho gán đè."""

    def setUp(self):
        super().setUp()
        from src.dossiers import documents

        self.documents = documents
        self.task_node_id = self._node("K03")
        self.checklist_result_id = self._checklist(self.task_node_id)
        self.slot_id = self._slot()

    def _spare_document(self, file_name="thay-the.pdf"):
        """Một tệp cùng ô giấy nhưng CHƯA nối vào mục checklist."""
        document_id = _id("DOC")
        self.db.execute(
            text("""
                insert into public.dossier_documents
                    (id, contract_id, service_line_id, stage, object_key, file_name,
                     scope, slot_id)
                values (:id, :c, :sl, 'chuan-hoa-ky-thuat', :key, :fn,
                        'SERVICE_LINE', :slot)
            """),
            {"id": document_id, "c": self.contract_id, "sl": self.service_lines[0],
             "key": f"contracts/{self.contract_id}/{document_id}", "fn": file_name,
             "slot": self.slot_id},
        )
        return document_id

    def test_reusing_another_file_over_an_approved_sheet_is_refused(self):
        approved = self._document(self.checklist_result_id, slot_id=self.slot_id,
                                  file_name="ban-ve-dat.pdf")
        self._review(self.checklist_result_id, approved, "approved")
        replacement = self._spare_document()

        with self.assertRaises(Exception) as caught:
            self.documents.reuse_document_for_checklist(
                self.db, checklist_result_id=self.checklist_result_id,
                document_id=replacement, contract_id=self.contract_id, actor_id=self.user_id,
            )
        self.assertIn("đã được Giám đốc duyệt", str(caught.exception))

    def test_the_approved_verdict_survives_the_refused_attempt(self):
        approved = self._document(self.checklist_result_id, slot_id=self.slot_id,
                                  file_name="ban-ve-dat.pdf")
        self._review(self.checklist_result_id, approved, "approved")
        replacement = self._spare_document()

        # Savepoint chứ không rollback cả phiên: rollback thẳng cuốn theo dữ liệu
        # dựng ở setUp, và phép đếm bên dưới chạy trên bảng rỗng — pass vu vơ.
        savepoint = self.db.begin_nested()
        try:
            self.documents.reuse_document_for_checklist(
                self.db, checklist_result_id=self.checklist_result_id,
                document_id=replacement, contract_id=self.contract_id, actor_id=self.user_id,
            )
        except Exception:
            savepoint.rollback()

        # Không được để lại nửa vời: phán quyết cũ còn nguyên, không sinh dòng mới.
        self.assertEqual(
            self.db.execute(
                text("select count(*) from public.checklist_result_document_links"
                     " where checklist_result_id = :cr"),
                {"cr": self.checklist_result_id},
            ).scalar(),
            1,
        )

    def test_a_rejected_sheet_can_be_replaced(self):
        rejected = self._document(self.checklist_result_id, slot_id=self.slot_id,
                                  file_name="ban-ve-mo.pdf", minutes_ago=10)
        self._review(self.checklist_result_id, rejected, "rejected", "Ảnh mờ không đọc được")
        replacement = self._spare_document()

        # Đây là đường thay thế DUY NHẤT, và nó có ghi vết ai từ chối.
        self.documents.reuse_document_for_checklist(
            self.db, checklist_result_id=self.checklist_result_id,
            document_id=replacement, contract_id=self.contract_id, actor_id=self.user_id,
        )

        self.assertEqual(
            self.db.execute(
                text("select count(*) from public.checklist_result_document_links"
                     " where checklist_result_id = :cr"),
                {"cr": self.checklist_result_id},
            ).scalar(),
            2,
        )

    def test_a_file_for_a_different_slot_is_not_blocked(self):
        approved = self._document(self.checklist_result_id, slot_id=self.slot_id,
                                  file_name="ban-ve-dat.pdf")
        self._review(self.checklist_result_id, approved, "approved")

        other_slot = self._slot("Bản trích đo địa chính")
        document_id = _id("DOC")
        self.db.execute(
            text("""
                insert into public.dossier_documents
                    (id, contract_id, service_line_id, stage, object_key, file_name,
                     scope, slot_id)
                values (:id, :c, :sl, 'chuan-hoa-ky-thuat', :key, 'khac.pdf',
                        'SERVICE_LINE', :slot)
            """),
            {"id": document_id, "c": self.contract_id, "sl": self.service_lines[0],
             "key": f"contracts/{self.contract_id}/{document_id}", "slot": other_slot},
        )

        # Khoá phải hẹp đúng bằng Ô GIẤY. Khoá cả mục checklist là nhân viên không
        # nộp được loại giấy thứ hai chỉ vì loại thứ nhất đã duyệt.
        self.documents.reuse_document_for_checklist(
            self.db, checklist_result_id=self.checklist_result_id,
            document_id=document_id, contract_id=self.contract_id, actor_id=self.user_id,
        )
        self.assertEqual(
            self.db.execute(
                text("select count(*) from public.checklist_result_document_links"
                     " where checklist_result_id = :cr"),
                {"cr": self.checklist_result_id},
            ).scalar(),
            2,
        )


class PausedNodeDoesNotBlockTests(_Base):
    """A7 + A7b — bước nằm chờ không chiếm suất, nhưng Tiếp tục phải gác."""

    def setUp(self):
        super().setUp()
        self.employee_id = self._employee()
        self.paused_node = self._node("K05b", line=0, status="in_progress",
                                      employee_id=self.employee_id)
        self.other_node = self._node("K03", line=1, status="ready",
                                     employee_id=self.employee_id)

    def _pause(self, node_id=None):
        self.db.execute(
            text("""
                update public.task_nodes
                set pause_reason_type = 'AGENCY', paused_at = clock_timestamp(),
                    paused_note = 'Chờ thông báo thuế từ chi cục'
                where id = :i
            """),
            {"i": node_id or self.paused_node},
        )

    def _blocking(self, *, task_node_id=None):
        return self.wr.blocking_in_progress_node(
            self.db, employee_id=self.employee_id, task_node_id=task_node_id
        )

    def test_a_running_node_still_blocks(self):
        # A7 không được nới quá tay: bước đang CHẠY vẫn phải chặn như cũ.
        self.assertIsNotNone(self._blocking())

    def test_a_paused_node_stops_blocking(self):
        self._pause()

        # Chờ cơ quan ba tuần mà vẫn chặn thì nhân viên ngồi không ba tuần —
        # luật đơn nhiệm sinh ra để chặn người làm hai việc, không phải người chờ.
        self.assertIsNone(self._blocking())

    def test_you_can_start_another_node_while_one_waits_on_the_agency(self):
        self._pause()

        result = self.wr.start_task_node(
            self.db, task_node_id=self.other_node,
            employee_id=self.employee_id, actor_id=self.user_id,
        )

        self.assertEqual(
            self.db.execute(
                text("select status from public.task_nodes where id = :i"),
                {"i": self.other_node},
            ).scalar_one(),
            "in_progress",
        )
        self.assertIsNotNone(result)

    def test_resuming_while_another_node_runs_is_blocked(self):
        self._pause()
        self.wr.start_task_node(
            self.db, task_node_id=self.other_node,
            employee_id=self.employee_id, actor_id=self.user_id,
        )

        # Đây là cửa sau mà A7 mở ra. Thiếu chốt này thì A7 là một bước lùi,
        # không phải một bản vá: hai bước cùng chạy.
        with self.assertRaises(Exception) as caught:
            self.wr.resume_node(
                self.db, task_node_id=self.paused_node,
                employee_id=self.employee_id, actor_id=self.user_id,
            )
        self.assertIn("K03", str(caught.exception))

    def test_resuming_works_when_nothing_else_runs(self):
        self._pause()

        result = self.wr.resume_node(
            self.db, task_node_id=self.paused_node,
            employee_id=self.employee_id, actor_id=self.user_id,
        )

        # A7b cũng không được siết quá tay.
        self.assertIsNotNone(result)
        self.assertIsNone(
            self.db.execute(
                text("select pause_reason_type from public.task_nodes where id = :i"),
                {"i": self.paused_node},
            ).scalar()
        )

    def test_the_same_node_code_on_another_contract_is_not_treated_as_itself(self):
        second_k05b = self._node("K05b", line=2, status="in_progress",
                                 employee_id=self.employee_id)

        # Bỏ qua "chính nó" phải so theo ID bước. So theo MÃ bước thì hai K05b ở
        # hai hợp đồng tự miễn trừ lẫn nhau — và dựng một hợp đồng thì không thấy.
        busy = self._blocking(task_node_id=second_k05b)

        self.assertIsNotNone(busy)
        self.assertEqual(busy["task_node_id"], self.paused_node)
