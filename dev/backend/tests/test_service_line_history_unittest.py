"""Lịch sử Hạng mục đã hoàn thành của nhân viên.

Lỗi gốc: badge "Hạng mục đã hoàn thành" đọc `accepted_count` của
`_DAILY_SUMMARY_QUERY` — truy vấn đó đếm TASK_NODE của HÔM NAY. Nguyễn Văn A làm
K01+K02+K03 trong MỘT hạng mục thì badge hiện 3, và sang hôm sau tụt về 0.

Hai điều bộ test này chốt: đơn vị đếm là HẠNG MỤC, và lịch sử là TOÀN THỜI GIAN.
"""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from src.employee_portal.service import _COMPLETED_ITEMS_QUERY, EmployeePortalService


def _luc(hour: int, minute: int) -> datetime:
    """Mốc thời gian thật — DB trả datetime chứ không trả chuỗi."""
    return datetime(2026, 8, 24, hour, minute, tzinfo=timezone.utc)


def _rows(value):
    result = MagicMock()
    result.mappings.return_value.all.return_value = value
    return result


def _hang_muc_cam_moc():
    """Đúng dữ liệu thật của 003/BK-2026: A làm K01–K03, người khác làm K06."""
    return {
        "workflow_instance_id": "WI-1",
        "service_line_id": "SL-1",
        "contract_id": "003/BK-2026",
        "service_line_name": "Cắm mốc",
        "customer_name": "Lê Quang Huy",
        "location_label": "Phường Bồ Đề",
        "my_node_count": 3,
        "last_accepted_at": _luc(15, 2),
        "workflow_done": False,
        "nodes": [
            {"id": "N1", "node_code": "K01", "status": "accepted", "name": "Tiếp nhận", "mine": True},
            {"id": "N2", "node_code": "K02", "status": "accepted", "name": "Khảo sát & đo RTK", "mine": True},
            {"id": "N3", "node_code": "K03", "status": "accepted", "name": "Chuẩn hoá tài liệu", "mine": True},
            {"id": "N4", "node_code": "K06", "status": "accepted", "name": "Bàn giao", "mine": False},
            {"id": "N5", "node_code": "K07", "status": "ready", "name": "Lưu trữ", "mine": False},
        ],
    }


class DemHangMucKhongDemBuocKTests(unittest.TestCase):
    """Đơn vị đếm phải là Hạng mục — đây chính là lỗi người dùng báo."""

    def test_ba_buoc_k_trong_mot_hang_muc_chi_tinh_mot(self):
        db = MagicMock()
        db.execute.side_effect = [_rows([_hang_muc_cam_moc()]), _rows([])]

        result = EmployeePortalService.get_completed_items(db, MagicMock(id="EMP-A"))

        self.assertEqual(result["count"], 1, "3 bước K của cùng một hạng mục vẫn là MỘT hạng mục")
        self.assertEqual(len(result["items"]), 1)

    def test_hai_hang_muc_thi_dem_hai(self):
        khac = dict(_hang_muc_cam_moc(), workflow_instance_id="WI-2", contract_id="004/BK-2026")
        db = MagicMock()
        db.execute.side_effect = [_rows([_hang_muc_cam_moc(), khac]), _rows([])]

        result = EmployeePortalService.get_completed_items(db, MagicMock(id="EMP-A"))

        self.assertEqual(result["count"], 2)


class ChuoiKCuaRiengNhanVienTests(unittest.TestCase):
    """Giống dãy K của tab Giám đốc, nhưng chỉ rõ bước nào là của anh ta."""

    def test_tra_ve_ca_chuoi_va_danh_dau_buoc_cua_minh(self):
        db = MagicMock()
        db.execute.side_effect = [_rows([_hang_muc_cam_moc()]), _rows([])]

        item = EmployeePortalService.get_completed_items(db, MagicMock(id="EMP-A"))["items"][0]

        self.assertEqual([node["node_code"] for node in item["nodes"]],
                         ["K01", "K02", "K03", "K06", "K07"])
        self.assertEqual([node["node_code"] for node in item["nodes"] if node["mine"]],
                         ["K01", "K02", "K03"])

    def test_hang_muc_con_buoc_cua_phong_khac_thi_chua_dong_tron_ven(self):
        """Phần của anh ta xong, nhưng hạng mục vẫn còn K07 — phải nói thật."""
        db = MagicMock()
        db.execute.side_effect = [_rows([_hang_muc_cam_moc()]), _rows([])]

        item = EmployeePortalService.get_completed_items(db, MagicMock(id="EMP-A"))["items"][0]

        self.assertFalse(item["workflow_done"])
        self.assertEqual(item["my_node_count"], 3)

    def test_gan_minh_chung_da_nop_vao_dung_buoc(self):
        """"Anh ta đã nộp gì" — checklist gắn vào từng bước để xem lại được."""
        db = MagicMock()
        db.execute.side_effect = [
            _rows([_hang_muc_cam_moc()]),
            _rows([
                {"id": "C1", "task_node_id": "N2", "checklist_name": "Ảnh hiện trạng",
                 "status": "approved", "submitted_at": _luc(13, 54),
                 "evidence_data": {"files": [{"name": "anh.jpg"}]}},
                {"id": "C2", "task_node_id": "N3", "checklist_name": "File CAD",
                 "status": "approved", "submitted_at": _luc(15, 2),
                 "evidence_data": None},
            ]),
        ]

        item = EmployeePortalService.get_completed_items(db, MagicMock(id="EMP-A"))["items"][0]
        theo_buoc = {node["node_code"]: node.get("checklist", []) for node in item["nodes"]}

        self.assertEqual([row["name"] for row in theo_buoc["K02"]], ["Ảnh hiện trạng"])
        self.assertEqual([row["name"] for row in theo_buoc["K03"]], ["File CAD"])
        self.assertEqual(theo_buoc["K01"], [])
        # Bước của người khác không kéo theo minh chứng — đây là lịch sử của anh ta.
        self.assertEqual(theo_buoc["K06"], [])


class TruyVanLichSuTests(unittest.TestCase):
    """Chốt hợp đồng của câu SQL: sai một mệnh đề là sai cả con số."""

    def test_khong_gioi_han_trong_ngay_hom_nay(self):
        """Lịch sử mà lọc theo ngày thì hôm sau badge tụt về 0."""
        self.assertNotIn("date_trunc('day', now())", str(_COMPLETED_ITEMS_QUERY).lower())

    def test_gom_theo_hang_muc_chu_khong_theo_node(self):
        emitted = str(_COMPLETED_ITEMS_QUERY).lower()
        self.assertIn("workflow_instance_id", emitted)
        self.assertIn("service_lines", emitted)

    def test_loai_hang_muc_van_con_buoc_do_dang_cua_chinh_nguoi_do(self):
        """Còn bước dở của anh ta thì đó là TẢI đang giữ, không phải lịch sử."""
        emitted = str(_COMPLETED_ITEMS_QUERY).lower()
        self.assertIn("not exists", emitted)
        self.assertIn("'accepted', 'cancelled', 'skipped'", emitted)


if __name__ == "__main__":
    unittest.main()
