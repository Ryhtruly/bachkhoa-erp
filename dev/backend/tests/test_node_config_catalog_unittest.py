"""Cấu hình bước đọc từ danh mục DB, và đường lùi về hằng số.

Điểm phải giữ bằng mọi giá: chưa nạp cấu hình thì hành vi PHẢI y hệt lúc chưa có
lớp này. Nhờ vậy mã mới lên trước migration cũng không gãy, và ngược lại — hai
thứ không phải lên cùng một lúc.
"""

import unittest

from src.contracts.workflow_runtime import (
    TASK_POOL_DEPARTMENTS_BY_NODE_CODE,
    clear_node_config,
    node_allows_gov_tracking,
    node_allows_pause,
    node_cluster_code,
    node_sla_hours,
    set_node_config,
    task_pool_department_code,
    task_pool_departments,
    task_pool_roles,
)


class NodeConfigFallbackTests(unittest.TestCase):
    def tearDown(self):
        # Bộ nhớ cấu hình sống ở cấp module. Không dọn là test sau thừa hưởng
        # cấu hình của test trước và xanh vì lý do sai.
        clear_node_config()

    def test_nothing_loaded_falls_back_to_the_code_constants(self):
        clear_node_config()

        self.assertEqual(task_pool_departments("K02"), ("SURVEY",))
        self.assertEqual(task_pool_roles("K05a"), ("SUBMITTER",))
        self.assertEqual(task_pool_department_code("K01"), "SALES")

    def test_a_node_missing_from_the_catalog_still_falls_back(self):
        # Danh mục có khai, nhưng không khai bước này. Đây là ca hay gặp nhất khi
        # thêm bước mới: dòng danh mục chưa kịp có, việc vẫn phải chạy.
        set_node_config([{"code": "K01", "allowed_departments": ["LEGAL"]}])

        self.assertEqual(
            task_pool_departments("K02"),
            TASK_POOL_DEPARTMENTS_BY_NODE_CODE["K02"],
        )

    def test_a_null_column_falls_back_instead_of_returning_empty(self):
        # Cột null nghĩa là CHƯA KHAI, không phải "khai là không phòng nào". Trả
        # về tuple rỗng ở đây là khoá luôn bể việc của bước đó.
        set_node_config([{"code": "K02", "allowed_departments": None, "default_roles": None}])

        self.assertEqual(task_pool_departments("K02"), ("SURVEY",))
        self.assertEqual(task_pool_roles("K02"), ("MAIN", "ASSISTANT"))

    def test_the_catalog_overrides_the_constants(self):
        set_node_config([{
            "code": "K02",
            "allowed_departments": ["legal"],
            "default_roles": ["submitter"],
        }])

        # Đây là toàn bộ lý do mục này tồn tại: đổi phòng ban bằng một câu update,
        # không phải một lần deploy.
        self.assertEqual(task_pool_departments("K02"), ("LEGAL",))
        self.assertEqual(task_pool_roles("K02"), ("SUBMITTER",))

    def test_the_workflow_graph_still_beats_the_catalog(self):
        set_node_config([{"code": "K02", "allowed_departments": ["LEGAL"]}])

        # Giám đốc đặt riêng cho MỘT hạng mục thì phải thắng mặc định danh mục,
        # nếu không cấu hình riêng của hạng mục thành vô nghĩa.
        self.assertEqual(
            task_pool_departments("K02", {"pool_department_codes": ["SURVEY"]}),
            ("SURVEY",),
        )

    def test_junk_in_the_array_is_dropped_not_passed_through(self):
        set_node_config([{"code": "K02", "allowed_departments": ["", "  ", "survey"]}])

        self.assertEqual(task_pool_departments("K02"), ("SURVEY",))

    def test_an_all_junk_array_falls_back_rather_than_locking_the_node(self):
        set_node_config([{"code": "K02", "allowed_departments": ["", "   "]}])

        self.assertEqual(task_pool_departments("K02"), ("SURVEY",))


class NodeCapabilityFlagTests(unittest.TestCase):
    def tearDown(self):
        clear_node_config()

    def test_flags_read_what_the_catalog_says(self):
        set_node_config([
            {"code": "K05a", "allow_pause": True, "cluster_code": "SURVEY_TECH"},
            {"code": "K05b", "allow_pause": True, "allow_gov_tracking": True,
             "cluster_code": "LEGAL_DOSSIER", "sla_hours": 48},
        ])

        self.assertTrue(node_allows_pause("K05a"))
        self.assertTrue(node_allows_pause("K05b"))
        # K05a nộp xong là hết việc với cơ quan — chỉ K05b mới theo dõi tiến độ.
        self.assertFalse(node_allows_gov_tracking("K05a"))
        self.assertTrue(node_allows_gov_tracking("K05b"))
        self.assertEqual(node_cluster_code("K05a"), "SURVEY_TECH")
        self.assertEqual(node_sla_hours("K05b"), 48)

    def test_an_unconfigured_node_may_not_pause(self):
        clear_node_config()

        # Chưa khai thì KHÔNG cho tạm dừng. Mở nhầm nguy hơn khoá nhầm: khoá nhầm
        # thì có người kêu, mở nhầm thì hồ sơ đứng im mà đồng hồ KPI vẫn dừng.
        self.assertFalse(node_allows_pause("K05a"))
        self.assertFalse(node_allows_gov_tracking("K05b"))
        self.assertIsNone(node_cluster_code("K02"))
        self.assertIsNone(node_sla_hours("K02"))

    def test_the_two_clusters_cover_every_standard_node_exactly_once(self):
        set_node_config([
            {"code": "K01", "cluster_code": "LEGAL_DOSSIER"},
            {"code": "K02", "cluster_code": "SURVEY_TECH"},
            {"code": "K03", "cluster_code": "SURVEY_TECH"},
            {"code": "K04", "cluster_code": "LEGAL_DOSSIER"},
            {"code": "K05a", "cluster_code": "SURVEY_TECH"},
            {"code": "K05b", "cluster_code": "LEGAL_DOSSIER"},
            {"code": "K06", "cluster_code": "LEGAL_DOSSIER"},
            {"code": "K07", "cluster_code": "LEGAL_DOSSIER"},
        ])

        # Bước rơi ra ngoài mọi cụm là bước không ai nhận được bằng đường nhận cụm
        # — nó lặng lẽ biến mất khỏi luồng nhận việc mới.
        codes = ("K01", "K02", "K03", "K04", "K05a", "K05b", "K06", "K07")
        assigned = {code: node_cluster_code(code) for code in codes}
        self.assertNotIn(None, assigned.values(), f"Bước chưa thuộc cụm nào: {assigned}")

        survey = [code for code in codes if node_cluster_code(code) == "SURVEY_TECH"]
        legal = [code for code in codes if node_cluster_code(code) == "LEGAL_DOSSIER"]
        self.assertEqual(survey, ["K02", "K03", "K05a"])
        self.assertEqual(legal, ["K01", "K04", "K05b", "K06", "K07"])
