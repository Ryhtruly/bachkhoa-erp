# Trạng thái các Phase và mô hình Workflow hiện hành

Ngày đối chiếu live: **07/08/2026**  
Supabase project: `ejklrwydjplwzztfuygj`  
Vai trò tài liệu: **nguồn chuẩn để đọc trạng thái triển khai hiện tại**

## 1. Mô hình đã chốt

```text
contracts
└── service_lines                         Hạng mục khách mua trong Hợp đồng
    └── workflow_instances                Một quy trình vận hành chính
        ├── workflow_instance_revisions   Graph riêng R1/R2… của Hạng mục
        └── task_nodes                    Node K01…K09 chạy thật, có occurrence
            ├── task_node_checklist_results       Checklist + kết quả + minh chứng
            ├── task_node_checklist_assignments   Người làm checklist + phần khoán
            ├── task_node_assignments             Người phụ trách Node + lịch
            ├── task_node_acceptances             Các lần gửi/duyệt nghiệm thu
            └── task_node_events                  Nhật ký trạng thái bất biến
```

Luồng tiền:

```text
employee_compensation_terms     Lương cơ bản theo thời gian hiệu lực
work_items + work_item_rates    Danh mục công việc khoán và đơn giá đã duyệt
work_pay_entitlements           Quyền hưởng tiền sinh từ checklist được nghiệm thu
employee_pay_adjustments        Phụ cấp/thưởng/khấu trừ/hoàn ứng có phê duyệt
```

Nguyên tắc không đổi:

1. `service_lines` là Hạng mục thương mại; không tạo một “Task chính” khác để đại diện lại Hạng mục.
2. Mỗi `service_line` có tối đa một `workflow_instance` chính.
3. `workflow_templates.graph` là mẫu; `workflow_instance_revisions.graph` mới là luật chạy thật của Hạng mục.
4. Sửa quy trình đang vận hành phải tạo Revision mới và có `change_reason`; Revision cũ không bị ghi đè.
5. Di chuyển vị trí Node trên canvas chỉ thay đổi UI; thêm/xóa Node, Edge, checklist hoặc điều kiện là thay đổi logic và phải qua Revision.
6. Checklist thường không sinh tiền. Checklist payable phải liên kết `work_item`, rate và assignment hợp lệ.
7. Chỉ sau khi Node được nghiệm thu `accepted` mới được tạo `work_pay_entitlements`; retry phải dùng `idempotency_key` để không tính trùng.
8. Hủy workflow là trạng thái kết thúc có audit, không xóa graph, Node, minh chứng, nghiệm thu hoặc quyền hưởng tiền đã phát sinh hợp lệ.

## 2. Tên vật lý đang dùng trong database

| Khái niệm | Bảng live |
|---|---|
| Workflow Version mẫu | `workflow_templates`; mỗi record là một version nhờ `(code, version)` |
| Workflow chạy thật | `workflow_instances` |
| Revision graph riêng | `workflow_instance_revisions` |
| Node chạy thật | `task_nodes` |
| Checklist runtime | `task_node_checklist_results` |
| Phân công Node | `task_node_assignments` |
| Phân công checklist/khoán | `task_node_checklist_assignments` |
| Nghiệm thu | `task_node_acceptances` |
| Audit Node | `task_node_events` |
| Khoản tiền được hưởng | `work_pay_entitlements` |

Không đổi tên vật lý `workflow_templates` thành `workflow_versions` trong release hiện tại. Trong tài liệu, “Workflow Version” là khái niệm nghiệp vụ của từng record trong bảng này.

## 3. Dữ liệu live đã xác nhận

| Bảng | Số dòng 07/08/2026 |
|---|---:|
| `service_packages` | 3 |
| `task_types` | 22 |
| `service_lines` | 2 |
| `workflow_nodes` | 9 |
| `workflow_templates` | 4 |
| `workflow_instances` | 2 |
| `workflow_instance_revisions` | 3 |
| `task_nodes` | 6 |
| `task_node_checklist_results` | 2 |
| `task_node_checklist_assignments` | 4 |
| `task_node_assignments` | 7 |
| `task_node_acceptances` | 0 |
| `task_node_events` | 10 |
| `work_items` | 15 |
| `work_item_rates` | 27 |
| `employee_compensation_terms` | 3 |
| `work_pay_entitlements` | 0 |
| `employee_pay_adjustments` | 0 |

## 4. Legacy đã loại bỏ

Migration live `20260806162743_remove_legacy_project_task_model` đã xóa:

- `projects_tasks` — 1.683 dòng được xác nhận là dữ liệu cũ/rác theo quyết định của chủ hệ thống;
- `task_submissions`;
- `task_pay_records`;
- `payroll_adjustments`;
- `kpi_payroll`;
- `stake_rates`;
- `task_type_rates`.

Từ thời điểm này không còn dual-read và không backfill từ `projects_tasks`. Backend/frontend mới phải đi theo `service_lines → workflow_instances`.

## 5. Trạng thái chương trình

| Phase | Trạng thái hiện tại | Kết quả/việc còn lại |
|---|---|---|
| Phase 01 | Đã chốt | Thuật ngữ, quyền, nghiệp vụ nộp, nghiệm thu và lương |
| Phase 02 | Đã chốt phạm vi thương mại | 3 Gói, 22 Hạng mục; UI/API phải lọc đúng Gói |
| Phase 03 | Đã thay thế | Bản cũ chỉ giữ lịch sử; dùng Phase 3A |
| Phase 3A / DB-01 | Schema đích đã triển khai | Mô hình Instance/Revision/Node/Checklist/Assignment/Pay |
| DB-02 | Đã hoàn thành | Migration dynamic workflow đã chạy live |
| DB-03 | Hoàn thành một phần | Có 2 Instance test; chưa chạy xuyên suốt acceptance → pay entitlement |
| DB-04 | Đang thực hiện | Trang Hợp đồng và Workflow Designer đã dùng mô hình mới; Work Execution/timetable/payroll UI còn tiếp tục |
| DB-05 | Hoàn thành phần legacy | Bảng cũ đã xóa; RLS toàn hệ thống chưa hoàn tất |

## 6. Điểm còn mở bắt buộc

Supabase MCP hiện cảnh báo **33 bảng public chưa bật RLS**, gồm cả `contracts`, `service_lines`, `workflow_nodes`, `workflow_templates`, `users` và các bảng nền khác. Không bật hàng loạt khi chưa có policy vì sẽ làm API hiện tại mất quyền truy cập. Cần một phase RLS riêng: thiết kế policy theo vai trò, test JWT thật, sau đó mới bật từng nhóm bảng.

