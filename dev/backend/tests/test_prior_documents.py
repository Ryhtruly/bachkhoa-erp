"""Tủ hồ sơ — giấy các bước đã qua, và ai được mở nó.

Tủ này chứa sổ đỏ, CCCD, bản vẽ ranh giới. Hai thứ được canh:

* **Không có rác.** Chỉ giấy chính thức của bước ĐÃ NGHIỆM THU. Bản nháp, tệp bị
  trả của vòng sửa trước, bản đã bị thay — không hiện. Người đọc không phải tự
  đoán đâu là bản dùng được.
* **Không có người ngoài.** Người của công trình khác mở là 403. Nhưng người
  trong nhóm — kể cả người vừa nhận làm hộ — phải xem được TOÀN BỘ, vì họ cần nó
  để làm việc.
"""

import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import build_test_context, create_test_user, get_missing_documents


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class PriorDocumentsTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
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
        context = build_test_context(self.db, item_count=2)
        self.contract_id = context["contract_id"]
        self.service_lines = [item["id"] for item in context["hang_muc"]]
        self.user_id = create_test_user(self.db)

        self.instance_id = self._instance(0)
        self.employee_id = self._employee("Người trong nhóm")
        self.outsider_id = self._employee("Người công trình khác")

        # K02 đã nghiệm thu xong, K04 đang làm — mở tủ từ K04.
        self.done_node = self._node("K02", status="accepted", employee_id=self.employee_id)
        self.current_node = self._node("K04", status="in_progress", employee_id=self.employee_id)

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── dựng bối cảnh ──

    def _employee(self, name):
        employee_id = _id("E")
        self.db.execute(
            text("insert into public.employees (id, full_name, is_active)"
                 " values (:id, :n, true)"),
            {"id": employee_id, "n": name},
        )
        return employee_id

    def _instance(self, line):
        instance_id = _id("WI")
        self.db.execute(
            text("insert into public.workflow_instances (id, service_line_id, status)"
                 " values (:id, :sl, 'running')"),
            {"id": instance_id, "sl": self.service_lines[line]},
        )
        self.revision_id = _id("REV")
        self.db.execute(
            text("insert into public.workflow_instance_revisions"
                 " (id, workflow_instance_id, revision_no, graph)"
                 " values (:id, :wi, 1, cast('{\"nodes\": {}}' as jsonb))"),
            {"id": self.revision_id, "wi": instance_id},
        )
        return instance_id

    def _node(self, node_code, *, status, employee_id=None, instance_id=None):
        self.db.execute(
            text("insert into public.workflow_nodes (code, name) values (:c, :n)"
                 " on conflict (code) do nothing"),
            {"c": node_code, "n": f"Bước {node_code}"},
        )
        node_id = _id("TN")
        self.db.execute(
            text("""
                insert into public.task_nodes
                    (id, workflow_instance_id, defined_by_revision_id, node_key,
                     node_code, status, accepted_at, completed_at)
                -- Trạng thái 'accepted' có ràng buộc phải kèm mốc nghiệm thu.
                values (:id, :wi, :rev, :key, :code, :status,
                        case when :status in ('accepted','completed') then now() end,
                        case when :status in ('accepted','completed') then now() end)
            """),
            {"id": node_id, "wi": instance_id or self.instance_id,
             "rev": self.revision_id, "key": node_code.lower(),
             "code": node_code, "status": status},
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

    def _paper(self, task_node_id, *, name, review_status="approved",
               doc_status="DANG_DUNG", minutes_ago=0, slot_id=None):
        """Một tờ giấy đầu ra của một bước."""
        result_id = _id("CR")
        self.db.execute(
            text("""
                insert into public.task_node_checklist_results
                    (id, task_node_id, checklist_key, checklist_name, is_required,
                     status, contract_id, completed_at)
                -- Trạng thái 'approved' có ràng buộc phải kèm mốc hoàn thành.
                values (:id, :n, :key, 'Bộ giấy đầu ra', true, 'approved', :c, now())
            """),
            {"id": result_id, "n": task_node_id, "key": _id("k"), "c": self.contract_id},
        )
        if slot_id is None:
            slot_id = _id("S")
            self.db.execute(
                text("""
                    insert into public.dossier_document_slots
                        (id, scope, contract_id, service_line_id, name, source)
                    values (:id, 'SERVICE_LINE', :c, :sl, :n, 'CONG_TY')
                """),
                {"id": slot_id, "c": self.contract_id, "sl": self.service_lines[0], "n": name},
            )
        document_id = _id("DOC")
        self.db.execute(
            text("""
                insert into public.dossier_documents
                    (id, contract_id, service_line_id, stage, object_key, file_name,
                     scope, slot_id, doc_status, uploaded_at)
                values (:id, :c, :sl, 'do-hien-truong', :key, :fn, 'SERVICE_LINE',
                        :slot, :ds, clock_timestamp() - make_interval(mins => :ago))
            """),
            {"id": document_id, "c": self.contract_id, "sl": self.service_lines[0],
             "key": f"contracts/{self.contract_id}/{document_id}", "fn": f"{name}.pdf",
             "slot": slot_id, "ds": doc_status, "ago": minutes_ago},
        )
        self.db.execute(
            text("""
                insert into public.checklist_result_document_links
                    (contract_id, checklist_result_id, document_id, review_status,
                     reviewed_by, reviewed_at, rejection_reason)
                values (:c, :cr, :d, :rs, :by, :at, :reason)
            """),
            {"c": self.contract_id, "cr": result_id, "d": document_id,
             "rs": review_status,
             "by": self.user_id if review_status != "pending_review" else None,
             "at": "now()" and (None if review_status == "pending_review" else "2026-09-01"),
             "reason": "Ảnh mờ không đọc được" if review_status == "rejected" else None},
        )
        return slot_id, document_id

    def _read(self, task_node_id=None):
        return self.wr.prior_step_documents(
            self.db, task_node_id=task_node_id or self.current_node
        )

    def _names(self):
        return [doc["name"] for group in self._read() for doc in group["documents"]]

    # ── nội dung tủ ──

    def test_it_shows_official_papers_of_finished_steps_grouped_by_step(self):
        self._paper(self.done_node, name="Sơ đồ hiện trạng vị trí")

        groups = self._read()

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["node_code"], "K02")
        self.assertEqual(groups[0]["documents"][0]["name"], "Sơ đồ hiện trạng vị trí")

    def test_it_never_hands_out_a_ready_to_open_link(self):
        self._paper(self.done_node, name="Sơ đồ hiện trạng vị trí")

        doc = self._read()[0]["documents"][0]

        # Ký sẵn vài chục link cho một thao tác mà người ta thường chỉ mở một tờ
        # là vài chục lượt gọi storage lãng phí. Bấm tờ nào mới xin link tờ đó.
        self.assertNotIn("url", doc)
        self.assertNotIn("object_key", doc)
        self.assertEqual(set(doc), {"document_id", "name", "uploaded_at"})

    def test_a_step_still_being_worked_on_is_not_in_the_cabinet(self):
        unfinished = self._node("K03", status="in_progress", employee_id=self.employee_id)
        self._paper(unfinished, name="Bản vẽ đang làm dở")

        # Chưa nghiệm thu thì chưa phải giấy chính thức.
        self.assertNotIn("Bản vẽ đang làm dở", self._names())

    def test_a_rejected_file_from_an_earlier_round_is_not_in_the_cabinet(self):
        self._paper(self.done_node, name="Bản vẽ bị trả", review_status="rejected")

        self.assertNotIn("Bản vẽ bị trả", self._names())

    def test_a_superseded_file_is_not_in_the_cabinet(self):
        self._paper(self.done_node, name="Bản cũ", doc_status="DA_GO")

        self.assertNotIn("Bản cũ", self._names())

    def test_only_the_current_file_of_each_slot_shows(self):
        slot_id, _ = self._paper(self.done_node, name="Sơ đồ hiện trạng",
                                 minutes_ago=10)
        self._paper(self.done_node, name="Sơ đồ hiện trạng", slot_id=slot_id)

        # Cùng một ô giấy nộp lại hai lần thì tủ chỉ bày bản đang dùng, không bày
        # lịch sử — người đọc không phải đoán bản nào mới.
        self.assertEqual(len(self._read()[0]["documents"]), 1)

    def test_steps_after_this_one_are_not_shown(self):
        later = self._node("K07", status="accepted", employee_id=self.employee_id)
        self._paper(later, name="Giấy lưu trữ K07")

        # Tủ là "các bước TRƯỚC đã nộp ra gì", không phải toàn bộ hồ sơ.
        self.assertNotIn("Giấy lưu trữ K07", self._names())

    def test_the_first_step_of_the_chain_gets_an_empty_cabinet(self):
        # Không có bước nào trước — giao diện phải nói rõ, không mở drawer rỗng
        # không lời.
        self.assertEqual(self._read(task_node_id=self.done_node), [])

    def test_papers_of_another_service_line_do_not_leak_in(self):
        other_instance = self._instance(1)
        other_node = self._node("K02", status="accepted", instance_id=other_instance,
                                employee_id=self.employee_id)
        self._paper(other_node, name="Giấy của thửa khác")

        # dossier_documents gắn theo HỢP ĐỒNG, mà một hợp đồng có nhiều thửa.
        # Không lọc theo Hạng mục là tủ của thửa này hiện giấy của thửa kia.
        self.assertNotIn("Giấy của thửa khác", self._names())

    # ── phân quyền ──

    def _is_member(self, employee_id):
        return self.wr.is_workflow_instance_member(
            self.db, workflow_instance_id=self.instance_id, employee_id=employee_id
        )

    def test_someone_assigned_to_any_step_of_the_item_may_read_it(self):
        self.assertTrue(self._is_member(self.employee_id))

    def test_someone_from_another_project_may_not(self):
        self.assertFalse(self._is_member(self.outsider_id))

    def test_a_helper_who_took_over_a_step_may_read_it(self):
        helper = self._employee("Người nhận làm hộ")
        # claim_node_help chèn một dòng phân công THẬT cho người nhận hộ — nên họ
        # lọt vào phép quét mà không cần đường tra riêng. B nhận làm hộ K03 phải
        # xem được toạ độ K02 người khác đo, chặn nhầm là chặn đúng người đang giúp.
        # Đúng thứ tự của claim_node_help: nhả suất cũ TRƯỚC rồi mới gán suất mới
        # — một bước chỉ được một vai MAIN đang hoạt động.
        self.db.execute(
            text("update public.task_node_assignments set assignment_status='replaced'"
                 " where task_node_id = :n"),
            {"n": self.current_node},
        )
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, assignment_status, notes)
                values (:n, :e, 'MAIN', 'assigned', 'Nhận làm hộ từ Bể việc')
            """),
            {"n": self.current_node, "e": helper},
        )

        self.assertTrue(self._is_member(helper))

    def test_someone_replaced_off_the_item_may_no_longer_read_it(self):
        former = self._employee("Người đã nhường bước")
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, assignment_status)
                values (:n, :e, 'MAIN', 'replaced')
            """),
            {"n": self.current_node, "e": former},
        )

        self.assertFalse(self._is_member(former))

    def test_no_employee_record_is_not_a_member(self):
        # Giám đốc là tài khoản admin, không có dòng employees — họ đi đường quyền
        # contract:read, không đi đường này. Trả False chứ không nổ.
        self.assertFalse(self._is_member(None))
