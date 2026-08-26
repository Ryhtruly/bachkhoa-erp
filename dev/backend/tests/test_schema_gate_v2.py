"""Fallback schema chỉ được che đường ĐỌC, tuyệt đối không che đường GHI.

Đây là chỗ nguy hiểm nhất của cả cửa sổ EXPAND: nếu đường ghi cũng lặng lẽ rơi
về mô hình cũ, Hạng mục mới ra đời theo V1 mà không ai biết, và sai chỉ lộ ra
vài tuần sau khi sổ giấy tờ đếm trùng.
"""
import unittest
from unittest.mock import MagicMock

from fastapi import HTTPException


class CongV2Tests(unittest.TestCase):
    def setUp(self):
        from src.dossiers import register

        self.register = register
        register.reset_schema_cache()

    def tearDown(self):
        self.register.reset_schema_cache()

    @staticmethod
    def _db(co_cot):
        db = MagicMock()
        db.execute.return_value.first.return_value = (1,) if co_cot else None
        return db

    def test_thieu_cot_thi_duong_doc_dung_v1(self):
        self.assertEqual(self.register.register_version(self._db(False), "SL-1"), 1)

    def test_co_cot_thi_doc_dung_version_that(self):
        db = self._db(True)
        db.execute.return_value.scalar.return_value = 2
        self.assertEqual(self.register.register_version(db, "SL-1"), 2)

    def test_thieu_cot_thi_duong_GHI_bi_chan_503(self):
        with self.assertRaises(HTTPException) as treo:
            self.register.require_v2_schema(self._db(False))
        self.assertEqual(treo.exception.status_code, 503)
        # 503 chứ không phải 500: "chưa migrate" là trạng thái tạm và biết trước.
        self.assertIn("chưa được migrate", treo.exception.detail)

    def test_co_cot_thi_duong_ghi_thong(self):
        self.register.require_v2_schema(self._db(True))  # không được ném

    def test_loi_db_khac_phai_nem_chu_khong_coi_la_thieu_cot(self):
        """Mất kết nối / hết quyền / timeout bị nuốt thành 'chạy legacy' là kiểu
        hỏng tệ nhất: hệ thống sai âm thầm trong khi vấn đề thật nằm chỗ khác."""
        db = MagicMock()
        db.execute.side_effect = RuntimeError("mất kết nối")
        with self.assertRaises(RuntimeError):
            self.register._co_cot_register_version(db)

    def test_cache_xoa_duoc(self):
        """Sau khi apply EXPAND phải restart backend. Tiến trình giữ kết quả
        'chưa có cột' trong bộ nhớ là tiếp tục chạy legacy dù CSDL đã sẵn sàng."""
        self.register._co_cot_register_version(self._db(False))
        self.assertFalse(self.register._SCHEMA_CO_VERSION["value"])
        self.register.reset_schema_cache()
        self.assertEqual(self.register._SCHEMA_CO_VERSION, {})
        self.register._co_cot_register_version(self._db(True))
        self.assertTrue(self.register._SCHEMA_CO_VERSION["value"])


class SentinelLuaChonGiayTests(unittest.TestCase):
    """`None` và `[]` phải là hai thứ khác nhau.

    Nếu cùng biểu diễn bằng None thì frontend quên gửi field sẽ bị hiểu thành
    "tự chọn mặc định" — người dùng không chọn gì mà hệ thống vẫn dựng cả bộ.
    """

    def test_sentinel_khac_danh_sach_rong(self):
        from src.contracts.services import TU_DONG_THEO_MAC_DINH, _TuDongTheoMacDinh

        self.assertIsInstance(TU_DONG_THEO_MAC_DINH, _TuDongTheoMacDinh)
        self.assertNotEqual(TU_DONG_THEO_MAC_DINH, [])
        self.assertFalse(isinstance([], _TuDongTheoMacDinh))
        self.assertFalse(isinstance(None, _TuDongTheoMacDinh))


class QuyenXinMienTests(unittest.TestCase):
    """`contract:read` là quyền ĐỌC — không đủ để xin miễn giấy.

    Xin miễn là quyết định nghiệp vụ trên hồ sơ. Nếu chỉ cần quyền xem, bất kỳ
    ai mở được hợp đồng cũng dựng được phiếu lên Hạng mục họ không dính dáng, và
    Giám đốc phải ngồi lọc rác trong hàng chờ.
    """

    def setUp(self):
        from src.dossiers import register

        self.register = register
        register.reset_schema_cache()
        register._SCHEMA_CO_VERSION.update({"value": True, "waiver": True})

    def tearDown(self):
        self.register.reset_schema_cache()

    def _db(self, *, o_thuoc_hd="HD-1", pham_vi="CONTRACT", o_cua_hm=None,
            bat_buoc=True, duoc_giao=True, da_co_tep=False, phieu_hang_muc_khac=None, kind_phieu_cho="WAIVE"):
        """Mock nhận diện theo NỘI DUNG câu lệnh, không theo thứ tự.

        Dùng danh sách side_effect theo thứ tự thì mỗi lần thêm một truy vấn vào
        request_slot_waiver là mọi test ở đây lệch hết — và tệ hơn, chúng lệch
        thành lỗi nghiệp vụ trông có vẻ thật (409 sai chỗ) chứ không phải
        StopIteration dễ nhận ra. Với vai Giám đốc, truy vấn kiểm phân công còn
        bị bỏ qua nên thứ tự khác hẳn vai nhân viên.
        """
        def _tra_loi(cau_lenh, *_args, **_kw):
            sql = str(cau_lenh)
            if "from public.dossier_document_slots s where s.id" in sql:
                return MagicMock(**{"mappings.return_value.first.return_value": {
                    "id": "S-1", "name": "Giấy tờ hôn nhân", "scope": pham_vi,
                    "contract_id": o_thuoc_hd, "service_line_id": o_cua_hm,
                    "is_required": bat_buoc}})
            if "from public.service_lines where id" in sql:
                return MagicMock(**{"mappings.return_value.first.return_value": {
                    "id": "SL-1", "contract_id": "HD-1"}})
            if "task_node_assignments" in sql:
                return MagicMock(**{"first.return_value": (1,) if duoc_giao else None})
            if "dossier_document_links" in sql:
                return MagicMock(**{"first.return_value": (1,) if da_co_tep else None})
            if "select status from public.document_slot_change_requests" in sql:
                return MagicMock(**{"scalar.return_value": None})
            if "coalesce(nullif(sl.service_type" in sql:
                return MagicMock(**{"mappings.return_value.first.return_value":
                                    {"kind": kind_phieu_cho, "ten": phieu_hang_muc_khac}
                                    if phieu_hang_muc_khac else None})
            if "insert into public.document_slot_change_requests" in sql:
                return MagicMock(**{"scalar.return_value": "W-1"})
            raise AssertionError("Truy vấn ngoài dự kiến trong request_slot_waiver:\n" + sql)

        db = MagicMock()
        db.execute.side_effect = _tra_loi
        return db

    def _xin(self, db, **kw):
        return self.register.request_slot_waiver(
            db, "S-1", service_line_id="SL-1",
            reason="Chủ đất độc thân, không có giấy kết hôn",
            requester_id="U-1", **kw)

    def test_khong_duoc_phan_cong_thi_403(self):
        with self.assertRaises(HTTPException) as treo:
            self._xin(self._db(duoc_giao=False))
        self.assertEqual(treo.exception.status_code, 403)

    def test_duoc_phan_cong_dung_hang_muc_thi_tao_duoc(self):
        ket_qua = self._xin(self._db(duoc_giao=True))
        self.assertEqual(ket_qua["status"], "pending")
        self.assertEqual(ket_qua["service_line_id"], "SL-1")

    def test_giam_doc_khong_can_phan_cong(self):
        ket_qua = self._xin(self._db(duoc_giao=False), la_quan_tri=True)
        self.assertEqual(ket_qua["status"], "pending")

    def test_hang_muc_khac_dang_co_phieu_cho_tren_o_dung_chung_thi_409(self):
        """Chỉ số uq_document_slot_change_one_pending còn khoá theo slot_id đơn
        thuần, nên phải chặn TRƯỚC bằng 409 có lời giải thích — để vỡ thành 500
        là ném lỗi hệ thống vào mặt nhân viên. Bản vá chỉ số nằm ở
        supabase/pending/CHUA_DUYET_pending_waiver_theo_hang_muc.sql"""
        with self.assertRaises(HTTPException) as treo:
            self._xin(self._db(phieu_hang_muc_khac="Cắm mốc"))
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("Cắm mốc", treo.exception.detail)
        self.assertIn("xin bỏ chờ duyệt", treo.exception.detail)

    def test_phieu_mo_khoa_dang_cho_thi_bao_dung_la_phieu_sua_khong_doi_ten_hang_muc(self):
        """Lỗi thật đã gặp: ô giấy có phiếu kind='UNLOCK' đang chờ, hệ thống báo
        "Hạng mục *khác* đang có phiếu xin bỏ" — người dùng đi tìm một Hạng mục
        không tồn tại. Chỉ số uq_document_slot_change_one_pending khoá theo
        slot_id nên MỌI kind đều chặn nhau, nhưng thông báo phải nói đúng."""
        with self.assertRaises(HTTPException) as treo:
            self._xin(self._db(phieu_hang_muc_khac="khác", kind_phieu_cho="UNLOCK"))
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("xin sửa/mở khoá", treo.exception.detail)
        self.assertNotIn("Hạng mục", treo.exception.detail)

    def test_o_cua_hang_muc_KHAC_thi_chan(self):
        with self.assertRaises(HTTPException) as treo:
            self._xin(self._db(pham_vi="SERVICE_LINE", o_cua_hm="SL-KHAC"))
        self.assertEqual(treo.exception.status_code, 409)

    def test_o_thuoc_hop_dong_khac_thi_chan(self):
        with self.assertRaises(HTTPException) as treo:
            self._xin(self._db(o_thuoc_hd="HD-KHAC"))
        self.assertEqual(treo.exception.status_code, 409)

    def test_o_khong_bat_buoc_thi_khong_cho_xin(self):
        """Thiếu cũng không sao thì không có gì để miễn."""
        with self.assertRaises(HTTPException) as treo:
            self._xin(self._db(bat_buoc=False))
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("không bắt buộc", treo.exception.detail)

    def test_o_da_co_tai_lieu_thi_khong_cho_xin(self):
        with self.assertRaises(HTTPException) as treo:
            self._xin(self._db(da_co_tep=True))
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("đã có tài liệu", treo.exception.detail)

    def test_ly_do_so_sai_thi_chan_truoc_moi_thu(self):
        with self.assertRaises(HTTPException) as treo:
            self.register.request_slot_waiver(
                MagicMock(), "S-1", service_line_id="SL-1", reason="ko",
                requester_id="U-1")
        self.assertEqual(treo.exception.status_code, 422)


class GiaoThucChonGiayTests(unittest.TestCase):
    """Payload phải nói rõ ý định, không để "thiếu field" mang nghĩa.

    Nếu thiếu field = dùng bộ mặc định thì ba thứ hoàn toàn khác nhau —
    người dùng thật sự chọn mặc định, frontend lỗi, client cũ — đều trông giống
    hệt nhau, và Hạng mục ra đời với bộ giấy chẳng ai quyết định.
    """

    def _giai(self, mode, ids=None):
        from src.contracts.services import phan_giai_lua_chon_giay

        return phan_giai_lua_chon_giay(mode, ids)

    def test_thieu_mode_thi_422(self):
        with self.assertRaises(HTTPException) as treo:
            self._giai(None)
        self.assertEqual(treo.exception.status_code, 422)
        self.assertIn("document_selection_mode", treo.exception.detail)

    def test_mode_la_thi_422(self):
        with self.assertRaises(HTTPException) as treo:
            self._giai("TU_TIEN")
        self.assertEqual(treo.exception.status_code, 422)

    def test_default_tra_sentinel_noi_bo(self):
        from src.contracts.services import _TuDongTheoMacDinh

        self.assertIsInstance(self._giai("DEFAULT"), _TuDongTheoMacDinh)

    def test_default_kem_danh_sach_la_mau_thuan(self):
        with self.assertRaises(HTTPException) as treo:
            self._giai("DEFAULT", ["TPL-1"])
        self.assertEqual(treo.exception.status_code, 422)

    def test_custom_tra_dung_danh_sach(self):
        self.assertEqual(self._giai("CUSTOM", ["TPL-1", "TPL-2"]), ["TPL-1", "TPL-2"])

    def test_custom_rong_thi_422_vi_da_co_NONE(self):
        """'CUSTOM mà rỗng' và 'NONE' giống nhau trong dữ liệu nhưng khác hẳn về
        ý định — bắt nói rõ bằng NONE."""
        with self.assertRaises(HTTPException) as treo:
            self._giai("CUSTOM", [])
        self.assertEqual(treo.exception.status_code, 422)
        self.assertIn("NONE", treo.exception.detail)

    def test_none_tra_danh_sach_rong(self):
        self.assertEqual(self._giai("NONE"), [])
        self.assertEqual(self._giai("NONE", []), [])

    def test_none_kem_danh_sach_la_mau_thuan(self):
        with self.assertRaises(HTTPException) as treo:
            self._giai("NONE", ["TPL-1"])
        self.assertEqual(treo.exception.status_code, 422)

    def test_duong_tu_dong_khai_DEFAULT_tuong_minh_trong_code(self):
        """CRM và đường tạo từ task không dựa vào giá trị mặc định của tham số —
        đọc code phải thấy ngay ý định."""
        import re

        for duong in ("/app/src/routes/routes_crm.py",
                      "/app/src/contracts/services.py"):
            src = open(duong, encoding="utf-8").read()
            self.assertTrue(
                re.search(r'phan_giai_lua_chon_giay\(\s*"DEFAULT"', src),
                f"{duong} phải khai DEFAULT tường minh",
            )

    def test_khong_con_default_parameter_cho_lua_chon_giay(self):
        """Tham số không được có giá trị mặc định: một đường tạo mới quên truyền
        sẽ lặng lẽ dựng cả bộ giấy."""
        import inspect

        from src.contracts.services import _create_initial_service_line

        tham_so = inspect.signature(_create_initial_service_line).parameters
        self.assertIs(tham_so["checklist_template_ids"].default, inspect.Parameter.empty)


class KhongDeLaiDoDangTests(unittest.TestCase):
    """422 phải nổ khi CHƯA có gì được tạo.

    Bảo đảm bằng thứ tự thực thi chứ không dựa vào rollback: phụ thuộc rollback
    nghĩa là mọi đường gọi mới đều phải nhớ bọc try/except cho đúng, và sẽ có
    ngày ai đó quên.
    """

    def test_payload_thieu_mode_thi_khong_cham_db(self):
        from types import SimpleNamespace

        from src.contracts.services import ContractService

        db = MagicMock()
        payload = SimpleNamespace(
            contract_template_id="TPL", contract_id="", customer_name="A",
            phone="0900", address="x", service_type="Đo vẽ", contract_value=1,
            date_signed="2026-08-26", due_date="2026-08-31", sales_source="web",
            document_selection_mode=None, document_template_ids=None,
        )
        with self.assertRaises(HTTPException) as treo:
            ContractService.generate_and_save_contract(db, payload)

        self.assertEqual(treo.exception.status_code, 422)
        # Không contract, không service_line, không slot, không audit.
        db.add.assert_not_called()
        db.execute.assert_not_called()
        db.commit.assert_not_called()

    def test_payload_mau_thuan_thi_cung_khong_cham_db(self):
        from types import SimpleNamespace

        from src.contracts.services import ContractService

        db = MagicMock()
        payload = SimpleNamespace(
            contract_template_id="TPL", contract_id="", customer_name="A",
            phone="0900", address="x", service_type="Đo vẽ", contract_value=1,
            date_signed="2026-08-26", due_date="2026-08-31", sales_source="web",
            document_selection_mode="NONE", document_template_ids=["TPL-1"],
        )
        with self.assertRaises(HTTPException) as treo:
            ContractService.generate_and_save_contract(db, payload)

        self.assertEqual(treo.exception.status_code, 422)
        db.add.assert_not_called()
        db.commit.assert_not_called()


class HangChoDuyetChiuDuocSchemaCuTests(unittest.TestCase):
    """Hàng chờ duyệt phải sống trên schema CHƯA có EXPAND.

    Đây là lỗi đã xảy ra thật: hai truy vấn đọc cột chỉ có sau EXPAND, làm cả
    trang Hàng chờ trả 500 và hiện "Internal Server Error" — hỏng luôn phần
    legacy vốn không liên quan gì tới Sổ V2.
    """

    def tearDown(self):
        from src.dossiers import slot_requests

        slot_requests.reset_kind_cache()

    def test_thieu_cot_kind_thi_dung_gia_tri_mac_dinh(self):
        from src.dossiers import slot_requests

        slot_requests.reset_kind_cache()
        db = MagicMock()
        db.execute.return_value.first.return_value = None  # chưa có cột
        sql = slot_requests._list_query(db)
        self.assertIn("'OUTPUT'::varchar as kind", sql)
        self.assertNotIn("r.kind", sql)

    def test_co_cot_kind_thi_doc_that(self):
        from src.dossiers import slot_requests

        slot_requests.reset_kind_cache()
        db = MagicMock()
        db.execute.return_value.first.return_value = (1,)
        self.assertIn("r.kind", slot_requests._list_query(db))

    def test_khong_truy_van_nao_doc_sl_name(self):
        """service_lines KHÔNG có cột name — viết sl.name là 500 toàn hàng chờ."""
        import re

        for duong in ("/app/src/routes/routes_document_register.py",
                      "/app/src/dossiers/slot_requests.py",
                      "/app/src/dossiers/register.py"):
            src = open(duong, encoding="utf-8").read()
            # Bỏ chú thích SQL và Python: nhắc tên cột trong ghi chú giải thích
            # là hợp lệ, chỉ truy vấn thật mới đáng chặn.
            khong_chu_thich = re.sub(r"--[^\n]*", "", src)
            khong_chu_thich = re.sub(r"^\s*#[^\n]*", "", khong_chu_thich, flags=re.M)
            self.assertIsNone(
                re.search(r"\bsl\.name\b", khong_chu_thich),
                f"{duong} đọc sl.name — cột này không tồn tại",
            )
