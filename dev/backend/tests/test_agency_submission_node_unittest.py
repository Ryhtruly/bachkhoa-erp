"""K05a/K05b là bước nộp cơ quan theo ĐỊNH NGHĨA, không theo cờ tick tay."""

from src.contracts.workflow_runtime import is_agency_submission_node


def test_k05a_and_k05b_are_agency_nodes_even_without_the_flag():
    # Trước đây quên tick là hồ sơ im lặng không được tạo — không có mã biên
    # nhận, không tạm dừng được, mà bước vẫn chạy bình thường nên không ai biết.
    for ma in ("K05a", "K05b"):
        assert is_agency_submission_node(node_code=ma, requires_gov_submission=False)


def test_node_code_match_is_case_insensitive():
    # Dữ liệu cũ từng có cả "K05a" lẫn "K05A" — đúng cái bẫy đã làm hai bước này
    # mất sạch phòng ban và vai trò trước đây.
    assert is_agency_submission_node(node_code="K05A", requires_gov_submission=False)
    assert is_agency_submission_node(node_code=" k05b ", requires_gov_submission=False)


def test_other_nodes_still_follow_the_manual_flag():
    assert not is_agency_submission_node(node_code="K01", requires_gov_submission=False)
    assert is_agency_submission_node(node_code="K01", requires_gov_submission=True)


def test_missing_node_code_is_never_guessed():
    assert not is_agency_submission_node(node_code=None, requires_gov_submission=False)
    assert not is_agency_submission_node(node_code="", requires_gov_submission=False)
