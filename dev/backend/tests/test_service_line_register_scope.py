"""Sổ giấy tờ của một Hạng mục chỉ chứa giấy của CHÍNH Gói + Hạng mục đó.

Lỗi đã gặp trên hợp đồng thật: master data khai 18 loại giấy cho hạng mục, nhưng
sổ tạo ra **49 ô** — 31 ô không thuộc về nó.

Nguyên nhân: chỗ dựng sổ quét thẳng danh mục mẫu bằng luật cũ

    (t.task_type_id is null AND t.source in ('CONG_TY','CO_QUAN'))  hoặc  t.task_type_id = ...

Vế đầu vơ **mọi** giấy công ty soạn và cơ quan trả chưa gắn thủ tục — bất kể Gói
nào, Hạng mục nào. Hệ quả dây chuyền: tủ hồ sơ bày cả kho giấy công ty; 31 ô thừa
không có node_code nên hiện "chưa phân bước", trông như Giám đốc quên gán; và cổng
kích hoạt quy trình đòi phân bổ một đống giấy không liên quan.

Bảng ``document_template_applicabilities`` — tab Mẫu giấy tờ — mới là nguồn sự
thật, và nó khai đủ bốn trục Gói → Hạng mục → Node → Loại giấy.
"""

import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import thieu_bang


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class ServiceLineRegisterScopeTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = thieu_bang(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        from src.dossiers import register

        self.register = register
        self._dung_boi_canh()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── dựng bối cảnh ──

    def _dung_boi_canh(self):
        """Hai Gói, mỗi Gói một Dạng hồ sơ, và một kho mẫu giấy dùng chung."""
        self.goi_a, self.goi_b = _id("P"), _id("P")
        for goi, ten in ((self.goi_a, "Gói Đo vẽ"), (self.goi_b, "Gói Pháp lý")):
            self.db.execute(
                text("insert into public.service_packages (id, name) values (:id, :n)"),
                {"id": goi, "n": ten},
            )

        self.thu_tuc_a, self.thu_tuc_b = _id("TT"), _id("TT")
        for tt, goi, ten in ((self.thu_tuc_a, self.goi_a, "Tách thửa"),
                             (self.thu_tuc_b, self.goi_b, "Hoàn công")):
            self.db.execute(
                text("insert into public.task_types (id, name, service_package_id)"
                     " values (:id, :n, :p)"),
                {"id": tt, "n": ten, "p": goi},
            )

        self.hop_dong = _id("HD")
        self.db.execute(text("insert into public.contracts (id) values (:id)"),
                        {"id": self.hop_dong})
        self.hang_muc = _id("SL")
        self.db.execute(
            text("insert into public.service_lines (id, contract_id, task_type_id,"
                 " service_package_id) values (:id, :c, :tt, :p)"),
            {"id": self.hang_muc, "c": self.hop_dong, "tt": self.thu_tuc_a, "p": self.goi_a},
        )

    def _mau(self, ten, source, *, task_type_id=None):
        ma = _id("TPL")
        self.db.execute(
            text("""
                insert into public.document_checklist_templates
                    (id, name, source, is_required, needs_original, default_quantity,
                     sort_order, is_active, task_type_id)
                values (:id, :n, :s, false, false, 1, 0, true, :tt)
            """),
            {"id": ma, "n": ten, "s": source, "tt": task_type_id},
        )
        return ma

    def _khai(self, template_id, kieu, *, goi=None, thu_tuc=None, node="K01"):
        self.db.execute(
            text("""
                insert into public.document_template_applicabilities
                    (template_id, applicability_type, service_package_id, task_type_id,
                     node_code, is_default)
                values (:t, :k, :p, :tt, :n, true)
            """),
            {"t": template_id, "k": kieu, "p": goi, "tt": thu_tuc, "n": node},
        )

    def _dung_so(self):
        return self.register.open_service_line_register(self.db, self.hang_muc)

    def _ten_o_giay(self):
        return sorted(row[0] for row in self.db.execute(
            text("select name from public.dossier_document_slots where service_line_id = :s"),
            {"s": self.hang_muc},
        ).all())

    # ── test ──

    def test_a_company_document_of_another_package_never_lands_in_this_register(self):
        self._khai(self._mau("Bản vẽ của gói này", "CONG_TY"), "PACKAGE", goi=self.goi_a)
        self._khai(self._mau("Bản vẽ của gói khác", "CONG_TY"), "PACKAGE", goi=self.goi_b)

        self._dung_so()

        # Đây là lỗi gốc: luật cũ vơ mọi giấy CONG_TY chưa gắn thủ tục, bất kể gói.
        self.assertEqual(self._ten_o_giay(), ["Bản vẽ của gói này"])

    def test_a_company_document_nobody_declared_never_lands_here(self):
        self._khai(self._mau("Bản vẽ có khai", "CONG_TY"), "PACKAGE", goi=self.goi_a)
        # Mẫu tồn tại trong danh mục nhưng KHÔNG có dòng khai nào — không thuộc
        # gói hay hạng mục nào cả.
        self._mau("Bản vẽ chưa ai khai", "CONG_TY")

        self._dung_so()

        self.assertEqual(self._ten_o_giay(), ["Bản vẽ có khai"])

    def test_an_agency_document_of_another_package_never_lands_here(self):
        self._khai(self._mau("Biên nhận gói này", "CO_QUAN"), "PACKAGE", goi=self.goi_a)
        self._khai(self._mau("Biên nhận gói khác", "CO_QUAN"), "PACKAGE", goi=self.goi_b)

        self._dung_so()

        self.assertEqual(self._ten_o_giay(), ["Biên nhận gói này"])

    def test_a_globally_declared_document_lands_in_every_register(self):
        self._khai(self._mau("Phiếu tiếp nhận", "CONG_TY"), "GLOBAL")

        self._dung_so()

        # GLOBAL là khai có chủ đích "mọi gói đều dùng" — khác hẳn "chưa ai khai".
        self.assertEqual(self._ten_o_giay(), ["Phiếu tiếp nhận"])

    def test_a_document_declared_for_this_procedure_lands_here(self):
        self._khai(self._mau("Giấy riêng thủ tục này", "CONG_TY"),
                   "TASK_TYPE", thu_tuc=self.thu_tuc_a)
        self._khai(self._mau("Giấy riêng thủ tục khác", "CONG_TY"),
                   "TASK_TYPE", thu_tuc=self.thu_tuc_b)

        self._dung_so()

        self.assertEqual(self._ten_o_giay(), ["Giấy riêng thủ tục này"])

    def test_customer_documents_of_the_shared_set_stay_at_contract_level(self):
        self._khai(self._mau("Sổ đỏ", "KHACH_HANG"), "PACKAGE", goi=self.goi_a)

        self._dung_so()

        # Giấy khách đưa nằm ở sổ GỐC hợp đồng. Kê lại ở hạng mục là bắt nhân
        # viên scan hai lần cùng một tờ.
        self.assertEqual(self._ten_o_giay(), [])

    def test_but_a_customer_document_specific_to_this_procedure_does_land_here(self):
        self._khai(self._mau("Giấy phép xây dựng", "KHACH_HANG"),
                   "TASK_TYPE", thu_tuc=self.thu_tuc_a)

        self._dung_so()

        # Hoàn công đòi Giấy phép xây dựng — chỉ thủ tục đó mới cần, nên nó thuộc
        # về sổ hạng mục chứ không phải bộ chung của hợp đồng.
        self.assertEqual(self._ten_o_giay(), ["Giấy phép xây dựng"])

    def test_running_it_twice_does_not_duplicate_slots(self):
        self._khai(self._mau("Bản vẽ", "CONG_TY"), "PACKAGE", goi=self.goi_a)

        self.assertEqual(self._dung_so(), 1)
        self.assertEqual(self._dung_so(), 0)
        self.assertEqual(self._ten_o_giay(), ["Bản vẽ"])

    def test_nothing_declared_means_an_empty_register_not_the_whole_catalogue(self):
        self._mau("Giấy chưa ai khai", "CONG_TY")
        self._mau("Giấy khác cũng chưa khai", "CO_QUAN")

        self.assertEqual(self._dung_so(), 0)
        # Im lặng chứ không rơi về "cho hết" — đúng nguyên tắc applicable_templates
        # đã ghi sẵn trong docstring của nó.
        self.assertEqual(self._ten_o_giay(), [])
