"""Senior QA Test Suite: Relay Race Flow, Single-Primary Invariant, Button Interactions & Payroll Accuracy.

Kiểm thử chuyên sâu 4 trụ cột nghiệp vụ:
1. TC-01: Bất biến 1 người chính ở tầng Database Engine (Partial Unique Index chặn mọi race condition).
2. TC-02: Bất biến 1 người chính ở tầng Runtime Claim & Reserve (chặn xung đột nhận việc đồng thời).
3. TC-03: Quy trình Chuyền gậy 7 Node qua toàn bộ các nút bấm và trạng thái (Đo vẽ -> Pháp lý -> Đo vẽ).
4. TC-04: Kiểm toán kỳ lương (Payroll Audit): Đảm bảo thợ Đo vẽ và thợ Pháp lý nhận đúng 100% đơn giá, không lệch 1 xu, không trùng lặp.
5. TC-05: Nhường bước & Làm hộ (Help Request & Claim): Phân công cũ được đánh dấu replaced, thợ mới nhận việc và hưởng lương khoán chuẩn chỉ.
"""

import json
import unittest
import uuid
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.fixtures_document_register import build_test_context, create_test_user, get_missing_documents


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class RelayRacePayrollAndButtonsQATests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal
        from src.contracts import workflow_runtime

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        self.wr = workflow_runtime

        # Đảm bảo bảng danh mục workflow_nodes được cấu hình
        self.db.execute(
            text("""
                insert into public.workflow_nodes
                    (code, name, allowed_departments, default_roles, cluster_code)
                values
                    ('N01', 'Tiếp nhận & Khảo sát', array['SURVEY'], array['MAIN'], 'SURVEY_TECH'),
                    ('N02', 'Đo đạc hiện trường', array['SURVEY'], array['MAIN'], 'SURVEY_TECH'),
                    ('N03', 'Soạn thảo hồ sơ', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('N04', 'Thẩm tra pháp lý', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('N05', 'Nộp & Xử lý hồ sơ', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('N06', 'Cập nhật biến động bản đồ', array['SURVEY'], array['MAIN'], 'SURVEY_TECH'),
                    ('N07', 'Nghiệm thu hoàn tất', array['SURVEY'], array['MAIN'], 'SURVEY_TECH')
                on conflict (code) do update set
                    allowed_departments = excluded.allowed_departments,
                    default_roles = excluded.default_roles,
                    cluster_code = excluded.cluster_code
            """)
        )
        self.wr.refresh_node_config(self.db, force=True)

        context = build_test_context(self.db, item_count=1)
        self.service_line_id = context["hang_muc"][0]["id"]
        self.contract_id = context["contract_id"]
        self.director_user_id = create_test_user(self.db)

        # Tạo nhân sự:
        # Anh A (Đo vẽ 1), Anh B (Pháp lý), Anh C (Đo vẽ 2)
        self.user_a_id = create_test_user(self.db)
        self.user_b_id = create_test_user(self.db)
        self.user_c_id = create_test_user(self.db)

        self.emp_a_id = self._employee("SURVEY", name="Trương Tấn Quốc (Đo vẽ A)", user_id=self.user_a_id)
        self.emp_b_id = self._employee("LEGAL", name="Lê Văn Huy (Pháp lý B)", user_id=self.user_b_id)
        self.emp_c_id = self._employee("SURVEY", name="Nguyễn Văn Hưng (Đo vẽ C)", user_id=self.user_c_id)

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.wr.clear_node_config()

    def _employee(self, department_code: str, *, name: str, user_id: str | None = None) -> str:
        dept_name = "Phòng Đo vẽ" if department_code == "SURVEY" else "Phòng Pháp lý"
        dept_id = self.db.execute(
            text("select id from public.departments where code = :c"), {"c": department_code}
        ).scalar()
        if not dept_id:
            dept_id = _id("D")
            self.db.execute(
                text("insert into public.departments (id, code, name) values (:id, :c, :n)"),
                {"id": dept_id, "c": department_code, "n": dept_name},
            )
        emp_id = _id("E")
        self.db.execute(
            text("""
                insert into public.employees (id, full_name, department_id, is_active, user_id)
                values (:id, :n, :d, true, :u)
            """),
            {"id": emp_id, "n": name, "d": dept_id, "u": user_id},
        )
        return emp_id

    def _create_work_item_with_rate(self, code: str, name: str, amount: float) -> tuple[str, str]:
        item_id = _id("WI")
        actual_id = self.db.execute(
            text("""
                insert into public.work_items (id, code, name, default_unit, is_active)
                values (:id, :c, :n, 'Gói', true)
                on conflict (code) do update set name = excluded.name
                returning id
            """),
            {"id": item_id, "c": code, "n": name},
        ).scalar()
        item_id = actual_id or item_id
        rate_id = _id("WIR")
        self.db.execute(
            text("""
                insert into public.work_item_rates
                    (id, work_item_id, role_code, amount, status, effective_from, approved_at, approved_by)
                values
                    (:id, :wid, 'MAIN', :amount, 'published', current_date, now(), :actor_id)
            """),
            {"id": rate_id, "wid": item_id, "amount": amount, "actor_id": self.director_user_id},
        )
        return item_id, rate_id

    def _setup_7_node_workflow_with_payables(self, rate_per_node: float = 500000.0, service_line_id: str | None = None):
        if not service_line_id:
            ctx = build_test_context(self.db, item_count=1)
            service_line_id = ctx["hang_muc"][0]["id"]
        instance_id = _id("WI")
        self.db.execute(
            text("insert into public.workflow_instances (id, service_line_id, status) values (:id, :sl, 'running')"),
            {"id": instance_id, "sl": service_line_id},
        )
        revision_id = _id("REV")

        graph_nodes = {
            "n01": {"name": "Tiếp nhận & Khảo sát", "pool_department_codes": ["SURVEY"], "claim_roles": ["MAIN"], "transitions": {"done": "n02"}},
            "n02": {"name": "Đo đạc hiện trường", "pool_department_codes": ["SURVEY"], "claim_roles": ["MAIN"], "transitions": {"done": "n03"}},
            "n03": {"name": "Soạn thảo hồ sơ", "pool_department_codes": ["LEGAL"], "claim_roles": ["MAIN"], "transitions": {"done": "n04"}},
            "n04": {"name": "Thẩm tra pháp lý", "pool_department_codes": ["LEGAL"], "claim_roles": ["MAIN"], "transitions": {"done": "n05"}},
            "n05": {"name": "Nộp & Xử lý hồ sơ", "pool_department_codes": ["LEGAL"], "claim_roles": ["MAIN"], "transitions": {"done": "n06"}},
            "n06": {"name": "Cập nhật biến động bản đồ", "pool_department_codes": ["SURVEY"], "claim_roles": ["MAIN"], "transitions": {"done": "n07"}},
            "n07": {"name": "Nghiệm thu hoàn tất", "pool_department_codes": ["SURVEY"], "claim_roles": ["MAIN"], "transitions": {}},
        }

        self.db.execute(
            text("""
                insert into public.workflow_instance_revisions
                    (id, workflow_instance_id, revision_no, graph)
                values (:id, :wi, 1, cast(:g as jsonb))
            """),
            {"id": revision_id, "wi": instance_id, "g": json.dumps({"nodes": graph_nodes})},
        )
        self.db.execute(
            text("update public.workflow_instances set active_revision_id = :r where id = :id"),
            {"r": revision_id, "id": instance_id},
        )

        node_codes = [("N01", "n01"), ("N02", "n02"), ("N03", "n03"), ("N04", "n04"),
                      ("N05", "n05"), ("N06", "n06"), ("N07", "n07")]
        node_ids = {}
        checklist_data = {}

        for index, (code, key) in enumerate(node_codes):
            nid = _id("TN")
            status = "ready" if index == 0 else "pending"
            self.db.execute(
                text("""
                    insert into public.task_nodes
                        (id, workflow_instance_id, defined_by_revision_id, node_key, node_code, status, occurrence_no)
                    values (:id, :wi, :rev, :key, :code, :status, 1)
                """),
                {"id": nid, "wi": instance_id, "rev": revision_id, "key": key, "code": code, "status": status},
            )
            node_ids[code] = nid

            # Tạo checklist có gắn tiền khoán (is_payable = true) cho mỗi node
            w_item_id, rate_id = self._create_work_item_with_rate(f"PAY_{code}", f"Khoán {code}", rate_per_node)
            c_res_id = _id("CR")
            self.db.execute(
                text("""
                    insert into public.task_node_checklist_results
                        (id, task_node_id, contract_id, checklist_key, checklist_name,
                         is_required, status, work_item_id, is_payable,
                         pay_scope, pay_key, pay_group_key)
                    values
                        (:id, :nid, :cid, :ckey, :cname, true, 'pending', :wid, true,
                         'PER_OCCURRENCE', 'DEFAULT', 'PRIMARY')
                """),
                {
                    "id": c_res_id,
                    "nid": nid,
                    "cid": self.contract_id,
                    "ckey": f"chk_{code}",
                    "cname": f"Hạng mục nghiệm thu {code}",
                    "wid": w_item_id,
                },
            )
            checklist_data[code] = {
                "checklist_result_id": c_res_id,
                "work_item_id": w_item_id,
                "rate_id": rate_id,
                "amount": rate_per_node,
            }

        return instance_id, node_ids, checklist_data

    def _sync_checklist_assignment_for_primary(self, task_node_id: str, employee_id: str, checklist_data_entry: dict):
        """Đảm bảo checklist_assignments đồng bộ với thợ chính để sinh work_pay_entitlements khi nghiệm thu."""
        c_res_id = checklist_data_entry["checklist_result_id"]
        rate_id = checklist_data_entry["rate_id"]
        # Đánh dấu các assignment cũ là replaced nếu có
        self.db.execute(
            text("""
                update public.task_node_checklist_assignments
                set status = 'replaced', ended_at = now()
                where checklist_result_id = :cid and status != 'replaced'
            """),
            {"cid": c_res_id},
        )
        ca_id = _id("TCA")
        self.db.execute(
            text("""
                insert into public.task_node_checklist_assignments
                    (id, checklist_result_id, employee_id, role_code, pay_slot,
                     share_percent, work_item_rate_id, status, assigned_by)
                values
                    (:id, :cid, :eid, 'MAIN', 'PRIMARY', 100, :rid, 'assigned', :actor)
            """),
            {
                "id": ca_id,
                "cid": c_res_id,
                "eid": employee_id,
                "rid": rate_id,
                "actor": self.director_user_id,
            },
        )
        return ca_id

    # =========================================================================
    # TC-01: Bất biến 1 người chính ở tầng Database Engine (Zero-Tolerance DB Invariant)
    # =========================================================================
    def test_tc01_database_single_primary_invariant(self):
        """Database Engine Constraint: Partial Unique Index ux_task_node_assignments_single_primary
        phải CHẶN ĐỨNG mọi nỗ lực ghi nhận 2 người chính cùng 1 task_node.
        """
        instance_id, node_ids, _ = self._setup_7_node_workflow_with_payables()
        tn_id = node_ids["N01"]

        # Gán người chính 1 (Anh A)
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (id, task_node_id, employee_id, role_code, is_primary, assignment_status, assigned_by)
                values (:id, :tn_id, :emp_id, 'MAIN', true, 'assigned', :actor)
            """),
            {"id": _id("TNA"), "tn_id": tn_id, "emp_id": self.emp_a_id, "actor": self.director_user_id},
        )
        self.db.flush()

        # Thử chèn người chính 2 (Anh B) vào cùng node này -> PHẢI NÉM LỖI IntegrityError!
        # Dùng savepoint (begin_nested) để khi gặp IntegrityError, rollback an toàn không ảnh hưởng transaction
        with self.assertRaises(IntegrityError):
            with self.db.begin_nested():
                self.db.execute(
                    text("""
                        insert into public.task_node_assignments
                            (id, task_node_id, employee_id, role_code, is_primary, assignment_status, assigned_by)
                        values (:id, :tn_id, :emp_id, 'MAIN', true, 'assigned', :actor)
                    """),
                    {"id": _id("TNA"), "tn_id": tn_id, "emp_id": self.emp_b_id, "actor": self.director_user_id},
                )

        # Khi người chính 1 bị chuyển sang 'replaced', chèn người chính mới phải THÀNH CÔNG!
        self.db.execute(
            text("""
                update public.task_node_assignments
                set assignment_status = 'replaced'
                where task_node_id = :tn_id and employee_id = :emp_id
            """),
            {"tn_id": tn_id, "emp_id": self.emp_a_id},
        )
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (id, task_node_id, employee_id, role_code, is_primary, assignment_status, assigned_by)
                values (:id, :tn_id, :emp_id, 'MAIN', true, 'assigned', :actor)
            """),
            {"id": _id("TNA"), "tn_id": tn_id, "emp_id": self.emp_b_id, "actor": self.director_user_id},
        )
        self.db.flush()

        # Kiểm tra chỉ có đúng 1 phân công active và đó là Anh B
        active_primaries = self.db.execute(
            text("""
                select employee_id, role_code, is_primary
                from public.task_node_assignments
                where task_node_id = :tn_id and is_primary and assignment_status in ('proposed', 'assigned', 'accepted')
            """),
            {"tn_id": tn_id},
        ).mappings().all()
        self.assertEqual(len(active_primaries), 1, "Chỉ được phép có duy nhất 1 người chính active")
        self.assertEqual(active_primaries[0]["employee_id"], self.emp_b_id)

    # =========================================================================
    # TC-02: Bất biến 1 người chính ở tầng Runtime Claim (Xung đột Bể việc)
    # =========================================================================
    def test_tc02_runtime_claim_and_reserve_single_primary_concurrency(self):
        """Khi 2 thợ cùng lúc tranh nhau bấm nhận việc trên Bể việc:
        1 người thành công nhận việc, người kia phải nhận TaskClaimConflict,
        tuyệt đối không bao giờ 2 người cùng chui vào 1 node.
        """
        from src.contracts.workflow_runtime import TaskClaimConflict

        instance_id, node_ids, _ = self._setup_7_node_workflow_with_payables()
        tn_id = node_ids["N01"]

        # Anh A bấm nhận trước
        self.wr.claim_and_start_task(
            self.db,
            task_node_id=tn_id,
            employee_id=self.emp_a_id,
            role_code="MAIN",
            actor_id=self.user_a_id,
        )

        # Anh C (cũng phòng Đo vẽ) bấm nhận sau -> PHẢI BỊ CHẶN VỚI TaskClaimConflict
        with self.assertRaises(TaskClaimConflict):
            self.wr.claim_and_start_task(
                self.db,
                task_node_id=tn_id,
                employee_id=self.emp_c_id,
                role_code="MAIN",
                actor_id=self.user_c_id,
            )

        # Kiểm tra danh sách phân công: Chỉ có Anh A là MAIN
        assignments = self.db.execute(
            text("""
                select employee_id, role_code, is_primary, assignment_status
                from public.task_node_assignments
                where task_node_id = :tn_id and assignment_status in ('proposed', 'assigned', 'accepted')
            """),
            {"tn_id": tn_id},
        ).mappings().all()
        self.assertEqual(len(assignments), 1)
        self.assertEqual(assignments[0]["employee_id"], self.emp_a_id)
        self.assertTrue(assignments[0]["is_primary"])

    # =========================================================================
    # TC-03: Quy trình Chuyền gậy 7 Node qua toàn bộ các nút bấm & Trạng thái
    # =========================================================================
    def test_tc03_relay_race_7_nodes_buttons_and_transitions(self):
        """Chuỗi 7 node: N01(ĐV) -> N02(ĐV) -> N03(PL) -> N04(PL) -> N05(PL) -> N06(ĐV) -> N07(ĐV).
        Kiểm tra:
        - Tương tác nút bấm (claim, start, submit, review).
        - Khi thợ Đo vẽ nhận việc, hệ thống chỉ giữ node Đo vẽ, TUYỆT ĐỐI không gán node Pháp lý.
        - Khi xong N02, gậy tự chuyền sang Pháp lý (N03 ready, xuất hiện ở Bể việc Pháp lý).
        - Pháp lý hoàn tất N05, gậy tự chuyền lại cho Đo vẽ (N06 ready).
        - Tất cả 7 node lần lượt hoàn thành êm đẹp.
        """
        from src.employee_portal.service import EmployeePortalService
        from src.db.models import Employee

        emp_a = self.db.query(Employee).filter(Employee.id == self.emp_a_id).first()
        emp_b = self.db.query(Employee).filter(Employee.id == self.emp_b_id).first()

        instance_id, node_ids, chk_data = self._setup_7_node_workflow_with_payables()

        # 1. Bể việc ban đầu: Đo vẽ thấy N01; Pháp lý không thấy N03
        pool_a = EmployeePortalService.get_task_pool(self.db, emp_a)
        items_a = [i for i in pool_a.get("items", []) if i.get("id") == node_ids["N01"] or i.get("workflow_instance_id") == instance_id]
        self.assertEqual(len(items_a), 1)
        self.assertEqual(items_a[0]["id"], node_ids["N01"])

        pool_b = EmployeePortalService.get_task_pool(self.db, emp_b)
        items_b = [i for i in pool_b.get("items", []) if i.get("workflow_instance_id") == instance_id]
        self.assertEqual(len(items_b), 0, "Pháp lý chưa được thấy khi N03 pending")

        # 2. Anh A nhận N01
        self.wr.claim_and_start_task(
            self.db,
            task_node_id=node_ids["N01"],
            employee_id=self.emp_a_id,
            role_code="MAIN",
            actor_id=self.user_a_id,
        )
        self._sync_checklist_assignment_for_primary(node_ids["N01"], self.emp_a_id, chk_data["N01"])

        # Kiểm tra việc giữ trước (Relay reservation):
        # A giữ N01, N02, N06, N07.
        # N03, N04, N05 (Pháp lý) TUYỆT ĐỐI KHÔNG CÓ AI GIỮ!
        for code in ("N01", "N02", "N06", "N07"):
            assignees = self.db.execute(
                text("select employee_id from public.task_node_assignments where task_node_id = :nid and assignment_status in ('proposed', 'assigned', 'accepted')"),
                {"nid": node_ids[code]},
            ).scalars().all()
            self.assertEqual(assignees, [self.emp_a_id], f"Node {code} phải do Anh A giữ")

        for code in ("N03", "N04", "N05"):
            assignees = self.db.execute(
                text("select employee_id from public.task_node_assignments where task_node_id = :nid and assignment_status in ('proposed', 'assigned', 'accepted')"),
                {"nid": node_ids[code]},
            ).scalars().all()
            self.assertEqual(assignees, [], f"Node {code} của Pháp lý không được có ai gán trước!")

        # 3. Anh A hoàn thành N01 và N02
        # N01: Submit -> Review -> Accepted
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"),
            {"cid": chk_data["N01"]["checklist_result_id"]},
        )
        sub_1 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=node_ids["N01"], employee_id=self.emp_a_id, actor_id=self.user_a_id, note="Xong N01"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_1["acceptance_id"], decision="accepted", outcome="done", review_note="OK N01", actor_id=self.director_user_id
        )

        # N02: Start -> Submit -> Review -> Accepted
        self._sync_checklist_assignment_for_primary(node_ids["N02"], self.emp_a_id, chk_data["N02"])
        self.wr.start_task_node(self.db, task_node_id=node_ids["N02"], employee_id=self.emp_a_id, actor_id=self.user_a_id)
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"),
            {"cid": chk_data["N02"]["checklist_result_id"]},
        )
        sub_2 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=node_ids["N02"], employee_id=self.emp_a_id, actor_id=self.user_a_id, note="Xong N02"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_2["acceptance_id"], decision="accepted", outcome="done", review_note="OK N02", actor_id=self.director_user_id
        )

        # 4. CHUYỀN GẬY: N03 của Pháp lý chuyển sang 'ready'!
        n03_status = self.db.execute(text("select status from public.task_nodes where id = :nid"), {"nid": node_ids["N03"]}).scalar()
        self.assertEqual(n03_status, "ready", "Node N03 của Pháp lý phải tự động mở ready")

        # Bể việc của Pháp lý: Xuất hiện N03!
        pool_b_after_2 = EmployeePortalService.get_task_pool(self.db, emp_b)
        self.assertEqual(len(pool_b_after_2.get("items", [])), 1, "Pháp lý phải thấy hạng mục xuất hiện trên Bể việc")
        self.assertEqual(pool_b_after_2["items"][0]["id"], node_ids["N03"])
        items_b_after = [i for i in pool_b_after_2.get("items", []) if i.get("id") == node_ids["N03"] or i.get("workflow_instance_id") == instance_id]
        self.assertEqual(len(items_b_after), 1, "Pháp lý phải thấy hạng mục xuất hiện trên Bể việc")
        self.assertEqual(items_b_after[0]["id"], node_ids["N03"])

        # 5. Anh B (Pháp lý) nhận N03 -> Hệ thống giữ tiếp N04, N05 cho Anh B!
        self.wr.claim_and_start_task(
            self.db,
            task_node_id=node_ids["N03"],
            employee_id=self.emp_b_id,
            role_code="MAIN",
            actor_id=self.user_b_id,
        )
        self._sync_checklist_assignment_for_primary(node_ids["N03"], self.emp_b_id, chk_data["N03"])
        for code in ("N04", "N05"):
            self._sync_checklist_assignment_for_primary(node_ids[code], self.emp_b_id, chk_data[code])

        # Kiểm tra phân công cụm Pháp lý:
        for code in ("N03", "N04", "N05"):
            assignees = self.db.execute(
                text("select employee_id from public.task_node_assignments where task_node_id = :nid and assignment_status in ('proposed', 'assigned', 'accepted')"),
                {"nid": node_ids[code]},
            ).scalars().all()
            self.assertEqual(assignees, [self.emp_b_id], f"Node {code} phải do Anh B Pháp lý phụ trách")

        # Các node N06, N07 vẫn do Anh A giữ, không bị ảnh hưởng:
        for code in ("N06", "N07"):
            assignees = self.db.execute(
                text("select employee_id from public.task_node_assignments where task_node_id = :nid and assignment_status in ('proposed', 'assigned', 'accepted')"),
                {"nid": node_ids[code]},
            ).scalars().all()
            self.assertEqual(assignees, [self.emp_a_id], f"Node {code} vẫn thuộc về Anh A Đo vẽ")

        # 6. Anh B hoàn thành N03, N04, N05
        for code in ("N03", "N04", "N05"):
            if code != "N03":
                self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_b_id, actor_id=self.user_b_id)
            self.db.execute(
                text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"),
                {"cid": chk_data[code]["checklist_result_id"]},
            )
            sub = self.wr.submit_task_node_for_acceptance(
                self.db, task_node_id=node_ids[code], employee_id=self.emp_b_id, actor_id=self.user_b_id, note=f"Xong {code}"
            )
            self.wr.review_task_node_acceptance(
                self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"OK {code}", actor_id=self.director_user_id
            )

        # 7. CHUYỀN GẬY NGƯỢC LẠI: N06 của Đo vẽ chuyển sang 'ready'!
        n06_status = self.db.execute(text("select status from public.task_nodes where id = :nid"), {"nid": node_ids["N06"]}).scalar()
        self.assertEqual(n06_status, "ready", "Node N06 của Đo vẽ phải chuyển ready sau khi Pháp lý nộp xong N05")

        # 8. Anh A tiếp tục hoàn thành N06 và N07
        for code in ("N06", "N07"):
            self._sync_checklist_assignment_for_primary(node_ids[code], self.emp_a_id, chk_data[code])
            self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id)
            self.db.execute(
                text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"),
                {"cid": chk_data[code]["checklist_result_id"]},
            )
            sub = self.wr.submit_task_node_for_acceptance(
                self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id, note=f"Xong {code}"
            )
            self.wr.review_task_node_acceptance(
                self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"OK {code}", actor_id=self.director_user_id
            )

        # 9. Kiểm tra toàn bộ 7 node đều accepted và mỗi node CHỈ CÓ ĐÚNG 1 NGƯỜI CHÍNH
        for code, nid in node_ids.items():
            status = self.db.execute(text("select status from public.task_nodes where id = :nid"), {"nid": nid}).scalar()
            self.assertEqual(status, "accepted", f"Node {code} phải ở trạng thái accepted")
            primaries = self.db.execute(
                text("select employee_id from public.task_node_assignments where task_node_id = :nid and is_primary and assignment_status in ('proposed', 'assigned', 'accepted')"),
                {"nid": nid},
            ).scalars().all()
            self.assertEqual(len(primaries), 1, f"Node {code} phải có duy nhất 1 người chính!")

    # =========================================================================
    # TC-04: Kiểm toán kỳ lương sau Chuyền gậy (Payroll Entitlement Audit)
    # =========================================================================
    def test_tc04_relay_race_payroll_calculation_audit(self):
        """Sau khi chuỗi 7 node hoàn thành qua cơ chế Chuyền gậy:
        - Anh A (Đo vẽ) phải được tính tiền chính xác 4 node: N01, N02, N06, N07.
        - Anh B (Pháp lý) phải được tính tiền chính xác 3 node: N03, N04, N05.
        - Tổng tiền công ty chi trả = 4 * 500k + 3 * 500k = 3.500.000 VNĐ.
        - API get_employee_ledger và view active_work_pay_entitlements phải khớp 100%.
        """
        rate = 500000.0
        instance_id, node_ids, chk_data = self._setup_7_node_workflow_with_payables(rate_per_node=rate)

        # Chạy trọn vẹn quy trình 7 node
        self.wr.claim_and_start_task(self.db, task_node_id=node_ids["N01"], employee_id=self.emp_a_id, role_code="MAIN", actor_id=self.user_a_id)
        for code in ("N01", "N02", "N06", "N07"):
            self._sync_checklist_assignment_for_primary(node_ids[code], self.emp_a_id, chk_data[code])

        # N01 & N02 (Anh A)
        for code in ("N01", "N02"):
            if code == "N02":
                self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id)
            self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data[code]["checklist_result_id"]})
            sub = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id, note=f"Nộp nghiệm thu {code}")
            self.wr.review_task_node_acceptance(self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"Duyệt nghiệm thu {code}", actor_id=self.director_user_id)

        # N03, N04, N05 (Anh B Pháp lý nhận và làm)
        self.wr.claim_and_start_task(self.db, task_node_id=node_ids["N03"], employee_id=self.emp_b_id, role_code="MAIN", actor_id=self.user_b_id)
        for code in ("N03", "N04", "N05"):
            self._sync_checklist_assignment_for_primary(node_ids[code], self.emp_b_id, chk_data[code])
            if code != "N03":
                self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_b_id, actor_id=self.user_b_id)
            self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data[code]["checklist_result_id"]})
            sub = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids[code], employee_id=self.emp_b_id, actor_id=self.user_b_id, note=f"Nộp nghiệm thu {code}")
            self.wr.review_task_node_acceptance(self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"Duyệt nghiệm thu {code}", actor_id=self.director_user_id)

        # N06, N07 (Anh A Đo vẽ tiếp tục làm)
        for code in ("N06", "N07"):
            self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id)
            self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data[code]["checklist_result_id"]})
            sub = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id, note=f"Nộp nghiệm thu {code}")
            self.wr.review_task_node_acceptance(self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"Duyệt nghiệm thu {code}", actor_id=self.director_user_id)

        # ── KIỂM TOÁN LƯƠNG ──
        # 1. Bảng active_work_pay_entitlements:
        entitlements_a = self.db.execute(
            text("select task_node_id, amount from public.active_work_pay_entitlements where employee_id = :eid"),
            {"eid": self.emp_a_id},
        ).mappings().all()
        total_a = sum(float(r["amount"]) for r in entitlements_a)
        self.assertEqual(len(entitlements_a), 4, "Anh A phải có đúng 4 suất khoán")
        self.assertEqual(total_a, 2000000.0, "Anh A phải được 2.000.000 VNĐ")

        entitlements_b = self.db.execute(
            text("select task_node_id, amount from public.active_work_pay_entitlements where employee_id = :eid"),
            {"eid": self.emp_b_id},
        ).mappings().all()
        total_b = sum(float(r["amount"]) for r in entitlements_b)
        self.assertEqual(len(entitlements_b), 3, "Anh B phải có đúng 3 suất khoán")
        self.assertEqual(total_b, 1500000.0, "Anh B phải được 1.500.000 VNĐ")

        total_payout = total_a + total_b
        self.assertEqual(total_payout, 3500000.0, "Tổng chi lương khoán 7 node phải chính xác 3.500.000 VNĐ, không thừa không thiếu")

        # 2. Kiểm tra API get_employee_ledger cho Anh A và Anh B:
        from src.routes.routes_payroll import get_employee_ledger
        from src.db.models import User

        user_a = self.db.query(User).filter(User.id == self.user_a_id).first()
        now = datetime.now()
        ledger_a = get_employee_ledger(
            department_id=None,
            employee_id=self.emp_a_id,
            year=now.year,
            month=now.month,
            db=self.db,
            user=user_a,
        )
        self.assertEqual(ledger_a["status"], "success")
        summary_a = ledger_a["data"]["summary"]
        self.assertEqual(summary_a["pending_record_total"], 2000000.0, "Ledger Anh A ghi nhận 2.000.000 VNĐ chờ chốt")
        self.assertEqual(len(ledger_a["data"]["details"]), 4, "Ledger Anh A có 4 dòng chi tiết")

        user_b = self.db.query(User).filter(User.id == self.user_b_id).first()
        ledger_b = get_employee_ledger(
            department_id=None,
            employee_id=self.emp_b_id,
            year=now.year,
            month=now.month,
            db=self.db,
            user=user_b,
        )
        self.assertEqual(ledger_b["status"], "success")
        summary_b = ledger_b["data"]["summary"]
        self.assertEqual(summary_b["pending_record_total"], 1500000.0, "Ledger Anh B ghi nhận 1.500.000 VNĐ chờ chốt")
        self.assertEqual(len(ledger_b["data"]["details"]), 3, "Ledger Anh B có 3 dòng chi tiết")

    # =========================================================================
    # TC-05: Nhường bước & Làm hộ (claim_node_help) & Điều chỉnh lương
    # =========================================================================
    def test_tc05_help_request_claim_and_payroll_adjustment(self):
        """Kịch bản: Anh A đang làm N02 thì bận, bấm Nhường bước (request_node_help).
        Anh C (Đo vẽ 2) vào Bể việc bấm Nhận làm hộ (claim_node_help):
        - Phân công của Anh A trên N02 chuyển sang 'replaced'.
        - Anh C trở thành người chính DUY NHẤT của N02.
        - Khi nghiệm thu N02, tiền khoán thuộc về Anh C.
        - Bảng lương của Anh A loại bỏ N02, bảng lương Anh C nhận tiền N02.
        """
        instance_id, node_ids, chk_data = self._setup_7_node_workflow_with_payables(rate_per_node=600000.0)

        # Anh A nhận việc và làm N01
        self.wr.claim_and_start_task(self.db, task_node_id=node_ids["N01"], employee_id=self.emp_a_id, role_code="MAIN", actor_id=self.user_a_id)
        self._sync_checklist_assignment_for_primary(node_ids["N01"], self.emp_a_id, chk_data["N01"])
        self._sync_checklist_assignment_for_primary(node_ids["N02"], self.emp_a_id, chk_data["N02"])

        # N01 xong
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data["N01"]["checklist_result_id"]})
        sub_1 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids["N01"], employee_id=self.emp_a_id, actor_id=self.user_a_id, note="Nộp nghiệm thu N01")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_1["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu N01", actor_id=self.director_user_id)

        # N02: Anh A bắt đầu làm, nhưng sau đó xin nhường bước
        self.wr.start_task_node(self.db, task_node_id=node_ids["N02"], employee_id=self.emp_a_id, actor_id=self.user_a_id)
        help_req = self.wr.request_node_help(
            self.db,
            task_node_id=node_ids["N02"],
            employee_id=self.emp_a_id,
            reason="Bận đi công tác đột xuất, nhờ anh em làm hộ khâu đo N02",
        )
        self.assertEqual(help_req["status"], "open")

        # Anh C vào nhận làm hộ
        claim_help_res = self.wr.claim_node_help(
            self.db,
            request_id=help_req["id"],
            employee_id=self.emp_c_id,
            actor_id=self.user_c_id,
        )
        self.assertEqual(claim_help_res["help_request_id"], help_req["id"])
        self.assertIsNotNone(claim_help_res["assignment_id"])
        help_db_status = self.db.execute(text("select status from public.task_node_help_requests where id = :id"), {"id": help_req["id"]}).scalar()
        self.assertEqual(help_db_status, "claimed")

        # Đồng bộ checklist cho Anh C
        self._sync_checklist_assignment_for_primary(node_ids["N02"], self.emp_c_id, chk_data["N02"])

        # Kiểm tra trạng thái phân công N02:
        # Anh A phải là 'replaced', Anh C là 'assigned' và is_primary = True
        assignments = self.db.execute(
            text("select employee_id, role_code, is_primary, assignment_status from public.task_node_assignments where task_node_id = :nid order by created_at"),
            {"nid": node_ids["N02"]},
        ).mappings().all()

        active_assignments = [a for a in assignments if a["assignment_status"] in ('proposed', 'assigned', 'accepted')]
        self.assertEqual(len(active_assignments), 1, "Chỉ duy nhất 1 phân công active trên N02!")
        self.assertEqual(active_assignments[0]["employee_id"], self.emp_c_id)
        self.assertTrue(active_assignments[0]["is_primary"])

        # Anh C hoàn thành N02 và được duyệt
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data["N02"]["checklist_result_id"]})
        sub_2 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids["N02"], employee_id=self.emp_c_id, actor_id=self.user_c_id, note="Anh C làm hộ xong N02")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_2["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu N02", actor_id=self.director_user_id)

        # Kiểm tra phân bổ lương:
        # Anh A chỉ được tính N01 (600.000 VNĐ).
        # Anh C được tính N02 (600.000 VNĐ).
        entitlements_a = self.db.execute(
            text("select task_node_id, amount from public.active_work_pay_entitlements where employee_id = :eid"),
            {"eid": self.emp_a_id},
        ).mappings().all()
        self.assertEqual(len(entitlements_a), 1)
        self.assertEqual(entitlements_a[0]["task_node_id"], node_ids["N01"])
        self.assertEqual(float(entitlements_a[0]["amount"]), 600000.0)

        entitlements_c = self.db.execute(
            text("select task_node_id, amount from public.active_work_pay_entitlements where employee_id = :eid"),
            {"eid": self.emp_c_id},
        ).mappings().all()
        self.assertEqual(len(entitlements_c), 1)
        self.assertEqual(entitlements_c[0]["task_node_id"], node_ids["N02"])
        self.assertEqual(float(entitlements_c[0]["amount"]), 600000.0)

        # Kiểm tra get_employee_ledger cho Anh A: không có dòng ghost row của N02
        from src.routes.routes_payroll import get_employee_ledger
        from src.db.models import User

        user_a = self.db.query(User).filter(User.id == self.user_a_id).first()
        now = datetime.now()
        ledger_a = get_employee_ledger(
            department_id=None,
            employee_id=self.emp_a_id,
            year=now.year,
            month=now.month,
            db=self.db,
            user=user_a,
        )
        print("\n--- DETAILS FOR ANH A ---")
        for d in ledger_a["data"]["details"]:
            print(f"Task: {d['task_id']}, Status: {d['status']}, Amount: {d['net_amount']}, Source: {d['source']}")
        print("--- END DETAILS ---")
        # N02 was replaced, so it should NOT be in ledger_a.
        # Nodes present should only be N01 (and any future reserved nodes N06, N07), but NEVER N02!
        detail_task_ids_a = [d["task_id"] for d in ledger_a["data"]["details"]]
        self.assertNotIn("N02", detail_task_ids_a, "N02 đã nhường và bị replaced, tuyệt đối không được xuất hiện trong bảng lương Anh A!")
        self.assertIn("N01", detail_task_ids_a, "N01 hoàn thành phải có trong bảng lương Anh A")

        # Kiểm tra get_employee_ledger cho Anh C (người nhận làm hộ):
        user_c = self.db.query(User).filter(User.id == self.user_c_id).first()
        ledger_c = get_employee_ledger(
            department_id=None,
            employee_id=self.emp_c_id,
            year=now.year,
            month=now.month,
            db=self.db,
            user=user_c,
        )
        self.assertEqual(ledger_c["status"], "success")
        detail_task_ids_c = [d["task_id"] for d in ledger_c["data"]["details"]]
        self.assertIn("N02", detail_task_ids_c, "N02 Anh C làm hộ phải có trong bảng lương Anh C")
        self.assertEqual(ledger_c["data"]["summary"]["pending_record_total"], 600000.0, "Anh C được ghi nhận 600.000 VNĐ cho N02")

    # =========================================================================
    # TC-06: Khả năng chịu tải & Chống nghẽn quy mô lớn (Scale & Concurrency)
    # =========================================================================
    def test_tc06_scale_and_concurrency_resilience(self):
        """Mô phỏng áp lực hệ thống quy mô lớn (nhiều hợp đồng / luồng chuyền gậy đồng thời):
        1. Thử thách Race Condition: 6 nhân viên khác nhau cùng bấm nhận 1 bước N01 tại cùng 1 thời điểm.
           -> Đúng duy nhất 1 người thành công, 5 người còn lại nhận TaskClaimConflict, 0 lỗi DB, 0 duplicate primary.
        2. Thử thách Chịu tải đồng thời: 5 hợp đồng độc lập chạy song song cùng lúc.
           -> Không xảy ra Deadlock, toàn bộ đều được phân định rành mạch.
        """
        import concurrent.futures
        from src.db.database import SessionLocal
        from src.contracts.workflow_runtime import TaskClaimConflict

        created_wi_ids = []
        try:
            # --- PHẦN 1: 6 NHÂN VIÊN TRANH NHAU 1 BƯỚC N01 ---
            inst_id_1, n_ids_1, _ = self._setup_7_node_workflow_with_payables(rate_per_node=500000.0)
            created_wi_ids.append(inst_id_1)

            # Tạo 6 nhân viên phòng Đo vẽ độc lập
            competing_workers = []
            for i in range(6):
                u_id = create_test_user(self.db)
                e_id = self._employee("SURVEY", name=f"Đo vẽ Test Cạnh Tranh {i}_{u_id[:6]}", user_id=u_id)
                competing_workers.append((e_id, u_id))
            self.db.commit()

            results_1 = []

            def worker_race(emp_tuple, node_id):
                e_id, u_id = emp_tuple
                session = SessionLocal()
                try:
                    res = self.wr.claim_and_start_task(
                        session,
                        task_node_id=node_id,
                        employee_id=e_id,
                        role_code="MAIN",
                        actor_id=u_id,
                    )
                    session.commit()
                    return ("SUCCESS", e_id)
                except TaskClaimConflict:
                    session.rollback()
                    return ("CONFLICT", e_id)
                except Exception as exc:
                    session.rollback()
                    return ("ERROR", str(exc))
                finally:
                    session.close()

            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
                futs = [executor.submit(worker_race, w, n_ids_1["N01"]) for w in competing_workers]
                for fut in concurrent.futures.as_completed(futs):
                    results_1.append(fut.result())

            errors_1 = [r for r in results_1 if r[0] == "ERROR"]
            self.assertEqual(len(errors_1), 0, f"Không được có lỗi DB / Deadlock: {errors_1}")

            successes_1 = [r for r in results_1 if r[0] == "SUCCESS"]
            conflicts_1 = [r for r in results_1 if r[0] == "CONFLICT"]
            self.assertEqual(len(successes_1), 1, "Đúng duy nhất 1 nhân viên giành được quyền nhận việc")
            self.assertEqual(len(conflicts_1), 5, "5 nhân viên còn lại nhận Conflict thông báo việc đã có người nhận")

            # Kiểm tra bất biến Database Engine:
            active_primaries = self.db.execute(
                text("""
                    select count(*) from public.task_node_assignments
                    where task_node_id = :nid and is_primary = true
                      and assignment_status in ('proposed', 'assigned', 'accepted')
                """),
                {"nid": n_ids_1["N01"]},
            ).scalar()
            self.assertEqual(active_primaries, 1, "Chỉ duy nhất 1 primary active trên node")

            # --- PHẦN 2: NHIỀU HỢP ĐỒNG CHẠY SONG SONG ĐỒNG THỜI ---
            contract_tasks = []
            for i in range(4):
                inst_id, n_ids, _ = self._setup_7_node_workflow_with_payables(rate_per_node=300000.0)
                created_wi_ids.append(inst_id)
                u1 = create_test_user(self.db)
                e1 = self._employee("SURVEY", name=f"Surveyor Multi A {i}_{u1[:6]}", user_id=u1)
                u2 = create_test_user(self.db)
                e2 = self._employee("SURVEY", name=f"Surveyor Multi B {i}_{u2[:6]}", user_id=u2)
                contract_tasks.append((n_ids["N01"], (e1, u1), (e2, u2)))
            self.db.commit()

            results_2 = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                futs = []
                for node_id, w1, w2 in contract_tasks:
                    futs.append(executor.submit(worker_race, w1, node_id))
                    futs.append(executor.submit(worker_race, w2, node_id))
                for fut in concurrent.futures.as_completed(futs):
                    results_2.append(fut.result())

            errors_2 = [r for r in results_2 if r[0] == "ERROR"]
            self.assertEqual(len(errors_2), 0, f"Không có lỗi nào khi chạy song song nhiều hợp đồng: {errors_2}")
            successes_2 = [r for r in results_2 if r[0] == "SUCCESS"]
            self.assertEqual(len(successes_2), 4, "4 hợp đồng đều có đúng 1 người nhận thành công")

        finally:
            # Dọn dẹp triệt để các workflow instances đã tạo để không làm ảnh hưởng các test khác
            if created_wi_ids:
                with SessionLocal() as clean_session:
                    clean_session.execute(
                        text("""
                            delete from public.task_node_assignments
                            where task_node_id in (select id from public.task_nodes where workflow_instance_id = any(:ids));
                            delete from public.task_node_checklist_assignments
                            where checklist_result_id in (
                                select id from public.task_node_checklist_results
                                where task_node_id in (select id from public.task_nodes where workflow_instance_id = any(:ids))
                            );
                            delete from public.task_node_checklist_results
                            where task_node_id in (select id from public.task_nodes where workflow_instance_id = any(:ids));
                            delete from public.task_node_events
                            where task_node_id in (select id from public.task_nodes where workflow_instance_id = any(:ids));
                            delete from public.task_nodes where workflow_instance_id = any(:ids);
                            update public.workflow_instances set active_revision_id = null where id = any(:ids);
                            delete from public.workflow_instance_revisions where workflow_instance_id = any(:ids);
                            delete from public.workflow_instances where id = any(:ids);
                        """),
                        {"ids": created_wi_ids},
                    )
                    clean_session.commit()
    # =========================================================================
    # TC-07: Chốt sổ kỳ lương (Close Employee Period) & Đảm bảo Tính Luỹ Kế/Idempotent
    # =========================================================================
    def test_tc07_relay_race_period_closing_idempotency_and_audit(self):
        """Kiểm thử chốt sổ lương sau quy trình Chuyền gậy 7 Node:
        1. Anh A (Đo vẽ): hoàn thành N01, N02, N06, N07 (4 * 500k = 2.000.000 VNĐ).
        2. Anh B (Pháp lý): hoàn thành N03, N04, N05 (3 * 500k = 1.500.000 VNĐ).
        3. Trước khi chốt sổ:
           - Toàn bộ ở trạng thái 'pending_record', approved_salary = 0.
        4. Chốt sổ Anh A (close_employee_period):
           - approved_count = 4.
           - DB: 4 bản ghi work_pay_entitlements chuyển sang 'approved', có approved_by, approved_at.
           - Ledger Anh A: approved_salary = 2.000.000, pending_record_total = 0.
        5. Chốt sổ Anh B (close_employee_period):
           - approved_count = 3.
           - DB: 3 bản ghi work_pay_entitlements chuyển sang 'approved'.
           - Ledger Anh B: approved_salary = 1.500.000, pending_record_total = 0.
        6. Tính Idempotent (Chốt lại lần 2):
           - approved_count = 0, không lặp lại tiền, không đội chi phí công ty.
           - Tổng chi lương toàn hợp đồng vẫn chính xác 3.500.000 VNĐ.
        """
        from src.routes.routes_payroll import close_employee_period, get_employee_ledger, ClosePeriodIn
        from src.db.models import User

        rate = 500000.0
        instance_id, node_ids, chk_data = self._setup_7_node_workflow_with_payables(rate_per_node=rate)

        # Chạy trọn vẹn quy trình 7 node
        self.wr.claim_and_start_task(self.db, task_node_id=node_ids["N01"], employee_id=self.emp_a_id, role_code="MAIN", actor_id=self.user_a_id)
        for code in ("N01", "N02", "N06", "N07"):
            self._sync_checklist_assignment_for_primary(node_ids[code], self.emp_a_id, chk_data[code])

        # N01, N02 (Anh A)
        for code in ("N01", "N02"):
            if code == "N02":
                self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id)
            self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data[code]["checklist_result_id"]})
            sub = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id, note=f"Nộp {code}")
            self.wr.review_task_node_acceptance(self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"Duyệt {code}", actor_id=self.director_user_id)

        # N03, N04, N05 (Anh B)
        self.wr.claim_and_start_task(self.db, task_node_id=node_ids["N03"], employee_id=self.emp_b_id, role_code="MAIN", actor_id=self.user_b_id)
        for code in ("N03", "N04", "N05"):
            self._sync_checklist_assignment_for_primary(node_ids[code], self.emp_b_id, chk_data[code])
            if code != "N03":
                self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_b_id, actor_id=self.user_b_id)
            self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data[code]["checklist_result_id"]})
            sub = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids[code], employee_id=self.emp_b_id, actor_id=self.user_b_id, note=f"Nộp {code}")
            self.wr.review_task_node_acceptance(self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"Duyệt {code}", actor_id=self.director_user_id)

        # N06, N07 (Anh A)
        for code in ("N06", "N07"):
            self.wr.start_task_node(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id)
            self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :cid"), {"cid": chk_data[code]["checklist_result_id"]})
            sub = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=node_ids[code], employee_id=self.emp_a_id, actor_id=self.user_a_id, note=f"Nộp {code}")
            self.wr.review_task_node_acceptance(self.db, acceptance_id=sub["acceptance_id"], decision="accepted", outcome="done", review_note=f"Duyệt {code}", actor_id=self.director_user_id)

        # Người duyệt (Giám đốc có role admin)
        from src.db.models import Role, UserRole
        from sqlalchemy import func
        director_user = self.db.query(User).filter(User.id == self.director_user_id).first()
        director_user.role = "admin"
        admin_role = self.db.query(Role).filter(func.lower(Role.role_name) == "admin").first()
        if not admin_role:
            admin_role = Role(role_name="admin", description="Admin", is_active=True)
            self.db.add(admin_role)
            self.db.flush()
        if not self.db.query(UserRole).filter(UserRole.user_id == director_user.id, UserRole.role_id == admin_role.id).first():
            self.db.add(UserRole(user_id=director_user.id, role_id=admin_role.id))
        self.db.commit()

        now = datetime.now()

        # ── 1. KIỂM TRA TRƯỚC KHI CHỐT SỔ ──
        ledger_a_pre = get_employee_ledger(department_id=None, employee_id=self.emp_a_id, year=now.year, month=now.month, db=self.db, user=director_user)
        self.assertEqual(ledger_a_pre["data"]["summary"]["pending_record_total"], 2000000.0)
        self.assertEqual(ledger_a_pre["data"]["summary"]["approved_salary"], 0.0)

        ledger_b_pre = get_employee_ledger(department_id=None, employee_id=self.emp_b_id, year=now.year, month=now.month, db=self.db, user=director_user)
        self.assertEqual(ledger_b_pre["data"]["summary"]["pending_record_total"], 1500000.0)
        self.assertEqual(ledger_b_pre["data"]["summary"]["approved_salary"], 0.0)

        # ── 2. THỰC HIỆN CHỐT SỔ CHO ANH A (ĐO VẼ) ──
        close_res_a = close_employee_period(
            payload=ClosePeriodIn(employee_id=self.emp_a_id, year=now.year, month=now.month),
            db=self.db,
            user=director_user,
        )
        self.assertEqual(close_res_a["status"], "success")
        self.assertEqual(close_res_a["data"]["approved_count"], 4, "Anh A phải được chốt chính xác 4 suất khoán")

        # Kiểm tra trạng thái DB trực tiếp
        db_approved_a = self.db.execute(
            text("""
                select count(*) from public.work_pay_entitlements
                where employee_id = :eid and status = 'approved' and approved_by = :uid
            """),
            {"eid": self.emp_a_id, "uid": self.director_user_id},
        ).scalar()
        self.assertEqual(db_approved_a, 4, "DB phải ghi nhận đúng 4 dòng approved cho Anh A")

        # Ledger Anh A sau khi chốt
        ledger_a_post = get_employee_ledger(department_id=None, employee_id=self.emp_a_id, year=now.year, month=now.month, db=self.db, user=director_user)
        self.assertEqual(ledger_a_post["data"]["summary"]["pending_record_total"], 0.0, "Không còn tiền chờ chốt")
        self.assertEqual(ledger_a_post["data"]["summary"]["approved_salary"], 2000000.0, "Lương đã chốt đúng 2.000.000 VNĐ")
        self.assertEqual(ledger_a_post["data"]["summary"]["recorded_total"], 2000000.0)
        self.assertEqual(ledger_a_post["data"]["summary"]["approved_count"], 4)

        # ── 3. THỰC HIỆN CHỐT SỔ CHO ANH B (PHÁP LÝ) ──
        close_res_b = close_employee_period(
            payload=ClosePeriodIn(employee_id=self.emp_b_id, year=now.year, month=now.month),
            db=self.db,
            user=director_user,
        )
        self.assertEqual(close_res_b["status"], "success")
        self.assertEqual(close_res_b["data"]["approved_count"], 3, "Anh B phải được chốt chính xác 3 suất khoán")

        db_approved_b = self.db.execute(
            text("""
                select count(*) from public.work_pay_entitlements
                where employee_id = :eid and status = 'approved' and approved_by = :uid
            """),
            {"eid": self.emp_b_id, "uid": self.director_user_id},
        ).scalar()
        self.assertEqual(db_approved_b, 3, "DB phải ghi nhận đúng 3 dòng approved cho Anh B")

        ledger_b_post = get_employee_ledger(department_id=None, employee_id=self.emp_b_id, year=now.year, month=now.month, db=self.db, user=director_user)
        self.assertEqual(ledger_b_post["data"]["summary"]["pending_record_total"], 0.0)
        self.assertEqual(ledger_b_post["data"]["summary"]["approved_salary"], 1500000.0)
        self.assertEqual(ledger_b_post["data"]["summary"]["recorded_total"], 1500000.0)
        self.assertEqual(ledger_b_post["data"]["summary"]["approved_count"], 3)

        # ── 4. TÍNH IDEMPOTENT: CHỐT LẠI LẦN 2 ──
        close_res_a_repeat = close_employee_period(
            payload=ClosePeriodIn(employee_id=self.emp_a_id, year=now.year, month=now.month),
            db=self.db,
            user=director_user,
        )
        self.assertEqual(close_res_a_repeat["status"], "success")
        self.assertEqual(close_res_a_repeat["data"]["approved_count"], 0, "Chốt lần 2 phải ra 0 bản ghi mới, không được lặp")

        close_res_b_repeat = close_employee_period(
            payload=ClosePeriodIn(employee_id=self.emp_b_id, year=now.year, month=now.month),
            db=self.db,
            user=director_user,
        )
        self.assertEqual(close_res_b_repeat["status"], "success")
        self.assertEqual(close_res_b_repeat["data"]["approved_count"], 0, "Chốt lần 2 phải ra 0 bản ghi mới cho Anh B")

        # Kiểm tra tiền tuyệt đối không bị nhân đôi
        ledger_a_final = get_employee_ledger(department_id=None, employee_id=self.emp_a_id, year=now.year, month=now.month, db=self.db, user=director_user)
        self.assertEqual(ledger_a_final["data"]["summary"]["approved_salary"], 2000000.0, "Tiền Anh A vẫn là 2.000.000 VNĐ, không bị double")

        ledger_b_final = get_employee_ledger(department_id=None, employee_id=self.emp_b_id, year=now.year, month=now.month, db=self.db, user=director_user)
        self.assertEqual(ledger_b_final["data"]["summary"]["approved_salary"], 1500000.0, "Tiền Anh B vẫn là 1.500.000 VNĐ, không bị double")

        # Tổng chi phí công ty cho 7 node:
        total_payroll = (
            ledger_a_final["data"]["summary"]["approved_salary"]
            + ledger_b_final["data"]["summary"]["approved_salary"]
        )
        self.assertEqual(total_payroll, 3500000.0, "Tổng chi phí hợp đồng toàn công ty đúng tuyệt đối 3.500.000 VNĐ")


if __name__ == "__main__":
    unittest.main()
