"""Nhận trọn cụm — chạy trên DB thật, tự dựng dữ liệu rồi rollback.

Đo vẽ đi [K02 → K03 → K05a], Pháp lý đi [K01 → K04 → K05b → K06 → K07]. Bắt nhân
viên quay lại bể việc giành từng bước là mời người khác chen vào giữa chuỗi của
họ — hồ sơ đổi tay ba lần giữa đường.

Hai điều phải giữ, và cả hai đều dễ hỏng ngầm:

* **Nhận không phải là bắt đầu.** Gán 5 bước một lúc vẫn hợp lệ vì cả 5 nằm yên.
  Bước nào tự chạy là vỡ luật đơn nhiệm ngay tại lúc gán.
* **Không ai được ôm nửa cụm.** Vướng một bước thì cả cụm lùi.
"""

import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import build_test_context, create_test_user, get_missing_documents


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class ClaimClusterTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))
        if not self.db.execute(text("""
            select 1 from information_schema.columns
            where table_schema='public' and table_name='workflow_nodes'
              and column_name='cluster_code'
        """)).first():
            self.db.close()
            self.skipTest("Migration A chưa lên trên DB này")

        self.db.execute(
            text("""
                insert into public.workflow_nodes
                    (code, name, allowed_departments, default_roles, cluster_code)
                values
                    ('K01', 'Tiếp nhận', array['SALES', 'LEGAL', 'SURVEY'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('K02', 'Đo hiện trường', array['SURVEY'], array['MAIN', 'ASSISTANT'], 'SURVEY_TECH'),
                    ('K03', 'Chuẩn hoá', array['SURVEY'], array['MAIN'], 'SURVEY_TECH'),
                    ('K04', 'Soạn hồ sơ', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('K05a', 'Nộp hồ sơ', array['SURVEY'], array['SUBMITTER'], 'SURVEY_TECH'),
                    ('K05b', 'Nộp & theo dõi hồ sơ', array['LEGAL'], array['SUBMITTER'], 'LEGAL_DOSSIER'),
                    ('K06', 'Bàn giao', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('K07', 'Hoàn tất', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER')
                on conflict (code) do update set
                    allowed_departments = excluded.allowed_departments,
                    default_roles = excluded.default_roles,
                    cluster_code = excluded.cluster_code
            """)
        )

        from src.contracts import workflow_runtime

        self.wr = workflow_runtime
        self.wr.refresh_node_config(self.db, force=True)

        context = build_test_context(self.db, item_count=1)
        self.service_line_id = context["hang_muc"][0]["id"]
        self.user_id = create_test_user(self.db)
        self.instance_id = self._workflow_instance()

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.wr.clear_node_config()

    # ── dựng bối cảnh ──

    def _workflow_instance(self):
        instance_id = _id("WI")
        self.db.execute(
            text("insert into public.workflow_instances (id, service_line_id, status)"
                 " values (:id, :sl, 'running')"),
            {"id": instance_id, "sl": self.service_line_id},
        )
        self.revision_id = _id("REV")
        self.db.execute(
            text("insert into public.workflow_instance_revisions"
                 " (id, workflow_instance_id, revision_no, graph)"
                 " values (:id, :wi, 1, cast('{\"nodes\": {}}' as jsonb))"),
            {"id": self.revision_id, "wi": instance_id},
        )
        return instance_id

    def _node(self, node_code, *, status="pending"):
        node_id = _id("TN")
        self.db.execute(
            text("""
                insert into public.task_nodes
                    (id, workflow_instance_id, defined_by_revision_id, node_key, node_code, status)
                values (:id, :wi, :rev, :key, :code, :status)
            """),
            {"id": node_id, "wi": self.instance_id, "rev": self.revision_id,
             "key": node_code.lower(), "code": node_code, "status": status},
        )
        return node_id

    def _employee(self, department_code, *, name="Nhân viên thử"):
        department_id = self.db.execute(
            text("select id from public.departments where code = :c"),
            {"c": department_code},
        ).scalar()
        if not department_id:
            department_id = _id("D")
            self.db.execute(
                text("insert into public.departments (id, code, name) values (:id, :c, :c)"),
                {"id": department_id, "c": department_code},
            )
        employee_id = _id("E")
        self.db.execute(
            text("insert into public.employees (id, full_name, department_id, is_active)"
                 " values (:id, :n, :d, true)"),
            {"id": employee_id, "n": name, "d": department_id},
        )
        return employee_id

    def _survey_cluster(self):
        return {code: self._node(code, status="ready" if code == "K02" else "pending")
                for code in ("K02", "K03", "K05a")}

    def _assignments(self, node_id):
        return [dict(row) for row in self.db.execute(
            text("""
                select employee_id, role_code, assignment_status
                from public.task_node_assignments
                where task_node_id = :n and assignment_status in ('proposed','assigned','accepted')
            """),
            {"n": node_id},
        ).mappings().all()]

    def _status(self, node_id):
        return self.db.execute(
            text("select status from public.task_nodes where id = :i"), {"i": node_id}
        ).scalar_one()

    def _claim(self, employee_id, cluster_code="SURVEY_TECH"):
        return self.wr.claim_cluster(
            self.db,
            workflow_instance_id=self.instance_id,
            cluster_code=cluster_code,
            employee_id=employee_id,
            actor_id=self.user_id,
        )

    # ── test ──

    def test_claiming_the_survey_cluster_assigns_all_three_of_its_nodes(self):
        nodes = self._survey_cluster()
        employee_id = self._employee("SURVEY")

        result = self._claim(employee_id)

        self.assertEqual(
            sorted(item["node_code"] for item in result["claimed"]),
            ["K02", "K03", "K05a"],
        )
        for node_id in nodes.values():
            holders = [row["employee_id"] for row in self._assignments(node_id)]
            self.assertEqual(holders, [employee_id])

    def test_no_node_starts_running_when_a_cluster_is_claimed(self):
        nodes = self._survey_cluster()
        employee_id = self._employee("SURVEY")

        result = self._claim(employee_id)

        # Đây là điều kiện để luật nhận-cụm và luật đơn nhiệm sống chung. Một
        # bước tự chạy ở đây là hỏng cả hai luật cùng lúc.
        self.assertFalse(result["started_any"])
        for node_id in nodes.values():
            self.assertNotEqual(self._status(node_id), "in_progress")

    def test_a_node_not_yet_due_keeps_its_status_but_gets_an_owner(self):
        nodes = self._survey_cluster()
        employee_id = self._employee("SURVEY")

        self._claim(employee_id)

        # K03 chưa tới lượt: vẫn 'pending', nhưng đã có chủ. Đẩy nó sang 'ready'
        # là cho phép bắt đầu một bước mà bước trước chưa xong.
        self.assertEqual(self._status(nodes["K03"]), "pending")
        self.assertEqual(self._status(nodes["K02"]), "ready")
        self.assertEqual(len(self._assignments(nodes["K03"])), 1)

    def test_a_node_taken_by_someone_else_blocks_the_whole_cluster(self):
        nodes = self._survey_cluster()
        first = self._employee("SURVEY", name="Người tới trước")
        second = self._employee("SURVEY", name="Người tới sau")
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, assignment_status)
                values (:n, :e, 'MAIN', 'assigned')
            """),
            {"n": nodes["K03"], "e": first},
        )

        with self.assertRaises(Exception) as caught:
            self._claim(second)
        self.assertIn("K03", str(caught.exception))

    def test_nobody_ends_up_holding_half_a_cluster(self):
        nodes = self._survey_cluster()
        first = self._employee("SURVEY", name="Người tới trước")
        second = self._employee("SURVEY", name="Người tới sau")
        # K05a bị giữ. Khoá theo thứ tự mã bước nên K02 và K03 gán xong rồi mới
        # vấp — đúng cái ca sinh ra nửa cụm nếu không có giao dịch bao ngoài.
        self.db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, assignment_status)
                values (:n, :e, 'SUBMITTER', 'assigned')
            """),
            {"n": nodes["K05a"], "e": first},
        )

        # Savepoint chứ KHÔNG rollback cả phiên: rollback thẳng sẽ cuốn theo dữ
        # liệu dựng ở setUp, và phép kiểm bên dưới chạy trên bảng rỗng — pass vu
        # vơ mà không chứng minh được gì.
        #
        # Savepoint chính là thứ đứng thay cho giao dịch của route thật: hàm
        # claim_cluster không tự lùi, nó ném lỗi và để biên giao dịch lùi hộ.
        savepoint = self.db.begin_nested()
        with self.assertRaises(Exception):
            self._claim(second)
        savepoint.rollback()

        # Dữ liệu setUp phải còn nguyên, nếu không phép kiểm dưới lại vô nghĩa.
        self.assertEqual(self._status(nodes["K02"]), "ready")

        for code in ("K02", "K03"):
            holders = [row["employee_id"] for row in self._assignments(nodes[code])]
            self.assertNotIn(second, holders, f"{code} còn dính người nhận hụt")

    def test_a_node_belonging_to_another_department_is_refused(self):
        self._survey_cluster()
        employee_id = self._employee("LEGAL")

        with self.assertRaises(Exception) as caught:
            self._claim(employee_id)
        self.assertIn("phòng khác", str(caught.exception))

    def test_claiming_the_same_cluster_twice_does_not_duplicate_assignments(self):
        nodes = self._survey_cluster()
        employee_id = self._employee("SURVEY")

        self._claim(employee_id)
        with self.assertRaises(Exception):
            # Không còn bước nào để nhận — báo rõ chứ không im lặng gán chồng.
            self._claim(employee_id)

        for node_id in nodes.values():
            self.assertEqual(len(self._assignments(node_id)), 1)

    def test_k05a_is_claimed_as_submitter_not_as_main(self):
        nodes = self._survey_cluster()
        employee_id = self._employee("SURVEY")

        result = self._claim(employee_id)

        roles = {item["node_code"]: item["role_code"] for item in result["claimed"]}
        # K05a khai đúng một vai trò là SUBMITTER. Gán MAIN vào đó là dựng ra một
        # suất không tồn tại, và người nhận sẽ không nộp nghiệm thu được.
        self.assertEqual(roles["K05a"], "SUBMITTER")
        self.assertEqual(roles["K02"], "MAIN")

    def test_the_assistant_slot_on_k02_is_left_for_someone_else(self):
        nodes = self._survey_cluster()
        employee_id = self._employee("SURVEY")

        self._claim(employee_id)

        # Người nhận cả cụm đứng vai chính. Ôm luôn suất thợ phụ là lấy mất việc
        # — và tiền — của người thứ hai vốn được thiết kế để cùng ra hiện trường.
        roles = [row["role_code"] for row in self._assignments(nodes["K02"])]
        self.assertEqual(roles, ["MAIN"])

    def test_an_empty_cluster_code_is_refused(self):
        self._survey_cluster()
        employee_id = self._employee("SURVEY")

        with self.assertRaises(Exception):
            self._claim(employee_id, cluster_code="   ")

    def test_a_cluster_with_no_nodes_here_says_so(self):
        self._survey_cluster()
        employee_id = self._employee("LEGAL")

        with self.assertRaises(Exception) as caught:
            self._claim(employee_id, cluster_code="LEGAL_DOSSIER")
        self.assertIn("không còn bước nào", str(caught.exception))
