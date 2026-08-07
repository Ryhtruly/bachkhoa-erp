# DB Phase 00 — Hiện trạng, Baseline và Đóng băng phạm vi

Trạng thái: **Đã đóng — đây là snapshot lịch sử trước migration ngày 05/08/2026**

> Không dùng row count trong file này làm hiện trạng live. Xem [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md). Sau baseline, mô hình mới đã được triển khai và 1.683 dòng `projects_tasks` đã được chủ hệ thống xác nhận là dữ liệu cũ/rác rồi xóa bằng migration `20260806162743`.

## 1. Mục tiêu

- Xác nhận đúng project Supabase.
- Ghi lại số lượng dữ liệu trước migration.
- Xác định bảng nào là dữ liệu thật, bảng nào là cấu hình test và bảng nào đang trống.
- Ngăn việc tiếp tục sửa schema thủ công trong lúc thiết kế.

## 2. Baseline đã kiểm tra ngày 05/08/2026

```text
Project ref: ejklrwydjplwzztfuygj
Project URL: https://ejklrwydjplwzztfuygj.supabase.co
```

| Bảng | Số dòng | Phân loại |
|---|---:|---|
| `customers` | 1.198 | Dữ liệu thật, bảo vệ |
| `contracts` | 847 | Dữ liệu thật, bảo vệ |
| `projects_tasks` | 1.683 | Legacy có dữ liệu, không xóa |
| `receivables` | khoảng 1.689 | Dữ liệu tài chính, ngoài migration workflow |
| `cashflow_transactions` | khoảng 1.449 | Dữ liệu tài chính, ngoài migration workflow |
| `service_lines` | 2 | Hai Hạng mục test |
| `service_packages` | 3 | Danh mục chuẩn |
| `task_types` | 22 | Danh mục chuẩn |
| `task_type_rates` | 44 | Rate cũ/chưa chốt chính sách mới |
| `workflow_nodes` | 9 | Seed K01–K09 |
| `workflow_templates` | 4 | Workflow V1 thử nghiệm |
| `task_nodes` | 0 | Chưa chạy |
| `node_pay_rates` | 0 | Chưa chạy |
| `task_pay_records` | 0 | Chưa chạy |

## 3. Phân bố `projects_tasks`

| Điều kiện | Số dòng |
|---|---:|
| Tổng | 1.683 |
| Có `service_line_id` | 2 |
| Không có `service_line_id` | 1.681 |
| Có `task_type_id` | 2 |
| Có `workflow_template_id` | 0 |
| Có `current_node_key` | 0 |
| Có assignee/support | 2 |

Trạng thái legacy:

| Trạng thái | Số dòng |
|---|---:|
| Hoàn thành | 1.267 |
| Nộp thành công - Chờ kết quả | 222 |
| Hủy | 152 |
| NULL | 40 |
| Chờ khảo sát | 1 |
| Đang đo đạc | 1 |

## 4. Vùng đóng băng

Trước khi DB-02 được duyệt:

- không thêm cột workflow mới vào `projects_tasks`;
- không seed thêm Workflow Version trực tiếp;
- không đổi dữ liệu 1.681 Task legacy;
- không bật RLS hàng loạt;
- không tạo trigger tự sinh lương;
- không dùng hai Hạng mục test để tính lương thật.

## 4.1 Phụ thuộc thật của `projects_tasks`

Database có 8 khóa ngoại đang trỏ tới `projects_tasks`:

```text
cashflow_transactions.project_id
chat_rooms.related_task_id
legal_submissions.task_id
payroll_adjustments.task_id
task_nodes.task_id
task_pay_records.task_id
task_submissions.task_id
task_transitions.task_id
```

Tại thời điểm kiểm tra, cả 8 cột tham chiếu đều có **0 giá trị khác NULL**. Vì vậy chưa có dữ liệu con bị mắc vào khóa ngoại, nhưng backend vẫn dùng model `ProjectTask` ở hồ sơ, pháp lý, hợp đồng, dashboard, tài chính, KPI và payroll. Kết luận:

- loại bỏ bảng này về kiến trúc là đúng;
- `DROP TABLE` ngay sẽ làm API/backend lỗi;
- phải cutover code trước, sau đó lưu trữ và xóa bảng bằng migration riêng.

## 5. Baseline migration đang thiếu

Supabase MCP trả về danh sách migration rỗng.

Backend có Alembic revision `122f7a9c63e6`, nhưng file migration chỉ có:

```python
def upgrade():
    pass

def downgrade():
    pass
```

Do đó Phase DB-02 phải tạo migration có nội dung thật và lưu trong repository. Không được chỉ chạy SQL rời trên production mà không ghi lại migration.

## 6. Cảnh báo bảo mật baseline

- 43 bảng `public` đang tắt RLS.
- `service_packages` và `task_transitions` bật RLS nhưng không có policy.
- Toàn schema chưa có policy nào.
- Nhiều FK chưa có index.

Không khắc phục hàng loạt trong Phase 00. RLS được xử lý tại DB-05 sau khi xác định chính xác đường truy cập backend/frontend.

## 7. Tiêu chí duyệt Phase 00

- [ ] Đồng ý dùng các số liệu trên làm baseline.
- [x] Baseline đã được ghi nhận trước migration.
- [x] Không tự backfill 1.681 Task thiếu khóa chuẩn.
- [x] Chủ hệ thống đã quyết định không giữ/backfill dữ liệu `projects_tasks` và cho phép xóa ở phase cleanup sau đó.
- [ ] Đồng ý workflow mới hiện chưa có dữ liệu chạy thật.
- [ ] Đồng ý mọi thay đổi DB sau đây phải có migration và kiểm tra rollback.
