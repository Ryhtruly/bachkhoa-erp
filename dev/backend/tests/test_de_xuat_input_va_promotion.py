"""Luồng INPUT / needs_more / promotion có phạm vi."""
import unittest
from unittest.mock import MagicMock

from fastapi import HTTPException


def _mau(id_mau, **ghi_de):
    """Một dòng document_checklist_templates, mặc định tương thích hoàn toàn."""
    goc = {"id": id_mau, "name": "Giấy uỷ quyền", "source": "KHACH_HANG",
           "is_active": True, "is_required": False, "needs_original": False,
           "default_quantity": 1, "note": None}
    goc.update(ghi_de)
    return goc


def _row(value):
    r = MagicMock()
    r.mappings.return_value.first.return_value = value
    return r


class GuardTepTheoLoaiTests(unittest.TestCase):
    """OUTPUT phải có tệp mới gửi được; INPUT thì không."""

    def _gui(self, kind, so_tep):
        from src.dossiers import slot_requests

        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "Q1", "status": "draft", "kind": kind,
                  "contract_id": "HD-1", "service_line_id": "SL-1",
                  "task_node_id": "N1", "checklist_result_id": "CR1",
                  "proposed_name": "Giấy lạ", "approved_name": None, "quantity": 1,
                  "approved_quantity": None, "source": "KHACH_HANG",
                  "created_slot_id": None, "requested_by": "NV",
                  "required_before_submit": False, "needs_director_approval": False}),
            MagicMock(**{"scalar.return_value": so_tep}),
            MagicMock(), MagicMock(), MagicMock(),
        ]
        return slot_requests.submit_request(db, "Q1", actor_id="NV")

    def test_output_khong_tep_thi_chan(self):
        with self.assertRaises(HTTPException) as treo:
            self._gui("OUTPUT", 0)
        self.assertEqual(treo.exception.status_code, 422)

    def test_input_khong_tep_van_gui_duoc(self):
        """Nhân viên phát hiện hồ sơ cần một tờ mà khách chưa đưa. Bắt phải có
        tệp mới được khai là đẩy họ về đúng chỗ cũ — tải đại thứ gì đó cho qua."""
        self._gui("INPUT", 0)  # không được ném

    def test_output_co_tep_thi_gui_duoc(self):
        self._gui("OUTPUT", 2)


class PromotionCoPhamViTests(unittest.TestCase):
    """Không có chuyện đề xuất tự biến thành mẫu dùng chung khi duyệt."""

    def _promote(self, scope):
        from src.dossiers import slot_requests

        db = MagicMock()
        db.execute.side_effect = [
            _row({"task_type_id": "T-TT", "service_package_id": "P-PL"}),
            # Mẫu trùng tên VÀ trùng nguồn VÀ đang hoạt động -> dùng lại.
            MagicMock(**{"mappings.return_value.all.return_value": [
                {"id": "TPL-CO-SAN", "name": "Giấy lạ", "source": "KHACH_HANG",
                 "is_active": True, "is_required": False, "needs_original": False,
                 "default_quantity": 1, "note": None},
            ]}),
            MagicMock(), MagicMock(),
        ]
        slot_requests._promote_theo_pham_vi(
            db, request={"service_line_id": "SL-1"}, promotion_scope=scope,
            ten_chinh_thuc="Giấy lạ", nguon="KHACH_HANG", so_luong=1,
            bat_buoc=False, can_ban_chinh=False, actor_id="GD", request_id="Q1",
        )
        return db

    def test_mac_dinh_khong_ghi_pham_vi_nao(self):
        """Không chọn phạm vi = chỉ Hạng mục hiện tại. Ô runtime đã đủ."""
        from src.dossiers import slot_requests

        db = MagicMock()
        slot_requests._promote_theo_pham_vi(
            db, request={"service_line_id": "SL-1"}, promotion_scope=None,
            ten_chinh_thuc="Giấy lạ", nguon="KHACH_HANG", so_luong=1,
            bat_buoc=False, can_ban_chinh=False, actor_id="GD", request_id="Q1",
        )
        db.execute.assert_not_called()

    def test_chi_hang_muc_nay_cung_khong_ghi(self):
        from src.dossiers import slot_requests

        db = MagicMock()
        slot_requests._promote_theo_pham_vi(
            db, request={"service_line_id": "SL-1"}, promotion_scope="HANG_MUC_NAY",
            ten_chinh_thuc="Giấy lạ", nguon="KHACH_HANG", so_luong=1,
            bat_buoc=False, can_ban_chinh=False, actor_id="GD", request_id="Q1",
        )
        db.execute.assert_not_called()

    def test_task_type_ghi_dung_cot_dang_ho_so(self):
        db = self._promote("TASK_TYPE")
        thamso = [c.args[1] for c in db.execute.call_args_list if len(c.args) > 1]
        ghi = [t for t in thamso if t.get("loai") == "TASK_TYPE"][0]
        self.assertEqual(ghi["dang"], "T-TT")
        self.assertIsNone(ghi["goi"])

    def test_package_ghi_dung_cot_goi(self):
        db = self._promote("PACKAGE")
        thamso = [c.args[1] for c in db.execute.call_args_list if len(c.args) > 1]
        ghi = [t for t in thamso if t.get("loai") == "PACKAGE"][0]
        self.assertEqual(ghi["goi"], "P-PL")
        self.assertIsNone(ghi["dang"])

    def test_global_khong_ghi_khoa_nao(self):
        db = self._promote("GLOBAL")
        thamso = [c.args[1] for c in db.execute.call_args_list if len(c.args) > 1]
        ghi = [t for t in thamso if t.get("loai") == "GLOBAL"][0]
        self.assertIsNone(ghi["goi"])
        self.assertIsNone(ghi["dang"])

    def test_pham_vi_bia_thi_chan(self):
        from src.dossiers import slot_requests

        with self.assertRaises(HTTPException) as treo:
            slot_requests._promote_theo_pham_vi(
                db=MagicMock(), request={"service_line_id": "SL-1"},
                promotion_scope="TOAN_VU_TRU", ten_chinh_thuc="x", nguon="KHACH_HANG",
                so_luong=1, bat_buoc=False, can_ban_chinh=False,
                actor_id="GD", request_id="Q1",
            )
        self.assertEqual(treo.exception.status_code, 422)


class TaiDungTemplateAnToanTests(unittest.TestCase):
    """Trùng tên chưa đủ để coi là cùng một loại giấy.

    "Giấy uỷ quyền" khách đưa và "Giấy uỷ quyền" công ty soạn là hai thứ khác
    hẳn. Nối nhầm thì mọi Hạng mục tương lai nhận sai nguồn, mà sửa một chỗ lại
    làm hỏng chỗ kia.
    """

    def _chay(self, cac_mau_trung_ten, nguon_moi="KHACH_HANG",
              so_luong=1, bat_buoc=False, can_ban_chinh=False):
        from src.dossiers import slot_requests

        db = MagicMock()
        db.execute.side_effect = [
            _row({"task_type_id": "T-TT", "service_package_id": "P-PL"}),
            MagicMock(**{"mappings.return_value.all.return_value": cac_mau_trung_ten}),
            MagicMock(**{"scalar.return_value": "TPL-MOI"}),
            MagicMock(), MagicMock(),
        ]
        slot_requests._promote_theo_pham_vi(
            db, request={"service_line_id": "SL-1"}, promotion_scope="TASK_TYPE",
            ten_chinh_thuc="Giấy uỷ quyền", nguon=nguon_moi, so_luong=so_luong,
            bat_buoc=bat_buoc, can_ban_chinh=can_ban_chinh,
            actor_id="GD", request_id="Q1",
        )
        return db

    def test_trung_ten_va_trung_nguon_thi_dung_lai(self):
        db = self._chay([_mau("TPL-CU")])
        thamso = [c.args[1] for c in db.execute.call_args_list if len(c.args) > 1]
        self.assertEqual([t for t in thamso if "tpl" in t][0]["tpl"], "TPL-CU")

    def test_trung_ten_khac_nguon_thi_TU_CHOI_chu_khong_noi_bua(self):
        with self.assertRaises(HTTPException) as treo:
            self._chay([_mau("TPL-CU", source="CONG_TY")])
        self.assertEqual(treo.exception.status_code, 409)
        # Thông báo nay nêu ĐÍCH DANH chỗ lệch để Giám đốc biết phải quyết gì.
        self.assertIn("nguồn Công ty soạn/lập ≠ Khách hàng cung cấp", treo.exception.detail)

    def test_trung_ten_nhung_mau_da_tat_thi_cung_tu_choi(self):
        """Không tự bật lại mẫu đã tắt — Giám đốc tắt nó là có lý do."""
        with self.assertRaises(HTTPException) as treo:
            self._chay([_mau("TPL-CU", is_active=False)])
        self.assertEqual(treo.exception.status_code, 409)

    def test_khong_trung_gi_thi_tao_mau_moi(self):
        db = self._chay([])
        thamso = [c.args[1] for c in db.execute.call_args_list if len(c.args) > 1]
        self.assertEqual([t for t in thamso if "tpl" in t][0]["tpl"], "TPL-MOI")


class SoCauHinhMauTests(unittest.TestCase):
    """Cùng tên + cùng nguồn vẫn có thể là hai loại giấy khác nhau."""

    def _chay(self, mau_cu, **chot_moi):
        from src.dossiers import slot_requests

        db = MagicMock()
        db.execute.side_effect = [
            _row({"task_type_id": "T-TT", "service_package_id": "P-PL"}),
            MagicMock(**{"mappings.return_value.all.return_value": [mau_cu]}),
            MagicMock(**{"scalar.return_value": "TPL-MOI"}),
            MagicMock(), MagicMock(),
        ]
        tham_so = {"so_luong": 1, "bat_buoc": False, "can_ban_chinh": False}
        tham_so.update(chot_moi)
        slot_requests._promote_theo_pham_vi(
            db, request={"service_line_id": "SL-1"}, promotion_scope="TASK_TYPE",
            ten_chinh_thuc="Giấy uỷ quyền", nguon="KHACH_HANG",
            actor_id="GD", request_id="Q1", **tham_so,
        )
        return db

    def test_khac_yeu_cau_ban_chinh_thi_khong_tu_dung_lai(self):
        with self.assertRaises(HTTPException) as treo:
            self._chay(_mau("TPL-CU", needs_original=True), can_ban_chinh=False)
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("bản chính", treo.exception.detail)

    def test_khac_so_luong_mac_dinh_thi_khong_tu_dung_lai(self):
        with self.assertRaises(HTTPException) as treo:
            self._chay(_mau("TPL-CU", default_quantity=2), so_luong=1)
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("số lượng", treo.exception.detail)

    def test_khac_mac_dinh_bat_buoc_thi_khong_tu_dung_lai(self):
        with self.assertRaises(HTTPException) as treo:
            self._chay(_mau("TPL-CU", is_required=True), bat_buoc=False)
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("bắt buộc", treo.exception.detail)

    def test_tuong_thich_hoan_toan_thi_dung_lai_dung_mau_do(self):
        db = self._chay(_mau("TPL-CU"))
        thamso = [c.args[1] for c in db.execute.call_args_list if len(c.args) > 1]
        self.assertEqual([t for t in thamso if "tpl" in t][0]["tpl"], "TPL-CU")

    def test_conflict_thi_KHONG_tao_mau_hay_pham_vi_nao(self):
        """Xung đột phải dừng sạch: không mẫu mới, không applicability, và vì
        route rollback nên cũng không còn slot runtime."""
        from src.dossiers import slot_requests

        db = MagicMock()
        db.execute.side_effect = [
            _row({"task_type_id": "T-TT", "service_package_id": "P-PL"}),
            MagicMock(**{"mappings.return_value.all.return_value": [
                _mau("TPL-CU", needs_original=True)]}),
        ]
        with self.assertRaises(HTTPException):
            slot_requests._promote_theo_pham_vi(
                db, request={"service_line_id": "SL-1"}, promotion_scope="TASK_TYPE",
                ten_chinh_thuc="Giấy uỷ quyền", nguon="KHACH_HANG", so_luong=1,
                bat_buoc=False, can_ban_chinh=False, actor_id="GD", request_id="Q1",
            )
        cau_lenh = " ".join(str(c.args[0]) for c in db.execute.call_args_list)
        self.assertNotIn("insert into public.document_checklist_templates", cau_lenh)
        self.assertNotIn("insert into public.document_template_applicabilities", cau_lenh)

    def test_sort_order_khong_duoc_tinh_la_khac_biet(self):
        """Thứ tự hiển thị không đổi ý nghĩa tờ giấy."""
        db = self._chay(_mau("TPL-CU"))
        self.assertTrue(db.execute.called)
