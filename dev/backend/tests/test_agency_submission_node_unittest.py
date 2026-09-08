"""K05b là bước nộp cơ quan một cửa theo ĐỊNH NGHĨA.

K05a là nộp nội nghiệp kỹ thuật (Đo vẽ), chỉ coi là bước nộp cơ quan nếu
chủ động bật cờ requires_gov_submission.
"""

import unittest
from src.contracts.workflow_runtime import is_agency_submission_node


class AgencySubmissionNodeTestCase(unittest.TestCase):
    def test_k05b_is_agency_node_even_without_the_flag(self):
        # K05b theo dõi một cửa Pháp lý: quên tick cờ thì hệ thống vẫn tự nhận diện
        self.assertTrue(is_agency_submission_node(node_code="K05b", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code="K05B", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code=" k05b ", requires_gov_submission=False))

    def test_k05a_is_survey_technical_submission_unless_flagged(self):
        # K05a nộp nội nghiệp (Đo vẽ) nộp xong là hết việc, không theo dõi vòng đời
        self.assertFalse(is_agency_submission_node(node_code="K05a", requires_gov_submission=False))
        self.assertFalse(is_agency_submission_node(node_code="K05A", requires_gov_submission=False))
        # Nếu Giám đốc chủ động bật cờ nộp cơ quan cho K05a thì vẫn được nhận diện
        self.assertTrue(is_agency_submission_node(node_code="K05a", requires_gov_submission=True))

    def test_other_nodes_follow_the_manual_flag(self):
        self.assertFalse(is_agency_submission_node(node_code="K01", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code="K01", requires_gov_submission=True))
        self.assertFalse(is_agency_submission_node(node_code="K04", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code="K04", requires_gov_submission=True))

    def test_missing_node_code_is_never_guessed(self):
        self.assertFalse(is_agency_submission_node(node_code=None, requires_gov_submission=False))
        self.assertFalse(is_agency_submission_node(node_code="", requires_gov_submission=False))
        self.assertTrue(is_agency_submission_node(node_code=None, requires_gov_submission=True))


if __name__ == "__main__":
    unittest.main()
