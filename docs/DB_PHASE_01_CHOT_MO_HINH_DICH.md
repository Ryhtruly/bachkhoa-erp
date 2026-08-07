# DB Phase 01 — Chốt mô hình dữ liệu đích

Trạng thái: **Đã chốt và đã triển khai live**

> Tên/schema live được đồng bộ tại [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md). `workflow_templates` đang đóng vai trò Workflow Version; `work_pay_entitlements` thay cho đề xuất cũ `task_pay_records`.

## 1. Quyết định kiến trúc

Mô hình đích không tạo thêm một “Task chính” trùng vai trò với Hạng mục.

```text
contracts
└── service_lines
    └── workflow_instances
        ├── workflow_instance_revisions
        └── task_nodes
```

Ý nghĩa:

- `service_lines`: khách mua gì;
- `workflow_instances`: Hạng mục đó đang vận hành ra sao;
- `workflow_instance_revisions`: giám đốc đã cấu hình/sửa quy trình riêng mấy lần;
- `task_nodes`: công việc thật đang giao cho nhân viên.

## 2. Danh mục bảng đích

### 2.1 Bảng dùng lại

| Bảng | Vai trò |
|---|---|
| `contracts` | Hợp đồng |
| `service_packages` | Ba gói dịch vụ |
| `task_types` | 22 Hạng mục thuộc đúng gói |
| `service_lines` | Một Hạng mục khách mua trong hợp đồng |
| `users` | Tài khoản/người thao tác |
| `employees` | Nhân viên, lịch và payroll |
| `payroll_periods` | Kỳ lương |

### 2.2 Bảng workflow đích

| # | Bảng | Trạng thái xử lý |
|---:|---|---|
| 1 | `workflow_nodes` | Dùng lại, bổ sung metadata |
| 2 | `workflow_templates` | Live; mỗi record là một Workflow Version |
| 3 | `workflow_instances` | Live |
| 4 | `workflow_instance_revisions` | Live, bắt buộc |
| 5 | `task_nodes` | Live, FK trực tiếp tới Instance/Revision |
| 6 | `work_items` | Live, danh mục cụm công việc khoán |
| 7 | `work_item_rates` | Live, đơn giá theo role/hiệu lực |
| 8 | `task_node_checklist_results` | Live, checklist/minh chứng/work item |
| 9 | `task_node_checklist_assignments` | Live, giao chính/phụ và rate cho checklist |
| 10 | `task_node_assignments` | Live, phụ trách tổng thể Node và lịch |
| 11 | `task_node_acceptances` | Live |
| 12 | `task_node_events` | Live, append-only |
| 13 | `work_pay_entitlements` | Live, sổ quyền hưởng tiền sau nghiệm thu |
| 14 | `employee_compensation_terms` | Live, lương cơ bản theo hiệu lực |
| 15 | `employee_pay_adjustments` | Live, phụ cấp/thưởng/khấu trừ/hoàn ứng |

## 3. Workflow Version (`workflow_templates` trong schema live)

Mỗi record là một quy trình mẫu có Version.

| Cột chính | Ý nghĩa |
|---|---|
| `id` | ID Version |
| `workflow_code` | Mã ổn định, ví dụ `WF_CAPDOI` |
| `version_no` | V1, V2, V3 |
| `name` | Tên hiển thị |
| `status` | `draft`, `published`, `archived` |
| `graph` | JSONB Node/transition/checklist/role/UI |
| `definition_hash` | Kiểm tra graph không bị sửa |
| `created_by/at` | Người và lúc tạo |
| `published_by/at` | Người và lúc ban hành |

Quy tắc:

- `UNIQUE(workflow_code, version_no)`;
- mỗi `workflow_code` tối đa một bản `published`;
- không sửa graph của bản `published` hoặc `archived`;
- muốn thay đổi mẫu phải tạo Version mới.

## 4. `workflow_instances`

Một record cho một `service_line`.

| Cột chính | Ý nghĩa |
|---|---|
| `id` | ID Instance |
| `service_line_id` | FK và UNIQUE |
| `source_workflow_version_id` | Mẫu ban đầu được chọn |
| `active_revision_id` | Revision đang chạy thật |
| `status` | `not_started`, `running`, `paused`, `completed`, `cancelled` |
| `created_by/at` | Người tạo |
| `started_at/completed_at` | Mốc vận hành |

Không lưu thêm `graph_snapshot` tại đây vì graph thực tế đã nằm trong revision. Tránh hai nguồn JSONB cùng nói về một Instance.

## 5. `workflow_instance_revisions`

Đây là bảng bắt buộc để hỗ trợ nút “Thiết lập quy trình” cạnh từng Hạng mục.

| Cột | Kiểu đề xuất | Ý nghĩa |
|---|---|---|
| `id` | UUID PK | ID revision |
| `workflow_instance_id` | FK | Thuộc Hạng mục nào |
| `revision_no` | INTEGER | R1, R2, R3 |
| `source_workflow_version_id` | FK | Sao chép từ mẫu nào |
| `parent_revision_id` | FK nullable | Revision trước |
| `graph` | JSONB | Graph thực tế của Hạng mục |
| `status` | TEXT | `draft`, `active`, `superseded`, `discarded` |
| `change_reason` | TEXT | Lý do sửa |
| `created_by/at` | FK/TIMESTAMPTZ | Người tạo |
| `activated_by/at` | FK/TIMESTAMPTZ | Người khóa |

Ràng buộc:

```text
UNIQUE(workflow_instance_id, revision_no)
Mỗi workflow_instance tối đa một revision active
Mỗi workflow_instance tối đa một revision draft
Revision active không được sửa graph
```

## 6. Vòng đời khi giám đốc thiết lập

```text
Bấm “Thiết lập quy trình”
→ tạo workflow_instance status not_started
→ copy Workflow Version published thành Revision R1 draft
→ giám đốc sửa graph/checklist/role/lịch
→ bấm “Khóa & kích hoạt”
→ R1 draft thành active
→ workflow_instance.active_revision_id = R1
→ materialize task_nodes/checklist/assignment
→ Node bắt đầu chuyển ready
```

Nếu sửa sau khi đã khóa:

```text
R1 active
→ tạo R2 draft từ R1
→ giám đốc sửa + ghi lý do
→ khóa R2
→ R1 superseded
→ R2 active
→ Node đã accepted giữ nguyên
→ chỉ Node tương lai được đồng bộ theo R2
```

## 7. `task_nodes`

| Cột chính | Ý nghĩa |
|---|---|
| `workflow_instance_id` | Instance chứa Node |
| `defined_by_revision_id` | Revision tạo/thay đổi Node |
| `node_key` | Key duy nhất trong graph |
| `node_code` | K01–K09 |
| `occurrence_no` | Lần 1, lần 2 khi quay lại |
| `status` | Trạng thái chạy thật |
| `outcome` | Kết quả dùng tra transition |
| `execution_data` | Data linh hoạt của Node |
| `planned_start/end` | Timetable |
| Các timestamp | started/submitted/accepted/completed |

Ràng buộc:

```text
UNIQUE(workflow_instance_id, node_key, occurrence_no)
FOREIGN KEY(node_code) → workflow_nodes.code
CHECK(occurrence_no > 0)
```

## 8. Trạng thái không được trộn

| Đối tượng | Trạng thái |
|---|---|
| Workflow Version | draft / published / archived |
| Instance Revision | draft / active / superseded / discarded |
| Workflow Instance | not_started / running / paused / completed / cancelled |
| Task Node | pending / ready / in_progress / submitted / accepted / rework_required / blocked / skipped / cancelled |
| Acceptance | pending / accepted / rework_required / rejected |
| Pay Record | eligible / approved / locked / paid / void |

## 9. Kết quả xử lý `projects_tasks`

- `projects_tasks` là thiết kế sai so với mô hình nghiệp vụ đã chốt: nó vừa đóng vai trò Hạng mục, vừa giữ trạng thái tổng, người chính/phụ và căn cứ lương nhưng không biểu diễn được Node/checklist/revision.
- Bảng này **không có mặt trong kiến trúc đích**.
- Không dùng cho Hạng mục mới sau cutover.
- Không xóa tại DB-01/DB-02.
- Không để workflow runtime mới tiếp tục FK vào bảng này.
- Giữ API/read-model legacy trong giai đoạn chuyển tiếp.
- Chủ hệ thống xác nhận toàn bộ 1.683 dòng là dữ liệu cũ/rác và không yêu cầu backfill.
- Migration `20260806162743_remove_legacy_project_task_model` đã DROP bảng cùng các bảng payroll/task legacy phụ thuộc.
- Backend/frontend không được tái tạo một bảng “Task chính” có vai trò tương đương.

## 10. Điểm cần duyệt Phase 01

- [ ] `service_lines` là trung tâm Hạng mục.
- [x] Không tạo Task chính mới thay thế `projects_tasks`.
- [x] Có `workflow_instance_revisions`.
- [ ] Graph chạy thật chỉ nằm tại Revision.
- [ ] Published Version và active Revision là bất biến.
- [ ] Node đã accepted không bị viết lại khi đổi revision.
- [x] `projects_tasks` đã được loại khỏi schema vận hành.
- [x] Runtime mới bắt đầu từ `service_lines → workflow_instances`.
