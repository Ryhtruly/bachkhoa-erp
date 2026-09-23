"""Kiểm thử toàn diện Cơ chế Chuyền Gậy (Relay Race Flow) giữa các phòng ban.

Kịch bản chuẩn: Quy trình 7 Node:
- Node 1: N01 - Tiếp nhận & Khảo sát       (SURVEY - Đo vẽ)
- Node 2: N02 - Đo đạc hiện trường          (SURVEY - Đo vẽ)
- Node 3: N03 - Soạn thảo hồ sơ             (LEGAL  - Pháp lý)
- Node 4: N04 - Thẩm tra pháp lý            (LEGAL  - Pháp lý)
- Node 5: N05 - Nộp & Xử lý hồ sơ           (LEGAL  - Pháp lý)
- Node 6: N06 - Cập nhật biến động bản đồ   (SURVEY - Đo vẽ)
- Node 7: N07 - Nghiệm thu hoàn tất         (SURVEY - Đo vẽ)

Chuỗi chuyển bước:
N01 -> N02 -> N03 -> N04 -> N05 -> N06 -> N07
"""

import json
import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_document_register import build_test_context, create_test_user, get_missing_documents


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class RelayRaceFlowTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal
        from src.contracts import workflow_runtime

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        self.wr = workflow_runtime

        # Khởi tạo danh mục các workflow_nodes
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
        self.director_user_id = create_test_user(self.db)

        # Tạo nhân viên A (Đo vẽ) và nhân viên B (Pháp lý)
        self.user_a_id = create_test_user(self.db)
        self.user_b_id = create_test_user(self.db)
        self.emp_a_id = self._employee("SURVEY", name="Anh A Đo Vẽ", user_id=self.user_a_id)
        self.emp_b_id = self._employee("LEGAL", name="Anh B Pháp Lý", user_id=self.user_b_id)

        # Dựng quy trình 7 node
        self.instance_id, self.node_ids = self._setup_7_node_workflow()

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.wr.clear_node_config()

    # ── Helpers dựng dữ liệu ──

    def _employee(self, department_code, *, name="Nhân viên thử", user_id=None):
        dept_name = "Phòng Đo vẽ" if department_code == "SURVEY" else "Phòng Pháp lý"
        department_id = self.db.execute(
            text("select id from public.departments where code = :c"),
            {"c": department_code},
        ).scalar()
        if not department_id:
            department_id = _id("D")
            self.db.execute(
                text("insert into public.departments (id, code, name) values (:id, :c, :n)"),
                {"id": department_id, "c": department_code, "n": dept_name},
            )
        employee_id = _id("E")
        self.db.execute(
            text("""
                insert into public.employees (id, full_name, department_id, is_active, user_id)
                values (:id, :n, :d, true, :u)
            """),
            {"id": employee_id, "n": name, "d": department_id, "u": user_id},
        )
        return employee_id

    def _setup_7_node_workflow(self):
        instance_id = _id("WI")
        self.db.execute(
            text("insert into public.workflow_instances (id, service_line_id, status)"
                 " values (:id, :sl, 'running')"),
            {"id": instance_id, "sl": self.service_line_id},
        )
        revision_id = _id("REV")

        # Định nghĩa graph 7 node tuần tự
        graph_nodes = {
            "n01": {
                "name": "Tiếp nhận & Khảo sát",
                "pool_department_codes": ["SURVEY"],
                "claim_roles": ["MAIN"],
                "transitions": {"done": "n02"},
            },
            "n02": {
                "name": "Đo đạc hiện trường",
                "pool_department_codes": ["SURVEY"],
                "claim_roles": ["MAIN"],
                "transitions": {"done": "n03"},
            },
            "n03": {
                "name": "Soạn thảo hồ sơ",
                "pool_department_codes": ["LEGAL"],
                "claim_roles": ["MAIN"],
                "transitions": {"done": "n04"},
            },
            "n04": {
                "name": "Thẩm tra pháp lý",
                "pool_department_codes": ["LEGAL"],
                "claim_roles": ["MAIN"],
                "transitions": {"done": "n05"},
            },
            "n05": {
                "name": "Nộp & Xử lý hồ sơ",
                "pool_department_codes": ["LEGAL"],
                "claim_roles": ["MAIN"],
                "transitions": {"done": "n06"},
            },
            "n06": {
                "name": "Cập nhật biến động bản đồ",
                "pool_department_codes": ["SURVEY"],
                "claim_roles": ["MAIN"],
                "transitions": {"done": "n07"},
            },
            "n07": {
                "name": "Nghiệm thu hoàn tất",
                "pool_department_codes": ["SURVEY"],
                "claim_roles": ["MAIN"],
                "transitions": {},
            },
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
        for index, (code, key) in enumerate(node_codes):
            nid = _id("TN")
            status = "ready" if index == 0 else "pending"
            self.db.execute(
                text("""
                    insert into public.task_nodes
                        (id, workflow_instance_id, defined_by_revision_id, node_key, node_code, status, occurrence_no)
                    values (:id, :wi, :rev, :key, :code, :status, 1)
                """),
                {"id": nid, "wi": instance_id, "rev": revision_id,
                 "key": key, "code": code, "status": status},
            )
            node_ids[code] = nid

        return instance_id, node_ids

    def _get_node_status(self, node_id):
        return self.db.execute(
            text("select status from public.task_nodes where id = :id"), {"id": node_id}
        ).scalar()

    def _get_assignments(self, node_id):
        return [dict(r) for r in self.db.execute(
            text("""
                select a.id, a.employee_id, a.role_code, a.assignment_status
                from public.task_node_assignments a
                where a.task_node_id = :nid
                  and a.assignment_status in ('proposed', 'assigned', 'accepted')
            """),
            {"nid": node_id},
        ).mappings().all()]

    def test_complete_7_node_relay_race_flow(self):
        """Kiểm thử trọn vẹn chuỗi 7 bước chuyền gậy:
        1, 2 Đo vẽ -> 3, 4, 5 Pháp lý -> 6, 7 Đo vẽ.
        """
        from src.employee_portal.service import EmployeePortalService, _held_items
        from src.routes.routes_notifications import _EMPLOYEE_NODE_TODO_QUERY
        from src.db.models import Employee

        emp_a = self.db.query(Employee).filter(Employee.id == self.emp_a_id).first()
        emp_b = self.db.query(Employee).filter(Employee.id == self.emp_b_id).first()

        # =====================================================================
        # BƯỚC 1: Kiểm tra Bể việc ban đầu
        # =====================================================================
        # Anh A (Đo vẽ) thấy hạng mục trên bể việc
        pool_a = EmployeePortalService.get_task_pool(self.db, emp_a)
        items_a = [i for i in pool_a.get("items", []) if i.get("id") == self.node_ids["N01"] or i.get("workflow_instance_id") == self.instance_id]
        self.assertEqual(len(items_a), 1, "Anh A phải thấy 1 hạng mục trong Bể việc Đo vẽ")
        item_a = items_a[0]
        self.assertEqual(item_a["id"], self.node_ids["N01"])

        # Chuỗi trên thẻ Bể việc của Anh A: phải hiện đủ 7 node
        chain_a = item_a.get("chain_nodes", [])
        self.assertEqual(len(chain_a), 7, "Thẻ Bể việc phải hiện đủ 7 node trong chuỗi")

        # Kiểm tra phân định phòng ban trên chuỗi:
        # Nodes 1, 2, 6, 7 là phòng mình (SURVEY)
        for code in ("N01", "N02", "N06", "N07"):
            c_node = next(n for n in chain_a if n["node_code"] == code)
            self.assertTrue(c_node["is_my_department"], f"Node {code} phải là is_my_department=True với Anh A")
            self.assertEqual(c_node["department_code"], "SURVEY")

        # Nodes 3, 4, 5 là phòng Pháp lý (is_my_department=False)
        for code in ("N03", "N04", "N05"):
            c_node = next(n for n in chain_a if n["node_code"] == code)
            self.assertFalse(c_node["is_my_department"], f"Node {code} phải là is_my_department=False với Anh A")
            self.assertEqual(c_node["department_code"], "LEGAL")
            self.assertIn("Pháp lý", c_node["department_name"])

        # Anh B (Pháp lý) vào Bể việc: CHƯA CÓ GÌ vì N03 đang pending
        pool_b = EmployeePortalService.get_task_pool(self.db, emp_b)
        items_b = [i for i in pool_b.get("items", []) if i.get("workflow_instance_id") == self.instance_id]
        self.assertEqual(len(items_b), 0, "Bể việc của Pháp lý phải trống khi chưa tới lượt")

        # =====================================================================
        # BƯỚC 2: Anh A bấm nhận Node 1
        # =====================================================================
        claim_result = self.wr.claim_and_start_task(
            self.db,
            task_node_id=self.node_ids["N01"],
            employee_id=self.emp_a_id,
            role_code="MAIN",
            actor_id=self.user_a_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N01"]), "in_progress")

        # Cơ chế chain reservation: chỉ giữ trước các node cùng phòng SURVEY (N02, N06, N07)
        reserved_ids = claim_result.get("reserved_task_node_ids", [])
        self.assertIn(self.node_ids["N02"], reserved_ids)
        self.assertIn(self.node_ids["N06"], reserved_ids)
        self.assertIn(self.node_ids["N07"], reserved_ids)

        # Các node Pháp lý N03, N04, N05 TUYỆT ĐỐI KHÔNG được phân công cho Anh A
        for code in ("N03", "N04", "N05"):
            self.assertNotIn(self.node_ids[code], reserved_ids)
            assigns = self._get_assignments(self.node_ids[code])
            self.assertEqual(len(assigns), 0, f"Node {code} của Pháp lý không được có ai nhận trước")

        # Mở không gian làm việc của Anh A (Held items)
        held_a = _held_items(self.db, self.emp_a_id)
        self.assertEqual(len(held_a), 1, "Anh A đang giữ 1 hạng mục")
        held_item_a = held_a[0]
        self.assertEqual(held_item_a["current_task_node_id"], self.node_ids["N01"])
        self.assertEqual(held_item_a["current_node_status"], "in_progress")

        # Kiểm tra danh sách 7 node trong workspace của Anh A:
        # N03, N04, N05 có is_my_department=False và department_name='Pháp lý'
        for n in held_item_a["nodes"]:
            if n["node_code"] in ("N03", "N04", "N05"):
                self.assertFalse(n["is_my_department"], f"Node {n['node_code']} phải hiển thị là cấm/thuộc Pháp lý")
                self.assertIn("Pháp lý", n["department_name"])

        # =====================================================================
        # BƯỚC 3: Anh A hoàn thành Node 1 và Node 2
        # =====================================================================
        # Nộp và nghiệm thu Node 1
        sub_1 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N01"], employee_id=self.emp_a_id, actor_id=self.user_a_id, note="Hoàn thành N01"
        )
        self.wr.review_task_node_acceptance(
            self.db,
            acceptance_id=sub_1["acceptance_id"],
            decision="accepted",
            outcome="done",
            review_note="Duyệt N01",
            actor_id=self.director_user_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N01"]), "accepted")
        self.assertEqual(self._get_node_status(self.node_ids["N02"]), "ready")

        # Anh A bắt đầu và hoàn thành Node 2
        self.wr.start_task_node(
            self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_a_id, actor_id=self.user_a_id
        )
        sub_2 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_a_id, actor_id=self.user_a_id, note="Hoàn thành N02"
        )
        self.wr.review_task_node_acceptance(
            self.db,
            acceptance_id=sub_2["acceptance_id"],
            decision="accepted",
            outcome="done",
            review_note="Duyệt N02",
            actor_id=self.director_user_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N02"]), "accepted")

        # =====================================================================
        # BƯỚC 4: Chuyền gậy sang Pháp lý ngay sau khi N02 xong
        # =====================================================================
        # Node 3 của Pháp lý đã tự động chuyển sang 'ready'!
        self.assertEqual(self._get_node_status(self.node_ids["N03"]), "ready")

        # 4.1. Bể việc Pháp lý của Anh B: Cụm 3, 4, 5 NGAY LẬP TỨC xuất hiện!
        pool_b_after_2 = EmployeePortalService.get_task_pool(self.db, emp_b)
        self.assertEqual(len(pool_b_after_2.get("items", [])), 1, "Cụm Pháp lý phải hiện lên Bể việc cho Anh B")
        item_b = pool_b_after_2["items"][0]
        items_b = [i for i in pool_b_after_2.get("items", []) if i.get("id") == self.node_ids["N03"] or i.get("workflow_instance_id") == self.instance_id]
        self.assertEqual(len(items_b), 1, "Cụm Pháp lý phải hiện lên Bể việc cho Anh B")
        item_b = items_b[0]
        self.assertEqual(item_b["id"], self.node_ids["N03"])
        self.assertIn("MAIN", item_b["available_roles"])

        # 4.2. Thẻ của Anh A ở mục 'Việc đang làm': Vẫn giữ nguyên thẻ quy trình!
        held_a_waiting = _held_items(self.db, self.emp_a_id)
        held_a_waiting = [i for i in _held_items(self.db, self.emp_a_id) if i.get("workflow_instance_id") == self.instance_id]
        self.assertEqual(len(held_a_waiting), 1, "Anh A vẫn phải giữ nguyên thẻ quy trình đã nhận")
        ha_wait = held_a_waiting[0]
        # Node tiếp theo của Anh A là N06 (vì N01, N02 đã accepted)
        self.assertEqual(ha_wait["current_node_code"], "N06")
        self.assertEqual(ha_wait["current_node_status"], "pending")
        # Trên UI: waiting = (current_node_status === 'pending') -> '● Chờ tới lượt'

        # =====================================================================
        # BƯỚC 5: Anh B nhận Node 3 từ Bể việc Pháp lý
        # =====================================================================
        claim_b_result = self.wr.claim_and_start_task(
            self.db,
            task_node_id=self.node_ids["N03"],
            employee_id=self.emp_b_id,
            role_code="MAIN",
            actor_id=self.user_b_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N03"]), "in_progress")

        # Chain reservation cho Anh B: giữ trước N04 và N05
        reserved_b = claim_b_result.get("reserved_task_node_ids", [])
        self.assertIn(self.node_ids["N04"], reserved_b)
        self.assertIn(self.node_ids["N05"], reserved_b)

        # Node 6 và 7 VẪN THUỘC VỀ Anh A, không bị cướp hay thay đổi
        assigns_6 = self._get_assignments(self.node_ids["N06"])
        self.assertEqual(assigns_6[0]["employee_id"], self.emp_a_id)
        assigns_7 = self._get_assignments(self.node_ids["N07"])
        self.assertEqual(assigns_7[0]["employee_id"], self.emp_a_id)

        # =====================================================================
        # BƯỚC 6: Anh B hoàn thành chuỗi Pháp lý (N03, N04, N05)
        # =====================================================================
        # Nộp và duyệt N03
        sub_3 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_b_id, actor_id=self.user_b_id, note="Hoàn thành N03"
        )
        self.wr.review_task_node_acceptance(
            self.db,
            acceptance_id=sub_3["acceptance_id"],
            decision="accepted",
            outcome="done",
            review_note="Duyệt N03",
            actor_id=self.director_user_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N04"]), "ready")

        # Bắt đầu, nộp và duyệt N04
        self.wr.start_task_node(
            self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_b_id, actor_id=self.user_b_id
        )
        sub_4 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_b_id, actor_id=self.user_b_id, note="Hoàn thành N04"
        )
        self.wr.review_task_node_acceptance(
            self.db,
            acceptance_id=sub_4["acceptance_id"],
            decision="accepted",
            outcome="done",
            review_note="Duyệt N04",
            actor_id=self.director_user_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N05"]), "ready")

        # Bắt đầu, nộp và duyệt N05
        self.wr.start_task_node(
            self.db, task_node_id=self.node_ids["N05"], employee_id=self.emp_b_id, actor_id=self.user_b_id
        )
        sub_5 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N05"], employee_id=self.emp_b_id, actor_id=self.user_b_id, note="Hoàn thành N05"
        )
        self.wr.review_task_node_acceptance(
            self.db,
            acceptance_id=sub_5["acceptance_id"],
            decision="accepted",
            outcome="done",
            review_note="Duyệt N05",
            actor_id=self.director_user_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N05"]), "accepted")

        # =====================================================================
        # BƯỚC 7: Chuyền gậy ngược lại cho Anh A (N06, N07)
        # =====================================================================
        # Ngay sau khi N05 duyệt: N06 tự động chuyển sang 'ready'!
        self.assertEqual(self._get_node_status(self.node_ids["N06"]), "ready")

        # 7.1. Thông báo cho Anh A làm bước 6
        todo_for_a = self.db.execute(
            _EMPLOYEE_NODE_TODO_QUERY, {"employee_id": self.emp_a_id}
        ).mappings().all()
        a_todo_nodes = [t["task_node_id"] for t in todo_for_a]
        self.assertIn(self.node_ids["N06"], a_todo_nodes, "Anh A phải có thông báo làm Node N06")

        # 7.2. Thẻ của Anh A ở Held Items: Node N06 đã 'ready' -> UI chuyển sang '● Sẵn sàng làm'
        held_a_ready = _held_items(self.db, self.emp_a_id)
        held_a_ready = [i for i in _held_items(self.db, self.emp_a_id) if i.get("workflow_instance_id") == self.instance_id]
        self.assertEqual(len(held_a_ready), 1)
        ha_ready = held_a_ready[0]
        self.assertEqual(ha_ready["current_node_code"], "N06")
        self.assertEqual(ha_ready["current_node_status"], "ready")
        # Trên UI: waiting = (current_node_status === 'pending') -> False -> '● Sẵn sàng làm'!

        # 7.3. Anh A tiếp tục hoàn thành N06 và N07
        self.wr.start_task_node(
            self.db, task_node_id=self.node_ids["N06"], employee_id=self.emp_a_id, actor_id=self.user_a_id
        )
        sub_6 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N06"], employee_id=self.emp_a_id, actor_id=self.user_a_id, note="Hoàn thành N06"
        )
        self.wr.review_task_node_acceptance(
            self.db,
            acceptance_id=sub_6["acceptance_id"],
            decision="accepted",
            outcome="done",
            review_note="Duyệt N06",
            actor_id=self.director_user_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N06"]), "accepted")
        self.assertEqual(self._get_node_status(self.node_ids["N07"]), "ready")

        # Làm nốt N07
        self.wr.start_task_node(
            self.db, task_node_id=self.node_ids["N07"], employee_id=self.emp_a_id, actor_id=self.user_a_id
        )
        sub_7 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N07"], employee_id=self.emp_a_id, actor_id=self.user_a_id, note="Hoàn thành N07"
        )
        self.wr.review_task_node_acceptance(
            self.db,
            acceptance_id=sub_7["acceptance_id"],
            decision="accepted",
            outcome="done",
            review_note="Duyệt N07",
            actor_id=self.director_user_id,
        )
        self.assertEqual(self._get_node_status(self.node_ids["N07"]), "accepted")

        # Toàn bộ quy trình 7 node hoàn tất toàn vẹn!
        wf_status = self.db.execute(
            text("select status from public.workflow_instances where id = :id"),
            {"id": self.instance_id},
        ).scalar()
        self.assertEqual(wf_status, "completed", "Quy trình phải hoàn tất 'completed' sau khi kết thúc 7 bước chuyền gậy")


if __name__ == "__main__":
    unittest.main()
