"""Ai được bấm nộp nghiệm thu cả gói.

Lỗi thật đã gặp: cổng nộp chặn cứng ``role_code = 'MAIN'``, trong khi K05a và
K05b khai đúng một vai trò là ``SUBMITTER``. Người được giao đúng vai trò ở hai
bước đó không nộp được — hồ sơ nộp cơ quan xong nằm chết ở ``in_progress`` mà
không ai hiểu vì sao.
"""

from src.contracts.workflow_runtime import (
    SUBMIT_CAPABLE_ROLES,
    TASK_POOL_ROLES_BY_NODE_CODE,
)


def test_every_node_has_at_least_one_role_that_can_submit():
    """Bất biến quan trọng nhất của file này.

    Khai một bước mà không vai trò nào nộp được thì bước đó đi vào ngõ cụt: nhân
    viên làm xong, gán đủ giấy, rồi không có nút nào bấm tiếp. Test này bắt lỗi
    ấy ngay lúc thêm bước mới, chứ không đợi tới lúc chạy thật.
    """
    dead_ends = {
        code: roles
        for code, roles in TASK_POOL_ROLES_BY_NODE_CODE.items()
        if not set(roles) & set(SUBMIT_CAPABLE_ROLES)
    }
    assert dead_ends == {}, f"Bước không ai nộp nghiệm thu được: {dead_ends}"


def test_submitter_can_submit_because_k05a_and_k05b_have_no_main():
    # Hai bước này KHÔNG khai MAIN, nên bỏ SUBMITTER ra khỏi danh sách là chúng
    # lập tức thành ngõ cụt.
    assert "SUBMITTER" in SUBMIT_CAPABLE_ROLES
    for code in ("K05a", "K05b"):
        assert "MAIN" not in TASK_POOL_ROLES_BY_NODE_CODE[code]


def test_assistant_can_never_submit_the_whole_node():
    # Thợ phụ hoàn thiện phần mình rồi thôi. Ai cũng nộp được thì một người bấm
    # sớm là khoá luôn phần người khác đang làm dở.
    assert "ASSISTANT" not in SUBMIT_CAPABLE_ROLES
