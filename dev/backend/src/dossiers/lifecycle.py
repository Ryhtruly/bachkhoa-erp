"""Vòng đời hồ sơ — MỘT nơi duy nhất định nghĩa "hồ sơ đã kết thúc chưa".

Trước đây mỗi phân hệ tự định nghĩa một kiểu: bên Đo vẽ chặn sửa theo một danh
sách, bên Pháp lý theo danh sách khác, frontend lại tự đoán thêm lần nữa. Ba nơi
cùng trả lời một câu hỏi thì sớm muộn cũng lệch nhau — và đã lệch thật.

Từ nay: backend là nơi duy nhất quyết định, và trả về cờ `is_locked` cho giao diện.
"""

from fastapi import HTTPException

# Hồ sơ chạm một trong các trạng thái này là xong việc, không sửa được nữa.
# Gộp cả từ vựng của 2 phân hệ vào một tập, vì quy tắc chặn sửa là như nhau.
TERMINAL_DOSSIER_STATUSES = frozenset({
    "Hoàn thành",       # cả 2 phân hệ — quy trình đã chạy hết
    "Nộp thành công",   # đo vẽ — nhân viên tự đi nộp, không theo dõi vòng đời
    "Huỷ",              # cả 2 phân hệ — không làm nữa
    "CLOSED",           # pháp lý — máy trạng thái ở Đợt 3
})


def is_dossier_locked(status: str | None) -> bool:
    """Hồ sơ này đã kết thúc và bị khoá sửa chưa."""
    return status in TERMINAL_DOSSIER_STATUSES


def assert_dossier_mutable(status: str | None) -> None:
    """Chặn mọi chỉnh sửa sau khi hồ sơ đã kết thúc."""
    if is_dossier_locked(status):
        raise HTTPException(
            status_code=409,
            detail="Hồ sơ đã hoàn tất và không thể chỉnh sửa.",
        )


# ══════════════════════════════════════════════════════════════════
# Trạng thái hồ sơ ĐO VẼ — TÍNH SỐNG, không lưu
# ══════════════════════════════════════════════════════════════════
#
# Gốc của lỗi "quy trình xong mà vẫn hiện Đang thực hiện" là hệ thống LƯU trạng
# thái rồi quên cập nhật. Thêm một đường đi mới là lại quên tiếp.
#
# Cách chữa tận gốc: cái gì suy ra được thì đừng lưu.
#
#     Hoàn thành       ← quy trình của Hạng mục này không còn node nào dở dang
#     Đã bàn giao      ← node đo vẽ đã nghiệm thu VÀ hợp đồng có kèm Hạng mục pháp lý
#     Đang thực hiện   ← còn lại
#
# Riêng "Nộp thành công" và "Huỷ" là do người dùng tự chọn nên vẫn phải lưu —
# nằm ở cột `manual_status`, và luôn được ưu tiên hơn giá trị tính sống.

LEGAL_PACKAGE_ID = "sp_002"

# Node coi như đã xong việc. Node bị huỷ/bỏ qua không cản trở quy trình kết thúc.
_NODE_DONE_STATUSES = "('accepted', 'cancelled', 'skipped')"

# Hai cờ nền, đặt trong lateral để câu chính dùng lại được nhiều lần.
SURVEY_FLAGS_LATERAL = f"""
    cross join lateral (
      select
        -- Hồ sơ này còn đi tiếp sang pháp lý hay dừng ở đo vẽ?
        --
        -- Trước đây suy từ GÓI DỊCH VỤ của hợp đồng: hợp đồng có hạng mục thuộc
        -- gói Pháp Lý là coi như có pháp lý. Nhưng gói dịch vụ chỉ là cách bán
        -- hàng — quy trình chạy thật mới quyết định có nộp cơ quan hay không.
        -- Hậu quả: quy trình không hề có bước nộp nào vẫn bị gắn nhãn "có pháp lý".
        --
        -- Nguồn sự thật đúng là CỜ trên bước trong quy trình đang chạy.
        exists (
          select 1
          from public.service_lines sl2
          join public.workflow_instances wi2 on wi2.service_line_id = sl2.id
          join public.workflow_instance_revisions r2 on r2.id = wi2.active_revision_id
          cross join lateral jsonb_each(r2.graph->'nodes') n2
          where sl2.contract_id = s.contract_id
            and wi2.status is distinct from 'cancelled'
            and coalesce((n2.value->>'requires_gov_submission')::boolean, false)
        ) as has_legal,
        -- Quy trình của Hạng mục này đã chạy hết chưa.
        (
          wi.status is distinct from 'cancelled'
          and not exists (
            select 1 from public.task_nodes t
            where t.workflow_instance_id = n.workflow_instance_id
              and t.status not in {_NODE_DONE_STATUSES}
          )
        ) as workflow_done
    ) f
"""

SURVEY_STATUS_LATERAL = """
    cross join lateral (
      select coalesce(
        s.manual_status,
        case
          when f.workflow_done                     then 'Hoàn thành'
          when n.status = 'accepted' and f.has_legal then 'Đã bàn giao'
          else 'Đang thực hiện'
        end
      ) as effective_status
    ) st
"""

# Danh sách trạng thái kết thúc, viết thành mảng SQL để dùng thẳng trong truy vấn.
# Đây là hằng số của hệ thống, không phải dữ liệu người dùng nhập.
TERMINAL_SQL_ARRAY = "array[" + ", ".join(
    f"'{s}'" for s in sorted(TERMINAL_DOSSIER_STATUSES)
) + "]"

# Dùng trong mệnh đề select. Giao diện vẫn nhận đúng tên trường `status` như cũ,
# và nhận thêm `is_locked` để thôi phải tự đoán hồ sơ đã đóng hay chưa.
SURVEY_STATUS_SELECT = f"""
           st.effective_status as status,
           f.has_legal,
           st.effective_status = any({TERMINAL_SQL_ARRAY}) as is_locked
"""
