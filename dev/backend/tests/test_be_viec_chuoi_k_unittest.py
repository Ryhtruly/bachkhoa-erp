"""Kiểm thử cơ chế Bể việc chuỗi K: nhận trọn gói, suất thợ phụ, cascade rollback.

Dùng db giả (MagicMock) theo đúng lối các test nghiệp vụ khác trong repo: mục tiêu
là chốt LUẬT, không phải chốt schema — schema đã có bộ test SQL riêng.
"""

import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from src.contracts import workflow_runtime
from src.contracts.workflow_runtime import TaskClaimConflict, WorkflowValidationError


def _rows(value):
    result = MagicMock()
    result.mappings.return_value.all.return_value = value
    return result


def _row(value):
    result = MagicMock()
    result.mappings.return_value.first.return_value = value
    return result


def _scalar(value):
    result = MagicMock()
    result.scalar.return_value = value
    return result


def _scalar_one(value):
    result = MagicMock()
    result.scalar_one.return_value = value
    return result


def _first(value):
    """Cho các truy vấn gọi thẳng .first(), không qua .mappings()."""
    result = MagicMock()
    result.first.return_value = value
    return result


class NhanTronChuoiDoVeTests(unittest.TestCase):
    """Ch.4 — nhận K02 là nhận luôn K03 của cùng Hạng mục."""

    def test_nhan_k02_thi_gan_luon_tho_chinh_cho_k03(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "TN-K03", "status": "pending"}),
            _scalar("ASSIGN-CAD"),
            MagicMock(),
        ]
        with patch.object(workflow_runtime, "_bind_claimed_employee_to_payable_checklists") as bind:
            result = workflow_runtime._bundle_claim_cad_followup(
                db, workflow_instance_id="WI-1", employee_id="NV-1", actor_id="USER-1"
            )

        self.assertEqual(result["bundled_cad_task_node_id"], "TN-K03")
        bind.assert_called_once()
        self.assertEqual(bind.call_args.kwargs["role_code"], "MAIN")
        self.assertEqual(bind.call_args.kwargs["employee_id"], "NV-1")

    def test_buoc_ve_da_co_nguoi_giu_thi_van_cho_nhan_ca_do(self):
        """Không chặn cả chuỗi chỉ vì bước vẽ đã có chủ — làm vậy là treo Bể việc."""
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "TN-K03", "status": "ready"}),
            _scalar(None),
        ]
        result = workflow_runtime._bundle_claim_cad_followup(
            db, workflow_instance_id="WI-1", employee_id="NV-2", actor_id="USER-1"
        )
        self.assertIsNone(result["bundled_cad_task_node_id"])

    def test_hang_muc_khong_co_buoc_ve_thi_bo_qua(self):
        db = MagicMock()
        db.execute.side_effect = [_row(None)]
        result = workflow_runtime._bundle_claim_cad_followup(
            db, workflow_instance_id="WI-1", employee_id="NV-1", actor_id="USER-1"
        )
        self.assertIsNone(result["bundled_cad_task_node_id"])

    def test_nhan_main_tu_k01_thi_giu_truoc_toan_bo_node_cung_phong(self):
        """Nút “Nhận trọn chuỗi” phải giữ K02/K03, không để K02 rơi lại Bể việc."""
        db = MagicMock()
        db.execute.side_effect = [
            _rows([
                {
                    "id": "TN-K02", "node_code": "K02", "status": "pending",
                    "node_definition": {
                        "pool_department_code": "SURVEY",
                        "claim_roles": ["MAIN", "ASSISTANT"],
                    },
                },
                {
                    "id": "TN-K03", "node_code": "K03", "status": "pending",
                    "node_definition": {
                        "pool_department_code": "SURVEY",
                        "claim_roles": ["MAIN"],
                    },
                },
                {
                    "id": "TN-K06", "node_code": "K06", "status": "pending",
                    "node_definition": {
                        "pool_department_code": "LEGAL",
                        "claim_roles": ["MAIN"],
                    },
                },
            ]),
            _scalar("ASSIGN-K02"), MagicMock(),
            _scalar("ASSIGN-K03"), MagicMock(),
        ]

        with patch.object(workflow_runtime, "_bind_claimed_employee_to_payable_checklists") as bind:
            result = workflow_runtime._reserve_main_workflow_chain(
                db,
                workflow_instance_id="WI-1",
                claimed_task_node_id="TN-K01",
                department_code="SURVEY",
                employee_id="NV-1",
                actor_id="USER-1",
            )

        self.assertEqual(result["reserved_task_node_ids"], ["TN-K02", "TN-K03"])
        self.assertEqual(bind.call_count, 2)
        inserted_sql = "\n".join(
            str(call.args[0]) for call in db.execute.call_args_list[1:]
        )
        self.assertIn("role_code, is_primary", inserted_sql)
        self.assertNotIn("TN-K06", result["reserved_task_node_ids"])

    def test_claim_k01_main_goi_co_che_giu_chuoi_cung_phong(self):
        """Khoá regression ở public API: sửa helper mà quên gọi vẫn phải đỏ test."""

        @contextmanager
        def unlocked(*_args, **_kwargs):
            yield

        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "NV-1", "department_code": "SURVEY"}),
            _row({
                "id": "TN-K01",
                "node_code": "K01",
                "status": "ready",
                "workflow_instance_id": "WI-1",
                "defined_by_revision_id": "REV-1",
                "node_key": "receive",
                "execution_data": {},
                "node_definition": {
                    "pool_department_codes": ["SALES", "LEGAL", "SURVEY"],
                    "claim_roles": ["MAIN"],
                },
            }),
            _row(None),
            # Luật đơn nhiệm giờ hỏi "đang vướng bước NÀO" chứ không đếm số —
            # thông báo phải nói được tên bước và mã hợp đồng. None = rảnh tay.
            _row(None),
            _scalar("ASSIGN-K01"),
            MagicMock(),
            MagicMock(),
        ]

        with (
            patch("src.core.redis_utils.redis_distributed_lock", unlocked),
            patch.object(workflow_runtime, "held_item_count", return_value=0),
            patch.object(workflow_runtime, "wip_limit_reached", return_value=False),
            patch.object(workflow_runtime, "_bind_claimed_employee_to_payable_checklists", return_value={}),
            patch.object(workflow_runtime, "_reserve_main_workflow_chain", return_value={
                "reserved_task_node_ids": ["TN-K02", "TN-K03"]
            }) as reserve,
            patch.object(workflow_runtime, "recompute_planned_deadlines"),
            patch.object(workflow_runtime, "_ensure_node_module_records", return_value={}),
        ):
            result = workflow_runtime.claim_and_start_task(
                db,
                task_node_id="TN-K01",
                employee_id="NV-1",
                role_code="MAIN",
                actor_id="USER-1",
            )

        reserve.assert_called_once_with(
            db,
            workflow_instance_id="WI-1",
            claimed_task_node_id="TN-K01",
            department_code="SURVEY",
            employee_id="NV-1",
            actor_id="USER-1",
        )
        self.assertEqual(result["reserved_task_node_ids"], ["TN-K02", "TN-K03"])


class SuatThoPhuK02Tests(unittest.TestCase):
    """Ch.5 — suất thợ phụ đóng khi thợ chính bắt đầu đo, người đã nhận thì giữ."""

    def _node(self, execution_data=None):
        return {
            "id": "TN-K02",
            "node_code": "K02",
            "status": "in_progress",
            "workflow_instance_id": "WI-1",
            "execution_data": execution_data or {},
        }

    def test_bat_dau_do_khi_suat_con_trong_thi_dong_suat(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(self._node()),
            _scalar(None),
            _scalar("2026-08-24T09:00:00+00:00"),
            MagicMock(),
        ]
        with patch.object(workflow_runtime, "_require_node_assignment"):
            result = workflow_runtime.mark_field_work_started(
                db, task_node_id="TN-K02", employee_id="NV-1", actor_id="USER-1"
            )
        self.assertTrue(result["assistant_slot_closed"])
        self.assertIsNone(result["assistant_employee_id"])

    def test_da_co_nguoi_nhan_phu_thi_khong_bi_huy(self):
        """Người phụ có thể đang trên đường ra hiện trường — không cướp việc của họ."""
        db = MagicMock()
        db.execute.side_effect = [
            _row(self._node()),
            _scalar("NV-PHU"),
            _scalar("2026-08-24T09:00:00+00:00"),
            MagicMock(),
        ]
        with patch.object(workflow_runtime, "_require_node_assignment"):
            result = workflow_runtime.mark_field_work_started(
                db, task_node_id="TN-K02", employee_id="NV-1", actor_id="USER-1"
            )
        self.assertFalse(result["assistant_slot_closed"])
        self.assertEqual(result["assistant_employee_id"], "NV-PHU")

    def test_bam_lai_lan_hai_khong_doi_moc_thoi_gian(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(self._node({"field_started_at": "2026-08-24T08:00:00+00:00"})),
        ]
        with patch.object(workflow_runtime, "_require_node_assignment"):
            result = workflow_runtime.mark_field_work_started(
                db, task_node_id="TN-K02", employee_id="NV-1", actor_id="USER-1"
            )
        self.assertEqual(result["field_started_at"], "2026-08-24T08:00:00+00:00")

    def test_buoc_khong_phai_k02_thi_khong_co_moc_bat_dau_do(self):
        db = MagicMock()
        db.execute.side_effect = [_row({**self._node(), "node_code": "K04"})]
        with self.assertRaises(WorkflowValidationError):
            workflow_runtime.mark_field_work_started(
                db, task_node_id="TN-K04", employee_id="NV-1", actor_id="USER-1"
            )


class CascadeRollbackTests(unittest.TestCase):
    """Ch.9 — quay lại một bước kéo theo các bước sau, giữ nguyên các bước trước."""

    def _db_cho_cascade(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "TN-K03", "workflow_instance_id": "WI-1",
                "node_code": "K03", "occurrence_no": 1,
            }),
            _rows([
                {"id": "TN-K03", "node_code": "K03", "occurrence_no": 1, "status": "accepted"},
                {"id": "TN-K04", "node_code": "K04", "occurrence_no": 1, "status": "in_progress"},
                {"id": "TN-K05b", "node_code": "K05b", "occurrence_no": 1, "status": "pending"},
            ]),
            MagicMock(),   # update task_nodes
            # Cấp hạn sửa bài MỚI cho từng bước bị kéo về — một câu mỗi bước.
            # Dùng lại deadline_at cũ là bước vừa mở lại đã đỏ quá hạn.
            MagicMock(),   # rework_deadline_at cho TN-K03
            MagicMock(),   # rework_deadline_at cho TN-K04
            MagicMock(),   # reset checklist
            # Hạ phán quyết TỪNG TỜ về chờ duyệt. Thiếu bước này thì bước bị kéo
            # về sửa vẫn mang đủ giấy 'approved' của vòng trước, và cổng đóng
            # bước cho qua ngay — bản vẽ sai đi thẳng qua vòng hai.
            MagicMock(),   # reset phán quyết giấy
            MagicMock(),   # event TN-K03
            MagicMock(),   # event TN-K04
            MagicMock(),   # notifications
            _scalar("WI-1"),
        ]
        return db

    def test_buoc_dich_va_buoc_sau_bi_tra_ve(self):
        db = self._db_cho_cascade()
        with patch.object(workflow_runtime, "recompute_planned_deadlines"):
            result = workflow_runtime.cascade_rollback(
                db, target_task_node_id="TN-K03", reason="Sai ranh bản vẽ", actor_id="USER-GD"
            )
        self.assertEqual(result["affected_node_ids"], ["TN-K03", "TN-K04"])
        self.assertEqual(result["affected_node_codes"], ["K03", "K04"])

    def test_buoc_chua_toi_luot_khong_bi_gan_nhan_can_sua(self):
        """Node 'pending' chưa hề chạy thì không có gì để sửa — để nguyên hàng chờ."""
        db = self._db_cho_cascade()
        with patch.object(workflow_runtime, "recompute_planned_deadlines"):
            result = workflow_runtime.cascade_rollback(
                db, target_task_node_id="TN-K03", reason="Sai ranh bản vẽ", actor_id="USER-GD"
            )
        self.assertNotIn("TN-K05b", result["affected_node_ids"])

    def test_tinh_lai_han_cho_ca_chuoi_sau_khi_quay_lai(self):
        db = self._db_cho_cascade()
        with patch.object(workflow_runtime, "recompute_planned_deadlines") as recompute:
            workflow_runtime.cascade_rollback(
                db, target_task_node_id="TN-K03", reason="Sai ranh bản vẽ", actor_id="USER-GD"
            )
        recompute.assert_called_once_with(db, workflow_instance_id="WI-1")

    def test_truy_van_chi_lay_buoc_tu_diem_quay_lai_tro_di(self):
        """Chốt vế so sánh: bước trước điểm quay lại tuyệt đối không được đụng tới."""
        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "TN-K03", "workflow_instance_id": "WI-1",
                "node_code": "K03", "occurrence_no": 1,
            }),
            _rows([]),
        ]
        workflow_runtime._rollback_affected_nodes(db, target_task_node_id="TN-K03")
        cau_lenh = str(db.execute.call_args_list[1].args[0])
        self.assertIn("(node_code, occurrence_no) >= (:node_code, :occurrence_no)", cau_lenh)
        self.assertIn("status not in ('cancelled', 'skipped')", cau_lenh)


class PhieuQuayLaiTests(unittest.TestCase):
    """Nhân viên không được tự lùi bước — mọi lần quay lại đều phải qua phiếu duyệt."""

    def test_ly_do_qua_ngan_thi_khong_lap_duoc_phieu(self):
        db = MagicMock()
        with self.assertRaises(WorkflowValidationError):
            workflow_runtime.request_workflow_rollback(
                db, target_task_node_id="TN-K03", reason="sai", requester_user_id="USER-NV"
            )

    def test_da_co_phieu_cho_duyet_thi_khong_lap_them(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "TN-K03", "workflow_instance_id": "WI-1",
                "node_code": "K03", "occurrence_no": 1,
            }),
            _rows([{"id": "TN-K03", "node_code": "K03", "occurrence_no": 1, "status": "accepted"}]),
            _scalar("WI-1"),
            _scalar("REQ-CU"),
        ]
        with self.assertRaises(WorkflowValidationError):
            workflow_runtime.request_workflow_rollback(
                db,
                target_task_node_id="TN-K03",
                reason="Bản vẽ sai ranh giới thửa",
                requester_user_id="USER-NV",
            )

    def test_phieu_da_xu_ly_thi_duyet_lai_bao_xung_dot(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "REQ-1", "workflow_instance_id": "WI-1",
                "target_task_node_id": "TN-K03", "requested_by": "USER-NV",
                "reason": "Sai ranh", "status": "approved",
            }),
        ]
        with self.assertRaises(TaskClaimConflict):
            workflow_runtime.review_workflow_rollback(
                db, request_id="REQ-1", decision="approved", review_note=None, actor_id="USER-GD"
            )

    def test_tu_choi_bat_buoc_ghi_ly_do(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "REQ-1", "workflow_instance_id": "WI-1",
                "target_task_node_id": "TN-K03", "requested_by": "USER-NV",
                "reason": "Sai ranh", "status": "pending",
            }),
        ]
        with self.assertRaises(WorkflowValidationError):
            workflow_runtime.review_workflow_rollback(
                db, request_id="REQ-1", decision="rejected", review_note="  ", actor_id="USER-GD"
            )


class KhoanKhongTraHaiLanTests(unittest.TestCase):
    """Hồ sơ bị trả về rồi nghiệm thu lại không được trả khoán lần hai cho cùng người."""

    def test_khoa_chong_trung_khong_phu_thuoc_lan_nghiem_thu(self):
        nguon = workflow_runtime._generate_work_pay_entitlements.__doc__ or ""
        self.assertIn("idempotent", nguon.lower())

    def test_van_nhan_ra_khoa_dinh_dang_cu(self):
        import inspect

        ma_nguon = inspect.getsource(workflow_runtime._generate_work_pay_entitlements)
        self.assertIn('idempotency_key = assignment["id"]', ma_nguon)
        self.assertIn("idempotency_key like :legacy", ma_nguon)


class HangRaoTaiDoDangTests(unittest.TestCase):
    """Ch.7 — WIP=3 phải đếm cả bước vẽ chưa tới lượt và bước bị trả về."""

    def test_dem_theo_hang_muc_dang_giu_khong_phai_theo_buoc(self):
        from src.employee_portal.service import _EMPLOYEE_POOL_GUARDS_QUERY

        cau_lenh = str(_EMPLOYEE_POOL_GUARDS_QUERY)
        self.assertIn("count(distinct n.workflow_instance_id)", cau_lenh)
        self.assertIn("n.status not in ('accepted', 'cancelled', 'skipped')", cau_lenh)
        # Suất thợ phụ không phải là ôm hạng mục nên không được tính vào tải.
        self.assertIn("a.role_code <> 'ASSISTANT'", cau_lenh)

    def test_nguong_khoa_van_la_ba_hang_muc(self):
        self.assertEqual(workflow_runtime.WIP_ITEM_LIMIT, 3)
        self.assertTrue(workflow_runtime.wip_limit_reached(3))
        self.assertFalse(workflow_runtime.wip_limit_reached(2))

    def test_nhan_them_buoc_trong_hang_muc_dang_giu_khong_chiem_them_slot(self):
        """Nhận K03 của hạng mục mình đã ôm thì vẫn là 1 slot, không phải 2."""
        db = MagicMock()
        db.execute.side_effect = [
            _scalar(3),          # đang giữ 3 hạng mục
            _first((1,)),        # trong đó có hạng mục đang xét
        ]
        con_lai = workflow_runtime.held_item_count(
            db, employee_id="NV-1", exclude_instance_id="WI-1"
        )
        self.assertEqual(con_lai, 2)
        self.assertFalse(workflow_runtime.wip_limit_reached(con_lai))

    def test_hang_muc_moi_khi_da_giu_ba_thi_bi_chan(self):
        db = MagicMock()
        db.execute.side_effect = [
            _scalar(3),
            _first(None),        # hạng mục đang xét là hạng mục mới
        ]
        con_lai = workflow_runtime.held_item_count(
            db, employee_id="NV-1", exclude_instance_id="WI-MOI"
        )
        self.assertEqual(con_lai, 3)
        self.assertTrue(workflow_runtime.wip_limit_reached(con_lai))


if __name__ == "__main__":
    unittest.main()
