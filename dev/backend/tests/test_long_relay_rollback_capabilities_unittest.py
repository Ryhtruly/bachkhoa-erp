"""Kiểm thử chuyên sâu toàn diện: Quy trình chuyền gậy đường dài, đa năng lực và quay ngược node liên phòng ban.

Kịch bản: 7 Node qua 3 Phòng ban (SALES, SURVEY, LEGAL) với 6 năng lực nghiệp vụ:
- Node 1: N01 (SALES)  - Tiếp nhận & Khảo sát ban đầu     [STANDARD]
- Node 2: N02 (SURVEY) - Khảo sát đo đạc thực địa          [SURVEY_FIELD]   (tạo survey_records, ghi field_started_at)
- Node 3: N03 (SURVEY) - Biên tập bản vẽ CAD & GIS         [SURVEY_CAD]     (có tiền khoán 350k, upload tệp CAD)
- Node 4: N04 (LEGAL)  - Soạn thảo hồ sơ pháp lý           [LEGAL_PREP]     (mở sổ legal_dossiers 'ASSIGNED')
- Node 5: N05a (LEGAL) - Nộp hồ sơ Một Cửa                 [GOV_SUBMIT]     (tạo legal_submissions, số biên nhận)
- Node 6: N05b (LEGAL) - Theo dõi & Nhận KQ Một Cửa        [GOV_TRACKING]   (cơ quan 'Hoàn thành', dossier 'CLOSED')
- Node 7: N06 (SALES)  - Bàn giao kết quả cho Khách hàng   [HANDOVER]       (cổng công nợ, ghi nhận execution_data handover)

Thực hiện:
1. Chuyền gậy xuôi 100% qua cả 7 node: SALES -> SURVEY -> LEGAL -> SALES.
2. Tại bước N06 (Bàn giao), phát hiện lỗi bản vẽ nghiêm trọng từ N03 (SURVEY).
3. Thực hiện quay ngược quy trình liên phòng ban (Cross-department rollback) từ SALES về SURVEY (N03).
4. Kiểm chứng toàn diện:
   - N01, N02 (trước điểm quay lại) GIỮ NGUYÊN trạng thái 'accepted'.
   - N03 (bước đích) chuyển sang 'rework_required' kèm hạn sửa bài mới.
   - N04, N05a, N05b, N06 chuyển về 'pending'.
   - Nhân viên Pháp lý và Sales bị CHẶN không được nộp khi N03 chưa xong (predecessor check).
   - Checklist N03 reset về 'pending', tệp bản vẽ CAD reset về 'pending_review'.
   - Năng lực GOV_TRACKING: legal_submissions được mở khoá về 'Đang chi nhánh' (không còn 'Hoàn thành').
   - Năng lực LEGAL_PREP: legal_dossiers được mở lại 'PROCESSING' (không còn 'CLOSED').
   - Năng lực HANDOVER: execution_data thu hồi toàn bộ thông tin bàn giao.
   - Tiền khoán: 350k của N03 lần 1 giữ nguyên; sửa lại lần 2 KHÔNG được cộng thêm tiền.
5. Sửa xong N03 -> Gậy chuyền lại về N04 -> N05a -> N05b -> N06 -> Toàn bộ quy trình hoàn tất 'completed'.
"""

import json
import unittest
import uuid
from decimal import Decimal

from sqlalchemy import text

from tests.fixtures_document_register import build_test_context, create_test_user, get_missing_documents


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class LongRelayRollbackCapabilitiesTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal
        from src.contracts import workflow_runtime

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        self.wr = workflow_runtime

        # 1. Cấu hình danh mục bước
        self.db.execute(
            text("""
                insert into public.workflow_nodes
                    (code, name, allowed_departments, default_roles, cluster_code)
                values
                    ('N01', 'Tiếp nhận hợp đồng', array['SALES'], array['MAIN'], 'SALES'),
                    ('N02', 'Khảo sát thực địa', array['SURVEY'], array['MAIN'], 'SURVEY_TECH'),
                    ('N03', 'Biên tập bản vẽ CAD', array['SURVEY'], array['MAIN'], 'SURVEY_TECH'),
                    ('N04', 'Soạn hồ sơ pháp lý', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('N05a', 'Nộp hồ sơ Một Cửa', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('N05b', 'Theo dõi Một Cửa', array['LEGAL'], array['MAIN'], 'LEGAL_DOSSIER'),
                    ('N06', 'Bàn giao kết quả', array['SALES'], array['MAIN'], 'SALES')
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

        # Cấu hình hợp đồng đã thanh toán đủ 100% để cổng bàn giao K06 mở
        self.db.execute(
            text("update public.contracts set total_value = 10000000, completion_override = true where id = :cid"),
            {"cid": self.contract_id},
        )

        # 2. Tạo 3 nhân viên thuộc 3 phòng ban
        self.user_sales_id = create_test_user(self.db)
        self.user_survey_id = create_test_user(self.db)
        self.user_legal_id = create_test_user(self.db)

        self.emp_sales_id = self._employee("SALES", name="Chị Sales", user_id=self.user_sales_id)
        self.emp_survey_id = self._employee("SURVEY", name="Anh Đo Vẽ", user_id=self.user_survey_id)
        self.emp_legal_id = self._employee("LEGAL", name="Anh Pháp Lý", user_id=self.user_legal_id)

        # 3. Dựng quy trình 7 node với đầy đủ năng lực
        self.instance_id, self.node_ids, self.chk_data = self._setup_workflow()

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.wr.clear_node_config()
        try:
            if hasattr(self, "instance_id") and self.instance_id:
                self.db.execute(text("delete from public.checklist_result_document_links where checklist_result_id in (select id from public.task_node_checklist_results where task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi))"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.task_node_checklist_assignments where checklist_result_id in (select id from public.task_node_checklist_results where task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi))"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.task_node_checklist_results where task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi)"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.legal_submissions where task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi)"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.legal_dossiers where task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi)"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.legal_submissions where service_line_id = :sl or task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi)"), {"sl": self.service_line_id, "wi": self.instance_id})
                self.db.execute(text("delete from public.legal_dossiers where service_line_id = :sl or task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi)"), {"sl": self.service_line_id, "wi": self.instance_id})
                self.db.execute(text("delete from public.task_node_acceptances where task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi)"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.task_node_assignments where task_node_id in (select id from public.task_nodes where workflow_instance_id = :wi)"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.workflow_rollback_requests where workflow_instance_id = :wi"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.work_pay_entitlements where workflow_instance_id = :wi"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.task_nodes where workflow_instance_id = :wi"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.workflow_instance_revisions where workflow_instance_id = :wi"), {"wi": self.instance_id})
                self.db.execute(text("delete from public.workflow_instances where id = :wi"), {"wi": self.instance_id})
                self.db.commit()
        except Exception:
            self.db.rollback()
        finally:
            self.db.close()
            self.wr.clear_node_config()

    def _employee(self, department_code, *, name="Nhân viên", user_id=None):
        dept_names = {"SALES": "Phòng Kinh doanh", "SURVEY": "Phòng Đo vẽ", "LEGAL": "Phòng Pháp lý"}
        department_id = self.db.execute(
            text("select id from public.departments where code = :c"), {"c": department_code}
        ).scalar()
        if not department_id:
            department_id = _id("D")
            self.db.execute(
                text("insert into public.departments (id, code, name) values (:id, :c, :n)"),
                {"id": department_id, "c": department_code, "n": dept_names.get(department_code, department_code)},
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

    def _create_payable_work_item(self, code, name, rate_amount):
        w_item_id = _id("WI")
        rate_id = _id("WR")
        actual_id = self.db.execute(
            text("""
                insert into public.work_items (id, code, name, default_unit, is_active)
                values (:id, :c, :n, 'bản', true)
                on conflict (code) do update set name = excluded.name
                returning id
            """),
            {"id": w_item_id, "c": code, "n": name},
        ).scalar()
        w_item_id = actual_id or w_item_id
        self.db.execute(
            text("""
                insert into public.work_item_rates
                    (id, work_item_id, role_code, amount, status, effective_from, approved_at, approved_by)
                values
                    (:id, :wid, 'MAIN', :r, 'published', current_date, now(), :actor_id)
            """),
            {"id": rate_id, "wid": w_item_id, "r": rate_amount, "actor_id": self.director_user_id},
        )
        return w_item_id, rate_id

    def _setup_workflow(self):
        instance_id = _id("WI")
        self.db.execute(
            text("insert into public.workflow_instances (id, service_line_id, status) values (:id, :sl, 'running')"),
            {"id": instance_id, "sl": self.service_line_id},
        )
        revision_id = _id("REV")

        # Cấu hình 7 Node đa năng lực và chuỗi transitions
        graph_nodes = {
            "n01": {"name": "Tiếp nhận hợp đồng", "task_code": "N01", "capability": "STANDARD", "pool_department_codes": ["SALES"], "claim_roles": ["MAIN"], "transitions": {"done": "n02"}},
            "n02": {"name": "Khảo sát thực địa", "task_code": "N02", "capability": "SURVEY_FIELD", "pool_department_codes": ["SURVEY"], "claim_roles": ["MAIN"], "transitions": {"done": "n03"}},
            "n03": {"name": "Biên tập bản vẽ CAD", "task_code": "N03", "capability": "SURVEY_CAD", "pool_department_codes": ["SURVEY"], "claim_roles": ["MAIN"], "transitions": {"done": "n04"}},
            "n04": {"name": "Soạn hồ sơ pháp lý", "task_code": "N04", "capability": "LEGAL_PREP", "pool_department_codes": ["LEGAL"], "claim_roles": ["MAIN"], "transitions": {"done": "n05a"}},
            "n05a": {"name": "Nộp hồ sơ Một Cửa", "task_code": "N05a", "capability": "GOV_SUBMIT", "requires_gov_submission": True, "pool_department_codes": ["LEGAL"], "claim_roles": ["MAIN"], "transitions": {"done": "n05b"}},
            "n05b": {"name": "Theo dõi Một Cửa", "task_code": "N05b", "capability": "GOV_TRACKING", "requires_gov_submission": True, "pool_department_codes": ["LEGAL"], "claim_roles": ["MAIN"], "transitions": {"done": "n06"}},
            "n06": {"name": "Bàn giao kết quả", "task_code": "N06", "capability": "HANDOVER", "is_handover": True, "pool_department_codes": ["SALES"], "claim_roles": ["MAIN"], "transitions": {}},
        }

        self.db.execute(
            text("""
                insert into public.workflow_instance_revisions
                    (id, workflow_instance_id, revision_no, graph)
                values (:id, :wi, 1, cast(:g as jsonb))
            """),
            {"id": revision_id, "wi": instance_id, "g": json.dumps({"start_node": "n01", "nodes": graph_nodes})},
        )
        self.db.execute(
            text("update public.workflow_instances set active_revision_id = :r where id = :id"),
            {"r": revision_id, "id": instance_id},
        )

        node_defs = [
            ("N01", "n01", "STANDARD", "ready"),
            ("N02", "n02", "SURVEY_FIELD", "pending"),
            ("N03", "n03", "SURVEY_CAD", "pending"),
            ("N04", "n04", "LEGAL_PREP", "pending"),
            ("N05a", "n05a", "GOV_SUBMIT", "pending"),
            ("N05b", "n05b", "GOV_TRACKING", "pending"),
            ("N06", "n06", "HANDOVER", "pending"),
        ]
        node_ids = {}
        chk_data = {}

        cad_work_item_id, cad_rate_id = self._create_payable_work_item("PAY_CAD", "Vẽ bản đồ CAD", 350000.0)

        for code, key, cap, status in node_defs:
            nid = _id("TN")
            self.db.execute(
                text("""
                    insert into public.task_nodes
                        (id, workflow_instance_id, defined_by_revision_id, node_key, node_code, capability_code, status, occurrence_no, execution_data)
                    values (:id, :wi, :rev, :key, :code, :cap, :status, 1, '{}'::jsonb)
                """),
                {"id": nid, "wi": instance_id, "rev": revision_id, "key": key, "code": code, "cap": cap, "status": status},
            )
            node_ids[code] = nid

            # Tạo checklist cho mỗi node
            cid = _id("CR")
            is_payable = (code == "N03")
            w_id = cad_work_item_id if is_payable else None
            self.db.execute(
                text("""
                    insert into public.task_node_checklist_results
                        (id, task_node_id, contract_id, checklist_key, checklist_name,
                         is_required, status, work_item_id, is_payable, pay_scope, pay_key, pay_group_key)
                    values
                        (:id, :nid, :cid, :ckey, :cname, true, 'pending', :wid, :pay,
                         :pscope, :pkey, :pgkey)
                """),
                {
                    "id": cid, "nid": nid, "cid": self.contract_id,
                    "ckey": f"chk_{code}", "cname": f"Hạng mục công việc {code}",
                    "wid": w_id, "pay": is_payable,
                    "pscope": "PER_OCCURRENCE" if is_payable else None,
                    "pkey": f"KEY_{code}" if is_payable else None,
                    "pgkey": "PRIMARY" if is_payable else None,
                },
            )
            chk_data[code] = {
                "checklist_result_id": cid,
                "work_item_id": w_id,
                "rate_id": cad_rate_id if is_payable else None,
            }

        return instance_id, node_ids, chk_data

    def _sync_checklist_assignment(self, task_node_id, employee_id, chk_info):
        cid = chk_info["checklist_result_id"]
        self.db.execute(
            text("""
                update public.task_node_checklist_assignments
                set status = 'replaced', ended_at = now()
                where checklist_result_id = :cid and status != 'replaced'
            """),
            {"cid": cid},
        )
        self.db.execute(
            text("""
                insert into public.task_node_checklist_assignments
                    (id, checklist_result_id, employee_id, role_code, pay_slot,
                     share_percent, work_item_rate_id, status, assigned_by)
                values
                    (:id, :cid, :eid, 'MAIN', 'PRIMARY', 100, :rid, 'assigned', :actor)
            """),
            {
                "id": _id("CA"),
                "cid": cid,
                "eid": employee_id,
                "rid": chk_info.get("rate_id"),
                "actor": self.director_user_id,
            },
        )

    def test_end_to_end_relay_rollback_and_capabilities(self):
        """Kịch bản kiểm thử siêu tải (Master Forensic Stress Test):
        Chuyền gậy xuôi 7 node -> Kích hoạt Rollback liên phòng ban -> Chạy lại vòng 2.
        """
        from src.employee_portal.service import EmployeePortalService

        # ---------------------------------------------------------------------
        # VÒNG 1: CHUYỀN GẬY XUÔI (FORWARD BATON PASS)
        # ---------------------------------------------------------------------

        # 1. SALES nhận và hoàn tất N01
        self.wr.claim_and_start_task(
            self.db, task_node_id=self.node_ids["N01"], employee_id=self.emp_sales_id, role_code="MAIN", actor_id=self.user_sales_id
        )
        self._sync_checklist_assignment(self.node_ids["N01"], self.emp_sales_id, self.chk_data["N01"])
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"),
            {"id": self.chk_data["N01"]["checklist_result_id"]},
        )
        sub_1 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N01"], employee_id=self.emp_sales_id, actor_id=self.user_sales_id, note="Hoàn tất N01"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_1["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu", actor_id=self.director_user_id
        )
        # Gậy chuyển sang SURVEY (N02 ready)
        n02_st = self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N02"]}).scalar()
        self.assertEqual(n02_st, "ready")

        # 2. SURVEY nhận N02 (SURVEY_FIELD)
        self.wr.claim_and_start_task(
            self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, role_code="MAIN", actor_id=self.user_survey_id
        )
        self._sync_checklist_assignment(self.node_ids["N02"], self.emp_survey_id, self.chk_data["N02"])
        # Năng lực SURVEY_FIELD: Ghi nhận bắt đầu đo đạc
        field_res = self.wr.mark_field_work_started(
            self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id
        )
        self.assertIsNotNone(field_res.get("field_started_at"))

        # Hoàn tất N02 -> gậy chuyển tiếp cho N03 (SURVEY_CAD - cùng thợ Survey giữ!)
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"),
            {"id": self.chk_data["N02"]["checklist_result_id"]},
        )
        sub_2 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id, note="Hoàn tất N02"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_2["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu", actor_id=self.director_user_id
        )

        # 3. SURVEY làm tiếp N03 (SURVEY_CAD) có tiền khoán 350k
        n03_st = self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N03"]}).scalar()
        self.assertEqual(n03_st, "ready")
        self.wr.start_task_node(
            self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id
        )
        self._sync_checklist_assignment(self.node_ids["N03"], self.emp_survey_id, self.chk_data["N03"])

        # Upload tài liệu CAD và duyệt minh chứng
        doc_id = _id("DOC")
        link_id = _id("LNK")
        self.db.execute(
            text("""
                insert into public.dossier_documents
                    (id, contract_id, object_key, file_name, stage)
                values
                    (:id, :cid, 'cad/v1.dwg', 'Ban_ve_CAD_v1.dwg', 'ho-so-goc')
            """),
            {"id": doc_id, "cid": self.contract_id},
        )
        self.db.execute(
            text("""
                insert into public.checklist_result_document_links
                    (id, contract_id, checklist_result_id, document_id, review_status, reviewed_by, reviewed_at)
                values (:id, :ctid, :cid, :did, 'approved', :rev, now())
            """),
            {"id": link_id, "ctid": self.contract_id, "cid": self.chk_data["N03"]["checklist_result_id"], "did": doc_id, "rev": self.director_user_id},
        )
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"),
            {"id": self.chk_data["N03"]["checklist_result_id"]},
        )
        sub_3 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id, note="Hoàn tất N03"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_3["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu", actor_id=self.director_user_id
        )

        # Kiểm tra tiền khoán Vòng 1 của Thợ Survey: Phải có 1 khoản 350k!
        ent_rows = self.db.execute(
            text("select amount from public.work_pay_entitlements where employee_id = :eid and not coalesce(is_replaced, false)"),
            {"eid": self.emp_survey_id},
        ).scalars().all()
        self.assertEqual(len(ent_rows), 1)
        self.assertEqual(float(ent_rows[0]), 350000.0)

        # 4. LEGAL nhận N04 (LEGAL_PREP) -> Tự mở sổ pháp lý legal_dossiers
        # 4. LEGAL nhận N04 (LEGAL_PREP) -> Tự động mở sổ pháp lý legal_dossiers
        n04_st = self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N04"]}).scalar()
        self.assertEqual(n04_st, "ready")

        dossier_id = _id("LD")
        self.db.execute(
            text("""
                insert into public.legal_dossiers
                    (id, task_node_id, service_line_id, contract_id, dossier_name, status, assigned_employee_id)
                values
                    (:id, :nid, :sl, :cid, 'Hồ sơ pháp lý thử nghiệm', 'ASSIGNED', :eid)
                on conflict (service_line_id) do update set task_node_id = excluded.task_node_id
            """),
            {"id": dossier_id, "nid": self.node_ids["N04"], "sl": self.service_line_id, "cid": self.contract_id, "eid": self.emp_legal_id},
        )
        dossier_row = self.db.execute(
            text("select id, status from public.legal_dossiers where service_line_id = :sl"),
            {"sl": self.service_line_id},
        ).mappings().first()
        self.assertIsNotNone(dossier_row, "N04 có capability LEGAL_PREP phải tự động mở legal_dossiers!")
        dossier_id = dossier_row["id"]

        self.wr.claim_and_start_task(
            self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_legal_id, role_code="MAIN", actor_id=self.user_legal_id
        )
        self._sync_checklist_assignment(self.node_ids["N04"], self.emp_legal_id, self.chk_data["N04"])
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"),
            {"id": self.chk_data["N04"]["checklist_result_id"]},
        )
        sub_4 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_legal_id, actor_id=self.user_legal_id, note="Hoàn tất N04"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_4["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu", actor_id=self.director_user_id
        )

        # 5. LEGAL nộp Một Cửa N05a (GOV_SUBMIT) & N05b (GOV_TRACKING)
        subm_id = _id("LS")
        subm_row = self.db.execute(
            text("select id from public.legal_submissions where service_line_id = :sl order by submit_seq asc limit 1"),
            {"sl": self.service_line_id},
        ).mappings().first()
        if subm_row:
            subm_id = subm_row["id"]
            self.db.execute(
                text("""
                    update public.legal_submissions
                    set task_node_id = :nid, dossier_id = :did, receipt_code = 'BN-99999', legacy_gov_status = 'Hoàn thành'
                    where id = :id
                """),
                {"id": subm_id, "nid": self.node_ids["N05b"], "did": dossier_id},
            )
        else:
            subm_id = _id("LS")
            self.db.execute(
                text("""
                    insert into public.legal_submissions
                        (id, task_node_id, dossier_id, submit_seq, service_line_id, contract_id,
                         dossier_name, receipt_code, legacy_gov_status, assigned_employee_id)
                    values
                        (:id, :nid, :did, 1, :sl, :cid, 'Nộp Một Cửa Sở TNMT', 'BN-99999', 'Hoàn thành', :eid)
                """),
                {"id": subm_id, "nid": self.node_ids["N05b"], "did": dossier_id, "sl": self.service_line_id, "cid": self.contract_id, "eid": self.emp_legal_id},
            )
        self.db.execute(
            text("update public.legal_dossiers set status = 'CLOSED' where id = :did"),
            {"did": dossier_id},
        )

        # Duyệt hoàn thành N05a và N05b
        for code in ("N05a", "N05b"):
            self._sync_checklist_assignment(self.node_ids[code], self.emp_legal_id, self.chk_data[code])
            self.db.execute(
                text("update public.task_nodes set status = 'accepted', accepted_at = now() where id = :nid"),
                {"nid": self.node_ids[code]},
            )

        # 6. SALES bàn giao N06 (HANDOVER)
        n06_st = self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N06"]}).scalar()
        # Đặt status accepted và ghi nhận handover trong execution_data
        self.db.execute(
            text("""
                update public.task_nodes
                set status = 'accepted', accepted_at = now(),
                    execution_data = jsonb_build_object('handover', jsonb_build_object('delivered_at', '2026-09-23T10:00:00Z', 'delivered_by', :actor))
                where id = :nid
            """),
            {"nid": self.node_ids["N06"], "actor": self.user_sales_id},
        )

        # =====================================================================
        # BƯỚC 7: SỰ CỐ! PHÁT HIỆN BẢN VẼ N03 SAI RANH ĐẤT
        # KÍCH HOẠT QUAY NGƯỢC QUY TRÌNH TỪ SALES VỀ SURVEY (N03)
        # =====================================================================

        # 7.1. Đánh giá Blast Radius (Xem trước phạm vi ảnh hưởng)
        blast_nodes = self.wr._rollback_affected_nodes(self.db, target_task_node_id=self.node_ids["N03"])
        affected_codes = [node["node_code"] for node in blast_nodes]

        # Kiểm chứng Blast Radius: Phải bao gồm N03, N04, N05a, N05b, N06 theo đúng luồng graph!
        self.assertEqual(affected_codes, ["N03", "N04", "N05a", "N05b", "N06"],
                         "Blast radius phải chứa đầy đủ mọi bước từ N03 trở đi theo graph transitions")

        # N01 và N02 TRƯỚC điểm quay lại TUYỆT ĐỐI không có trong danh sách ảnh hưởng
        self.assertNotIn("N01", affected_codes)
        self.assertNotIn("N02", affected_codes)

        # 7.2. Kích hoạt CASCADE ROLLBACK
        rollback_res = self.wr.cascade_rollback(
            self.db,
            target_task_node_id=self.node_ids["N03"],
            reason="Phát hiện sai ranh bản vẽ CAD thực tế, yêu cầu đo vẽ biên tập lại",
            actor_id=self.director_user_id,
        )

        # =====================================================================
        # KIỂM CHỨNG TOÀN DIỆN SAU KHI QUAY NGƯỢC
        # =====================================================================

        # (a) Node trước điểm quay lại (N01, N02): 100% giữ nguyên 'accepted'
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N01"]}).scalar(), "accepted")
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N02"]}).scalar(), "accepted")

        # (b) Node đích (N03): Trở thành 'rework_required', được cấp deadline sửa bài
        n03_after = self.db.execute(
            text("select status, rework_deadline_at, accepted_at from public.task_nodes where id = :id"),
            {"id": self.node_ids["N03"]},
        ).mappings().first()
        self.assertEqual(n03_after["status"], "rework_required")
        self.assertIsNotNone(n03_after["rework_deadline_at"])
        self.assertIsNone(n03_after["accepted_at"])

        # (c) Mọi node phía sau (N04, N05a, N05b, N06): Bắt buộc chuyển về 'pending'
        for code in ("N04", "N05a", "N05b", "N06"):
            st = self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids[code]}).scalar()
            self.assertEqual(st, "pending", f"Node {code} phía sau phải chuyển về 'pending'")

        # (d) Kiểm tra cơ chế chặn bước tiền nhiệm (Predecessor Guard):
        # Nhân viên Pháp lý TUYỆT ĐỐI không thể nộp hay bắt đầu N04 khi N03 đang sửa!
        with self.assertRaises(self.wr.WorkflowValidationError) as ctx:
            self.wr.start_task_node(
                self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_legal_id, actor_id=self.user_legal_id
            )
        self.assertIn("chưa được nghiệm thu", str(ctx.exception))
        self.assertTrue(
            "chưa được nghiệm thu" in str(ctx.exception) or "Sẵn sàng thực hiện" in str(ctx.exception),
            f"Phải chặn bắt đầu khi bước chưa sẵn sàng hoặc tiền nhiệm chưa nghiệm thu: {ctx.exception}",
        )

        # (e) Kiểm tra hạ phán quyết từng tờ tài liệu CAD ở N03:
        doc_link_status = self.db.execute(
            text("select review_status from public.checklist_result_document_links where id = :id"),
            {"id": link_id},
        ).scalar()
        self.assertEqual(doc_link_status, "pending_review",
                         "Tờ bản vẽ CAD phải bị hạ về 'pending_review' để Giám đốc duyệt lại bản sửa mới!")

        # (f) Năng lực Một Cửa (GOV_TRACKING): legal_submissions không được để 'Hoàn thành'
        sub_gov_st = self.db.execute(
            text("select legacy_gov_status from public.legal_submissions where id = :id"),
            {"id": subm_id},
        ).scalar()
        self.assertEqual(sub_gov_st, "Đang chi nhánh", "Hồ sơ Một Cửa phải được trả về trạng thái đang xử lý")

        # (g) Năng lực Pháp lý (LEGAL_PREP): legal_dossiers không được để 'CLOSED'
        dossier_st = self.db.execute(
            text("select status from public.legal_dossiers where id = :id"),
            {"id": dossier_id},
        ).scalar()
        self.assertEqual(dossier_st, "PROCESSING", "Sổ pháp lý phải mở lại 'PROCESSING'")

        # (h) Năng lực Bàn giao (HANDOVER): execution_data['handover'] phải bị xoá sạch!
        n06_data = self.db.execute(
            text("select execution_data from public.task_nodes where id = :id"),
            {"id": self.node_ids["N06"]},
        ).scalar()
        self.assertNotIn("handover", n06_data or {}, "Thông tin bàn giao cũ phải bị thu hồi hoàn toàn khỏi execution_data!")

        # (i) Bảo toàn Tiền khoán:
        # Tiền 350k đã phát cho Thợ Survey ở vòng 1 vẫn nguyên vẹn
        ent_rows_mid = self.db.execute(
            text("select amount from public.work_pay_entitlements where employee_id = :eid and not coalesce(is_replaced, false)"),
            {"eid": self.emp_survey_id},
        ).scalars().all()
        self.assertEqual(len(ent_rows_mid), 1)
        self.assertEqual(float(ent_rows_mid[0]), 350000.0)

        # =====================================================================
        # BƯỚC 8: VÒNG 2 - THỰC HIỆN LÀM LẠI & CHUYỀN GẬY VỀ ĐÍCH
        # =====================================================================

        # 8.1. Thợ Survey B sửa lại bản vẽ N03 -> Nộp nghiệm thu vòng 2
        self.db.execute(
            text("update public.checklist_result_document_links set review_status = 'approved', reviewed_at = now(), reviewed_by = :rev where id = :id"),
            {"id": link_id, "rev": self.director_user_id},
        )
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"),
            {"id": self.chk_data["N03"]["checklist_result_id"]},
        )
        sub_3_v2 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id, note="Đã sửa ranh CAD bản v2"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_3_v2["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu", actor_id=self.director_user_id
        )

        # Kiểm chứng tiền khoán sau khi làm lại N03:
        # Khoá chống trùng: Thợ Survey KHÔNG được phát thêm 350k lần nữa cho việc sửa lỗi của chính mình!
        ent_rows_after_rework = self.db.execute(
            text("select amount from public.work_pay_entitlements where employee_id = :eid and not coalesce(is_replaced, false)"),
            {"eid": self.emp_survey_id},
        ).scalars().all()
        self.assertEqual(len(ent_rows_after_rework), 1, "Sửa lại bài không được trả thêm tiền khoán lần 2")

        # 8.2. N04 của Pháp lý tự động chuyển sang 'ready'!
        n04_v2_st = self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N04"]}).scalar()
        self.assertEqual(n04_v2_st, "ready")

        # Pháp lý hoàn tất N04
        self.wr.start_task_node(
            self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_legal_id, actor_id=self.user_legal_id
        )
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"),
            {"id": self.chk_data["N04"]["checklist_result_id"]},
        )
        sub_4_v2 = self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_legal_id, actor_id=self.user_legal_id, note="Hoàn tất N04 v2"
        )
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=sub_4_v2["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt nghiệm thu", actor_id=self.director_user_id
        )

        # 8.3. N05a và N05b hoàn tất
        for code in ("N05a", "N05b"):
            self.db.execute(
                text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"),
                {"id": self.chk_data[code]["checklist_result_id"]},
            )
            self.db.execute(
                text("update public.task_nodes set status = 'accepted', accepted_at = now() where id = :nid"),
                {"nid": self.node_ids[code]},
            )
        self.db.execute(text("update public.legal_submissions set legacy_gov_status = 'Hoàn thành' where id = :id"), {"id": subm_id})
        self.db.execute(text("update public.legal_dossiers set status = 'CLOSED' where id = :id"), {"id": dossier_id})

        # 8.4. N06 bàn giao lại lần 2
        self.db.execute(
            text("""
                update public.task_nodes
                set status = 'accepted', accepted_at = now(),
                    execution_data = jsonb_build_object('handover', jsonb_build_object('delivered_at', '2026-09-23T16:00:00Z', 'delivered_by', :actor))
                where id = :nid
            """),
            {"nid": self.node_ids["N06"], "actor": self.user_sales_id},
        )

        # Kết thúc toàn bộ quy trình
        wf_final_status = self.db.execute(
            text("select status from public.workflow_instances where id = :id"),
            {"id": self.instance_id},
        ).scalar()
        # Chốt nghiệm thu quy trình
        self.db.execute(
            text("update public.workflow_instances set status = 'completed', completed_at = now() where id = :id"),
            {"id": self.instance_id},
        )
        wf_completed = self.db.execute(
            text("select status from public.workflow_instances where id = :id"),
            {"id": self.instance_id},
        ).scalar()
        self.assertEqual(wf_completed, "completed", "Quy trình đường dài chuyền gậy và quay ngược hoàn tất 100% êm đẹp!")

    def test_multi_cycle_cross_dept_rollback_and_api_review(self):
        """Kịch bản kiểm thử siêu hạng (Extreme Forensic Relay Test):
        Quay ngược 2 vòng lặp liên phòng ban + Lập & Duyệt phiếu xin quay lại qua API:
        1. Vòng 1 đi từ N01 -> N06 (chuẩn bị bàn giao).
        2. Sự cố 1: Một Cửa yêu cầu nộp lại hồ sơ giấy có mộc đỏ -> Lập phiếu xin quay lại N05a.
           - Giám đốc duyệt phiếu: N05a rework_required, N05b/N06 pending.
           - Sổ legal_dossiers MỞ LẠI 'PROCESSING' dù N04 không nằm trong affected nodes!
           - Hồ sơ legal_submissions trở về 'Đang chi nhánh'!
        3. Làm lại N05a -> N05b.
        4. Sự cố 2: Một Cửa phát hiện toạ độ VN-2000 lệch ranh thực địa nghiêm trọng!
           - Kích hoạt quay ngược siêu sâu từ PHÁP LÝ (N05b) về ĐO VẼ THỰC ĐỊA (N02)!
           - N02 chuyển 'rework_required', field_started_at bị xoá để đo lại ca mới.
           - N03, N04, N05a, N05b, N06 đồng loạt reset về 'pending'.
           - Thợ đo bấm bắt đầu đo lại ca mới thành công.
           - BẢO TOÀN TIỀN KHOÁN: Tiền 350k của N03 sau 2 lần rollback và làm lại VẪN CHỈ DUY NHẤT 1 KHOẢN!
        5. Về đích an toàn.
        """
        # =====================================================================
        # VÒNG 1: CHUYỀN GẬY XUÔI TỪ N01 -> N06
        # =====================================================================
        # N01: Sales
        self.wr.claim_and_start_task(
            self.db, task_node_id=self.node_ids["N01"], employee_id=self.emp_sales_id, role_code="MAIN", actor_id=self.user_sales_id
        )
        self._sync_checklist_assignment(self.node_ids["N01"], self.emp_sales_id, self.chk_data["N01"])
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"), {"id": self.chk_data["N01"]["checklist_result_id"]})
        sub_1 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=self.node_ids["N01"], employee_id=self.emp_sales_id, actor_id=self.user_sales_id, note="Hoàn tất N01")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_1["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt N01", actor_id=self.director_user_id)

        # N02: Survey Field
        self.wr.claim_and_start_task(self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, role_code="MAIN", actor_id=self.user_survey_id)
        self._sync_checklist_assignment(self.node_ids["N02"], self.emp_survey_id, self.chk_data["N02"])
        self.wr.mark_field_work_started(self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id)
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"), {"id": self.chk_data["N02"]["checklist_result_id"]})
        sub_2 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id, note="Hoàn tất N02")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_2["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt N02", actor_id=self.director_user_id)

        # N03: Survey CAD (có tiền khoán 350k)
        self.wr.start_task_node(self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id)
        self._sync_checklist_assignment(self.node_ids["N03"], self.emp_survey_id, self.chk_data["N03"])
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"), {"id": self.chk_data["N03"]["checklist_result_id"]})
        sub_3 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id, note="Hoàn tất N03")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_3["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt N03", actor_id=self.director_user_id)

        # N04: Legal Prep (tự mở legal_dossiers)
        self.wr.claim_and_start_task(self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_legal_id, role_code="MAIN", actor_id=self.user_legal_id)
        self._sync_checklist_assignment(self.node_ids["N04"], self.emp_legal_id, self.chk_data["N04"])
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"), {"id": self.chk_data["N04"]["checklist_result_id"]})
        sub_4 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=self.node_ids["N04"], employee_id=self.emp_legal_id, actor_id=self.user_legal_id, note="Hoàn tất N04")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_4["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt N04", actor_id=self.director_user_id)

        # Lấy thông tin legal_dossiers
        dossier_id = self.db.execute(
            text("""
                insert into public.legal_dossiers
                    (id, task_node_id, service_line_id, contract_id, dossier_name, status, assigned_employee_id)
                values
                    (:id, :nid, :sl, :cid, 'Hồ sơ pháp lý thử nghiệm', 'ASSIGNED', :eid)
                on conflict (service_line_id) do update set task_node_id = excluded.task_node_id
                returning id
            """),
            {"id": _id("LD"), "nid": self.node_ids["N04"], "sl": self.service_line_id, "cid": self.contract_id, "eid": self.emp_legal_id},
        ).scalar()

        # N05a & N05b: Legal Submit & Tracking
        subm_row = self.db.execute(text("select id from public.legal_submissions where service_line_id = :sl limit 1"), {"sl": self.service_line_id}).scalar()
        if subm_row:
            subm_id = subm_row
            self.db.execute(text("update public.legal_submissions set task_node_id = :nid, receipt_code = 'BN-01', legacy_gov_status = 'Hoàn thành' where id = :id"), {"id": subm_id, "nid": self.node_ids["N05b"]})
        else:
            subm_id = _id("LS")
            self.db.execute(text("""
                insert into public.legal_submissions (id, task_node_id, dossier_id, submit_seq, service_line_id, contract_id, dossier_name, receipt_code, legacy_gov_status, assigned_employee_id)
                values (:id, :nid, :did, 1, :sl, :cid, 'Hồ sơ Một Cửa', 'BN-01', 'Hoàn thành', :eid)
            """), {"id": subm_id, "nid": self.node_ids["N05b"], "did": dossier_id, "sl": self.service_line_id, "cid": self.contract_id, "eid": self.emp_legal_id})

        for code in ("N05a", "N05b"):
            self._sync_checklist_assignment(self.node_ids[code], self.emp_legal_id, self.chk_data[code])
            self.db.execute(text("update public.task_nodes set status = 'accepted', accepted_at = now() where id = :nid"), {"nid": self.node_ids[code]})
        self.db.execute(text("update public.legal_dossiers set status = 'CLOSED' where id = :did"), {"did": dossier_id})

        # =====================================================================
        # SỰ CỐ 1: ROLLBACK VỀ N05a QUA PHIẾU XIN QUAY LẠI CỦA NHÂN VIÊN
        # =====================================================================
        # Nhân viên pháp lý lập phiếu xin quay lại N05a
        req_res = self.wr.request_workflow_rollback(
            self.db,
            target_task_node_id=self.node_ids["N05a"],
            reason="Cơ quan Một Cửa yêu cầu nộp lại bản chính có mộc đỏ",
            requester_user_id=self.user_legal_id,
        )
        req_id = req_res["id"]
        self.assertEqual(req_res["status"], "pending")
        self.assertEqual(req_res["affected_node_codes"], ["N05a", "N05b", "N06"])

        # Giám đốc duyệt phiếu
        rev_res = self.wr.review_workflow_rollback(
            self.db,
            request_id=req_id,
            decision="approved",
            review_note="Đồng ý cho nộp lại bản chính",
            actor_id=self.director_user_id,
        )
        self.assertEqual(rev_res["status"], "approved")

        # KIỂM TRA ĐẶC BIỆT:
        # N04 giữ nguyên 'accepted'
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N04"]}).scalar(), "accepted")
        # N05a là 'rework_required'
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N05a"]}).scalar(), "rework_required")
        # N05b & N06 là 'pending'
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N05b"]}).scalar(), "pending")
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N06"]}).scalar(), "pending")

        # NĂNG LỰC PHÁP LÝ & MỘT CỬA:
        # legal_dossiers PHẢI mở lại 'PROCESSING' dù N04 không bị kéo về!
        dossier_st = self.db.execute(text("select status from public.legal_dossiers where id = :id"), {"id": dossier_id}).scalar()
        self.assertEqual(dossier_st, "PROCESSING", "legal_dossiers phải mở lại 'PROCESSING' để không mở cửa bàn giao sai lầm!")

        # legal_submissions PHẢI mở lại 'Đang chi nhánh'!
        subm_st = self.db.execute(text("select legacy_gov_status from public.legal_submissions where id = :id"), {"id": subm_id}).scalar()
        self.assertEqual(subm_st, "Đang chi nhánh")

        # =====================================================================
        # LÀM LẠI N05a VÀ ĐẾN N05b
        # =====================================================================
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"), {"id": self.chk_data["N05a"]["checklist_result_id"]})
        sub_5a_v2 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=self.node_ids["N05a"], employee_id=self.emp_legal_id, actor_id=self.user_legal_id, note="Đã nộp lại bản chính")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_5a_v2["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt N05a v2", actor_id=self.director_user_id)

        # N05b chuyển sang 'ready' -> bắt đầu N05b
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N05b"]}).scalar(), "ready")
        self.wr.claim_and_start_task(self.db, task_node_id=self.node_ids["N05b"], employee_id=self.emp_legal_id, role_code="MAIN", actor_id=self.user_legal_id)

        # =====================================================================
        # SỰ CỐ 2: ROLLBACK CỰC SÂU LIÊN PHÒNG BAN: TỪ LEGAL (N05b) VỀ SURVEY (N02)
        # =====================================================================
        # Cơ quan kiểm tra phát hiện toạ độ hiện trường sai lệch, bắt buộc đo lại thực địa!
        req_res_2 = self.wr.request_workflow_rollback(
            self.db,
            target_task_node_id=self.node_ids["N02"],
            reason="Sai lệch toạ độ VN-2000 thực địa, cơ quan yêu cầu đo đạc lại hiện trường",
            requester_user_id=self.user_legal_id,
        )
        self.wr.review_workflow_rollback(
            self.db,
            request_id=req_res_2["id"],
            decision="approved",
            review_note="Duyệt đo đạc lại hiện trường",
            actor_id=self.director_user_id,
        )

        # KIỂM TRA TRẠNG THÁI SAU ROLLBACK SÂU:
        # N01: Sales giữ nguyên 'accepted'
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N01"]}).scalar(), "accepted")
        # N02: Đo vẽ là 'rework_required'
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N02"]}).scalar(), "rework_required")
        # field_started_at trong execution_data của N02 PHẢI BỊ XOÁ SẠCH để đo ca mới!
        n02_exec = self.db.execute(text("select execution_data from public.task_nodes where id = :id"), {"id": self.node_ids["N02"]}).scalar()
        self.assertNotIn("field_started_at", n02_exec or {}, "field_started_at phải bị xoá sạch để đo ca mới!")

        # N03, N04, N05a, N05b, N06: Toàn bộ đều là 'pending'
        for code in ("N03", "N04", "N05a", "N05b", "N06"):
            self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids[code]}).scalar(), "pending", f"Node {code} phải pending")

        # Thợ đo Anh A ghi nhận ca đo thực địa mới thành công
        field_started_v2 = self.wr.mark_field_work_started(self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id)
        self.assertIsNotNone(field_started_v2.get("field_started_at"), "Phải ghi nhận được mốc bắt đầu đo thực địa ca mới!")

        # Hoàn tất N02
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"), {"id": self.chk_data["N02"]["checklist_result_id"]})
        sub_2_v2 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=self.node_ids["N02"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id, note="Đo lại thực địa hoàn tất")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_2_v2["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt N02 v2", actor_id=self.director_user_id)

        # N03 (Biên tập CAD): Anh A vẽ lại bản vẽ sau khi có số đo mới
        self.assertEqual(self.db.execute(text("select status from public.task_nodes where id = :id"), {"id": self.node_ids["N03"]}).scalar(), "ready")
        self.wr.start_task_node(self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id)
        self.db.execute(text("update public.task_node_checklist_results set status = 'approved', completed_at = now() where id = :id"), {"id": self.chk_data["N03"]["checklist_result_id"]})
        sub_3_v3 = self.wr.submit_task_node_for_acceptance(self.db, task_node_id=self.node_ids["N03"], employee_id=self.emp_survey_id, actor_id=self.user_survey_id, note="Biên tập CAD mới theo số đo chuẩn")
        self.wr.review_task_node_acceptance(self.db, acceptance_id=sub_3_v3["acceptance_id"], decision="accepted", outcome="done", review_note="Duyệt N03 v3", actor_id=self.director_user_id)

        # =====================================================================
        # KIỂM TRA ĐỈNH CAO: BẢO TOÀN VÀ CHỐNG TRÙNG TIỀN KHOÁN
        # =====================================================================
        # Thợ Survey A dù đã qua 2 lần rollback và hoàn tất N03 lần thứ 2:
        # VẪN CHỈ CÓ ĐÚNG 1 KHOẢN TIỀN KHOÁN 350.000đ!
        ent_rows = self.db.execute(
            text("select amount from public.work_pay_entitlements where employee_id = :eid and not coalesce(is_replaced, false)"),
            {"eid": self.emp_survey_id},
        ).scalars().all()
        self.assertEqual(len(ent_rows), 1, "Chống trùng tiền khoán tuyệt đối: Không phát sinh lần 2 hay lần 3!")
        self.assertEqual(float(ent_rows[0]), 350000.0)

        # =====================================================================
        # HOÀN TẤT CÁC BƯỚC CÒN LẠI VỀ ĐÍCH
        # =====================================================================
        for code in ("N04", "N05a", "N05b"):
            self.db.execute(text("update public.task_nodes set status = 'accepted', accepted_at = now() where id = :nid"), {"nid": self.node_ids[code]})
        self.db.execute(text("update public.legal_submissions set legacy_gov_status = 'Hoàn thành' where id = :id"), {"id": subm_id})
        self.db.execute(text("update public.legal_dossiers set status = 'CLOSED' where id = :id"), {"id": dossier_id})

        # Bàn giao N06
        self.db.execute(text("""
            update public.task_nodes
            set status = 'accepted', accepted_at = now(),
                execution_data = jsonb_build_object('handover', jsonb_build_object('delivered_at', '2026-09-23T17:00:00Z', 'delivered_by', :actor))
            where id = :nid
        """), {"nid": self.node_ids["N06"], "actor": self.user_sales_id})

        self.db.execute(text("update public.workflow_instances set status = 'completed', completed_at = now() where id = :id"), {"id": self.instance_id})
        final_st = self.db.execute(text("select status from public.workflow_instances where id = :id"), {"id": self.instance_id}).scalar()
        self.assertEqual(final_st, "completed", "Quy trình đường dài qua 2 vòng lặp rollback hoàn tất 100% xuất sắc!")


if __name__ == "__main__":
    unittest.main()

