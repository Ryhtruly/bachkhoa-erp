"""Nhường việc (cứu viện) — Ch.5.2 & Ch.6 của Master Plan.

Ba điều bất biến: nhường một bước không đổi chủ hạng mục, người nhận chỉ thao
tác đúng bước đó, và khoán đi theo người làm thật.
"""

import unittest
from unittest.mock import MagicMock, patch

from src.contracts import workflow_runtime
from src.contracts.workflow_runtime import TaskClaimConflict, WorkflowValidationError


def _row(value):
    result = MagicMock()
    result.mappings.return_value.first.return_value = value
    return result


def _first(value):
    result = MagicMock()
    result.first.return_value = value
    return result


def _scalar(value):
    result = MagicMock()
    result.scalar.return_value = value
    return result


def _all(rows):
    result = MagicMock()
    result.all.return_value = list(rows)
    return result


class NhoHoTroTests(unittest.TestCase):
    def test_ly_do_qua_ngan_thi_khong_nhuong_duoc(self):
        with self.assertRaises(WorkflowValidationError):
            workflow_runtime.request_node_help(
                MagicMock(), task_node_id="TN-1", employee_id="NV-1", reason="bận",
            )

    def test_buoc_da_nop_nghiem_thu_thi_khong_nhuong_duoc(self):
        """Nhường một bước đã nộp là kéo ngược quy trình sau lưng quản lý."""
        db = MagicMock()
        db.execute.side_effect = [_row({"id": "TN-1", "node_code": "K03", "status": "submitted"})]
        with patch.object(workflow_runtime, "_require_node_assignment"):
            with self.assertRaises(WorkflowValidationError) as caught:
                workflow_runtime.request_node_help(
                    db, task_node_id="TN-1", employee_id="NV-1",
                    reason="Máy tính hỏng, không vẽ được",
                )
        self.assertIn("đang làm dở", str(caught.exception))

    def test_da_co_loi_nho_dang_mo_thi_khong_nhuong_lan_hai(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "TN-1", "node_code": "K03", "status": "in_progress"}),
            # Lượt dọn lười chạy trước khi kiểm trùng: không có lời nhờ nào quá
            # hạn nên không đóng dòng nào, và dòng đang mở vẫn phải chặn.
            _all([]),
            _first((1,)),
        ]
        with patch.object(workflow_runtime, "_require_node_assignment"):
            with self.assertRaises(TaskClaimConflict):
                workflow_runtime.request_node_help(
                    db, task_node_id="TN-1", employee_id="NV-1",
                    reason="Máy tính hỏng, không vẽ được",
                )


class NhanLamHoTests(unittest.TestCase):
    def _loi_nho(self, **thay_doi):
        return {
            "id": "H-1", "task_node_id": "TN-K03", "status": "open",
            "requested_by_employee_id": "NV-CU", "proposed_amount": 200000,
            "node_code": "K03", "node_status": "in_progress",
            "workflow_instance_id": "WI-1",
            **thay_doi,
        }

    def test_khong_tu_nhan_ho_buoc_minh_nhuong(self):
        db = MagicMock()
        db.execute.side_effect = [_row(self._loi_nho())]
        with patch.object(workflow_runtime, "redis_distributed_lock", create=True):
            with self.assertRaises(WorkflowValidationError) as caught:
                workflow_runtime.claim_node_help(
                    db, request_id="H-1", employee_id="NV-CU", actor_id="USER-1",
                )
        self.assertIn("chính bước mình nhờ", str(caught.exception))

    def test_loi_nho_da_co_nguoi_nhan_thi_bao_xung_dot(self):
        db = MagicMock()
        db.execute.side_effect = [_row(self._loi_nho(status="claimed"))]
        with self.assertRaises(TaskClaimConflict):
            workflow_runtime.claim_node_help(
                db, request_id="H-1", employee_id="NV-MOI", actor_id="USER-1",
            )

    def test_khac_phong_ban_thi_khong_nhan_duoc(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(self._loi_nho()),
            _row({"id": "NV-MOI", "department_code": "LEGAL"}),
            _scalar({}),
        ]
        with self.assertRaises(WorkflowValidationError) as caught:
            workflow_runtime.claim_node_help(
                db, request_id="H-1", employee_id="NV-MOI", actor_id="USER-1",
            )
        self.assertIn("phòng ban", str(caught.exception))

    def test_nhan_ho_thi_nha_suat_khoan_cu_truoc_khi_gan_suat_moi(self):
        """Không nhả trước thì hai người cùng được trả tiền cho một phần việc."""
        import inspect

        ma_nguon = inspect.getsource(workflow_runtime.claim_node_help)
        vi_tri_nha = ma_nguon.index("set status = 'replaced'")
        vi_tri_gan = ma_nguon.index("_bind_claimed_employee_to_payable_checklists")
        self.assertLess(vi_tri_nha, vi_tri_gan)

    def test_nhuong_mot_buoc_khong_dong_ca_hang_muc(self):
        """Chỉ đánh dấu thay thế ĐÚNG bước được nhường, không đụng bước khác."""
        import inspect

        ma_nguon = inspect.getsource(workflow_runtime.claim_node_help)
        self.assertIn("where task_node_id = :task_node_id", ma_nguon)
        self.assertNotIn("where workflow_instance_id", ma_nguon)


class RutLaiLoiNhoTests(unittest.TestCase):
    def test_chi_nguoi_nho_moi_rut_lai_duoc(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "H-1", "task_node_id": "TN-1",
                  "requested_by_employee_id": "NV-CU", "status": "open"})
        ]
        with self.assertRaises(WorkflowValidationError):
            workflow_runtime.cancel_node_help(db, request_id="H-1", employee_id="NV-KHAC")

    def test_da_co_nguoi_nhan_thi_khong_rut_duoc(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "H-1", "task_node_id": "TN-1",
                  "requested_by_employee_id": "NV-CU", "status": "claimed"})
        ]
        with self.assertRaises(TaskClaimConflict):
            workflow_runtime.cancel_node_help(db, request_id="H-1", employee_id="NV-CU")


if __name__ == "__main__":
    unittest.main()
