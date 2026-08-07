# Phase 3A — Hạng mục, Workflow, Checklist và Khoán

Ngày cập nhật: 07/08/2026  
Trạng thái: **Schema đích đã triển khai live; tài liệu đã đồng bộ theo migration thực tế**

> Nguồn trạng thái và row count hiện hành: [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md).

## 1. Mục tiêu

Thiết kế lại phần vận hành để `service_lines` (Hạng mục khách mua trong Hợp đồng) là trung tâm nghiệp vụ. Không dùng `projects_tasks` làm đại diện Hạng mục trong luồng mới.

```text
Hợp đồng
└── service_lines: Hạng mục khách mua
    ├── workflow_instances: Quy trình thực tế của Hạng mục
    │   ├── workflow_instance_revisions: Các lần thiết lập/sửa graph riêng
    │   └── task_nodes: Các Node K01…K09
    │       ├── task_node_checklist_results
    │       ├── task_node_assignments
    │       ├── task_node_events
    │       └── task_node_acceptances
    │           └── work_pay_entitlements
    └── dossiers: Bộ hồ sơ của Hạng mục (module riêng)
```

## 2. Quyết định nghiệp vụ đã áp dụng trong bản nháp

1. Một `service_line` là một Hạng mục khách mua trong một Hợp đồng.
2. Một `service_line` có đúng một workflow chính sau khi được kích hoạt.
3. Một workflow gồm nhiều Node K01–K09; Node có thể rẽ nhánh, chờ hoặc quay lại bổ sung.
4. Workflow Version lưu graph mẫu chung; cấu hình kéo thả riêng của Hạng mục nằm ở `workflow_instance_revisions.graph`.
5. Hạng mục ghi nhận Version nguồn và khóa một Revision active. Version mới chỉ dùng làm mẫu cho Hạng mục/revision được tạo sau đó.
6. Checklist thường là điều kiện nghiệm thu và không sinh tiền; checklist có liên kết `work_items` là một cụm công việc khoán thực tế.
7. Khi Node accepted, lương là tổng các checklist khoán hợp lệ đã hoàn thành; Hạng mục không tự sinh thêm một khoản trùng.
8. Một Node có thể có một người hoặc nhiều người: chính, phụ, viết hồ sơ, nộp, nghiệm thu.
9. `projects_tasks` là thiết kế legacy sai với mô hình đích và đã được xóa khỏi database live bằng migration `20260806162743`.

## 3. Danh mục bảng

### 3.1 Bảng workflow/khoán

| # | Bảng | Trạng thái | Mục đích |
|---:|---|---|---|
| 1 | `workflow_nodes` | Live | Danh mục K01–K09 |
| 2 | `workflow_templates` | Live | Mỗi record là một Workflow Version State Machine JSONB |
| 3 | `workflow_instances` | Live | Workflow thực tế của một Hạng mục |
| 4 | `workflow_instance_revisions` | Live | Graph riêng R1/R2… của một Hạng mục |
| 5 | `task_nodes` | Live | Node thực tế của workflow instance |
| 6 | `work_items` | Live | Danh mục cụm công việc thực thi được khoán |
| 7 | `work_item_rates` | Live | Đơn giá công việc theo role và hiệu lực |
| 8 | `task_node_checklist_results` | Live | Kết quả checklist thường/khoán của từng Node |
| 9 | `task_node_checklist_assignments` | Live | Phân công và phần khoán trực tiếp cho checklist |
| 10 | `task_node_assignments` | Live | Phụ trách tổng thể/reviewer của Node và lịch |
| 11 | `task_node_events` | Live | Nhật ký không xóa của workflow |
| 12 | `task_node_acceptances` | Live | Các lần gửi và nghiệm thu Node |
| 13 | `work_pay_entitlements` | Live | Khoản tiền được hưởng phát sinh từ checklist khoán |
| 14 | `employee_compensation_terms` | Live | Lương cơ bản theo thời gian hiệu lực |
| 15 | `employee_pay_adjustments` | Live | Phụ cấp/thưởng/khấu trừ/hoàn ứng được duyệt |

### 3.2 Bảng hiện có dùng lại

| Bảng | Vai trò trong mô hình mới |
|---|---|
| `service_packages` | Gói Đo Vẽ, Pháp Lý, Xây Dựng |
| `task_types` | Danh mục Hạng mục thuộc đúng Gói |
| `service_lines` | Hạng mục khách mua, trung tâm luồng mới |
| `users` | Người thao tác, giao việc, nghiệm thu |
| `employees` | Nhân viên được phân công và nhận khoán |
| `payroll_periods` | Kỳ lương |

### 3.3 Bảng legacy đã loại bỏ

| Bảng | Xử lý |
|---|---|
| `projects_tasks` | Đã xóa 1.683 dòng theo quyết định dữ liệu cũ/rác của chủ hệ thống. |
| `task_pay_records`, `task_type_rates` và các bảng payroll/task cũ liên quan | Đã xóa; không dùng trong code mới. |

## 4. Chi tiết schema

> Quy ước kiểu ID: bảng mới có thể dùng `UUID`; nếu database hiện tại đã chuẩn hóa tất cả ID theo `VARCHAR(50)` thì dùng nhất quán `VARCHAR(50)`. Trước migration phải kiểm tra kiểu PK thật của bảng được tham chiếu.

### 4.1 `workflow_nodes`

Danh mục K01–K09. Không chứa trạng thái của hồ sơ.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `code` | `VARCHAR(10)` | PK | Mã K01…K09 |
| `name` | `VARCHAR(255)` | NOT NULL | Tên Node chuẩn |
| `description` | `TEXT` | NULL | Đầu ra/ngữ cảnh chuẩn |
| `is_active` | `BOOLEAN` | DEFAULT TRUE | Có còn cho phép dùng |

Ví dụ:

| code | name |
|---|---|
| `K01` | Tiếp nhận hồ sơ |
| `K05` | Hoàn thiện hồ sơ |
| `K06` | Nộp hồ sơ |
| `K09` | Bàn giao và lưu trữ |

### 4.2 `workflow_templates` — mỗi record là một Workflow Version

Mỗi record là một Version của một mẫu workflow. Release hiện tại giữ nguyên tên vật lý `workflow_templates`; không tạo thêm bảng `workflow_versions` để tránh hai nguồn cấu hình.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID Version, ví dụ `WFV_PLHS_V2` |
| `code` | `VARCHAR(50)` | NOT NULL | Mã ổn định của mẫu, ví dụ `WF_PHAPLY_HS` |
| `version` | `INTEGER` | NOT NULL, > 0 | Version 1, 2, 3… |
| `name` | `VARCHAR(255)` | NOT NULL | Tên hiển thị |
| `description` | `TEXT` | NULL | Mô tả nghiệp vụ |
| `status` | `VARCHAR(20)` | NOT NULL | `draft`, `published`, `archived` |
| `graph` | `JSONB` | NOT NULL | Node, transition, checklist, role, UI |
| `created_by` | `VARCHAR(50)` | FK → `users.id` | Người tạo Version |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Ngày tạo |
| `updated_at` | `TIMESTAMP` | DEFAULT NOW() | Ngày cập nhật |

Ràng buộc:

```text
UNIQUE (code, version)
Mỗi code chỉ nên có một Version PUBLISHED để UI chọn mặc định.
Không sửa graph của Version PUBLISHED hoặc ARCHIVED.
```

Ví dụ:

| id | code | version | status |
|---|---|---:|---|
| `WFV_PLHS_V1` | `WF_PHAPLY_HS` | 1 | `archived` |
| `WFV_PLHS_V2` | `WF_PHAPLY_HS` | 2 | `published` |
| `WFV_PLHS_V3` | `WF_PHAPLY_HS` | 3 | `draft` |

Mẫu `graph` rút gọn:

```json
{
  "start_node": "receive",
  "nodes": {
    "prepare": {
      "task_code": "K05",
      "name": "Hoàn thiện hồ sơ",
      "required": true,
      "checklist": [
        {"key": "original_certificate", "name": "Kiểm tra bản chính giấy chứng nhận", "required": true},
        {"key": "id_scan", "name": "Scan CCCD khách hàng", "required": true}
      ],
      "transitions": {"COMPLETED": "submit"}
    },
    "submit": {
      "task_code": "K06",
      "name": "Nộp hồ sơ",
      "transitions": {
        "ACCEPTED": "tracking",
        "NEED_SUPPLEMENT": "prepare"
      }
    }
  }
}
```

### 4.3 Binding Hạng mục → Workflow Version — chưa có bảng live

Database live hiện chưa có `task_type_workflow_bindings`. Workflow Designer cho Giám đốc chọn Version nguồn khi thiết lập Hạng mục và lưu trực tiếp vào `workflow_instances.source_workflow_version_id`/Revision. Bảng binding dưới đây chỉ là phương án tương lai nếu cần tự đề xuất mẫu mặc định theo `task_type`.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID mapping |
| `task_type_id` | `VARCHAR(50)` | FK → `task_types.id` | Hạng mục |
| `workflow_version_id` | `VARCHAR(50)` | FK → `workflow_templates.id` | Version áp dụng |
| `is_default` | `BOOLEAN` | DEFAULT TRUE | Mapping mặc định |
| `effective_from` | `DATE` | NOT NULL | Ngày hiệu lực |
| `effective_to` | `DATE` | NULL | Ngày ngừng hiệu lực |
| `created_by` | `VARCHAR(50)` | FK → `users.id` | Người cấu hình |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Ngày tạo |

Ví dụ:

| task_type_id | workflow_version_id | effective_from | effective_to |
|---|---|---|---|
| `TT_CAP_DOI_PL` | `WFV_PLHS_V1` | 2026-07-01 | 2026-08-03 |
| `TT_CAP_DOI_PL` | `WFV_PLHS_V2` | 2026-08-04 | NULL |

### 4.4 `workflow_instances`

Một workflow thực tế của một Hạng mục. Đây là bảng thay vai trò vận hành cũ của `projects_tasks`.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID lần chạy |
| `service_line_id` | `VARCHAR(50)` | FK → `service_lines.id`, UNIQUE | Hạng mục đang chạy |
| `source_workflow_version_id` | `VARCHAR(50)` | FK → `workflow_templates.id`, NULL | Version mẫu ban đầu |
| `active_revision_id` | `VARCHAR(50)` | FK → `workflow_instance_revisions.id`, NULL khi đang nháp | Revision đang chạy thật |
| `status` | `VARCHAR(20)` | NOT NULL | `not_started`, `running`, `paused`, `completed`, `cancelled` |
| `started_at` | `TIMESTAMPTZ` | NULL | Lúc bắt đầu |
| `completed_at` | `TIMESTAMPTZ` | NULL | Hoàn thành K09 |
| `created_by` | `VARCHAR(50)` | FK → `users.id` | Người tạo Instance |
| `cancellation_code` | `TEXT` | NULL | Nhóm lý do hủy chuẩn hóa |
| `cancellation_reason` | `TEXT` | Bắt buộc khi cancelled | Lý do nghiệp vụ cụ thể |
| `cancellation_data` | `JSONB` | DEFAULT `{}` | Dữ liệu audit bổ sung |
| `cancelled_by`, `cancelled_at` | FK/TIMESTAMPTZ | Bắt buộc khi cancelled | Người và lúc hủy |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | DEFAULT NOW() | Audit thời gian |

Ví dụ:

| id | service_line_id | source_workflow_version_id | active_revision_id | status |
|---|---|---|---|---|
| `WFI_001` | `SL_001` | `WFV_PLHS_V1` | `WIR_001_R2` | `running` |

### 4.4A `workflow_instance_revisions`

Graph thực tế của riêng một Hạng mục. Đây là nguồn transition mà backend đọc khi Node hoàn thành.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID Revision |
| `workflow_instance_id` | `VARCHAR(50)` | FK → `workflow_instances.id` | Instance sở hữu |
| `revision_no` | `INTEGER` | NOT NULL, > 0 | R1, R2… |
| `source_workflow_version_id` | `VARCHAR(50)` | FK → `workflow_templates.id`, NULL | Mẫu được sao chép |
| `parent_revision_id` | `VARCHAR(50)` | FK self, NULL | Revision trước |
| `graph` | `JSONB` | NOT NULL | Node/transition/checklist/role/UI thực tế |
| `status` | `VARCHAR(20)` | NOT NULL | `draft`, `active`, `superseded`, `discarded` |
| `change_reason` | `TEXT` | NULL với R1, bắt buộc khi sửa | Lý do thay đổi |
| `created_by` | `VARCHAR(50)` | FK → `users.id` | Người tạo |
| `created_at` | `TIMESTAMPTZ` | DEFAULT NOW() | Lúc tạo |
| `activated_by` | `VARCHAR(50)` | FK → `users.id`, NULL | Người khóa |
| `activated_at` | `TIMESTAMPTZ` | NULL | Lúc khóa |

```text
UNIQUE (workflow_instance_id, revision_no)
Mỗi Instance tối đa một Revision active và một Revision draft.
Revision active/superseded không được sửa graph.
```

### 4.5 `task_nodes`

Node chạy thật của workflow instance. Schema live đã dùng `workflow_instance_id`, không còn `task_id` legacy.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID Node thực tế |
| `workflow_instance_id` | `VARCHAR(50)` | FK → `workflow_instances.id` | Thuộc Hạng mục nào |
| `defined_by_revision_id` | `VARCHAR(50)` | FK → `workflow_instance_revisions.id` | Revision tạo/thay đổi Node |
| `node_key` | `VARCHAR(50)` | NOT NULL | Key trong graph, ví dụ `submit` |
| `node_code` | `VARCHAR(10)` | FK → `workflow_nodes.code` | K01…K09 |
| `occurrence_no` | `INTEGER` | DEFAULT 1 | Lần thực hiện khi quay lại |
| `status` | `VARCHAR(20)` | NOT NULL | `pending`, `ready`, `in_progress`, `submitted`, `accepted`, `rework_required`, `blocked`, `skipped`, `cancelled` |
| `outcome` | `VARCHAR(50)` | NULL | `COMPLETED`, `ACCEPTED`, `NEED_SUPPLEMENT`… |
| `execution_data` | `JSONB` | DEFAULT `{}` | Dữ liệu nhập riêng của Node |
| `planned_start` | `TIMESTAMPTZ` | NULL | Lịch dự kiến |
| `planned_end` | `TIMESTAMPTZ` | NULL | Hạn dự kiến |
| `started_at` | `TIMESTAMPTZ` | NULL | Bắt đầu |
| `submitted_at` | `TIMESTAMPTZ` | NULL | Gửi duyệt |
| `accepted_at` | `TIMESTAMPTZ` | NULL | Được nghiệm thu |
| `completed_at` | `TIMESTAMPTZ` | NULL | Hoàn tất |
| `blocked_reason` | `TEXT` | NULL | Lý do chặn |
| `notes` | `TEXT` | NULL | Ghi chú |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | DEFAULT NOW() | Audit thời gian |

### 4.6 `task_node_checklist_results`

Kết quả checklist thật của từng Node. Checklist mẫu nằm trong `graph`; bảng này lưu ai đã thực hiện, kết quả và minh chứng.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID kết quả |
| `task_node_id` | `VARCHAR(50)` | FK → `task_nodes.id` | Node chứa checklist |
| `checklist_key` | `VARCHAR(100)` | NOT NULL | Key trong graph |
| `checklist_name` | `VARCHAR(255)` | NOT NULL | Snapshot tên checklist |
| `is_required` | `BOOLEAN` | NOT NULL | Có bắt buộc không |
| `status` | `VARCHAR(20)` | NOT NULL | `pending`, `passed`, `failed`, `not_applicable` |
| `completed_by` | `VARCHAR(50)` | FK → `users.id`, NULL | Người thực hiện/check |
| `completed_at` | `TIMESTAMP` | NULL | Lúc hoàn thành |
| `evidence_data` | `JSONB` | DEFAULT `{}` | ID file/link Drive/minh chứng |
| `note` | `TEXT` | NULL | Ghi chú |
| `work_item_id` | `VARCHAR(50)` | FK → `work_items.id`, NULL | NULL là checklist thường; có giá trị là công việc khoán |
| `is_payable` | `BOOLEAN` | DEFAULT FALSE | Snapshot quy tắc khoán |
| `pay_group_key` | `VARCHAR(100)` | NULL | Nhóm loại trừ, tránh cộng hai phương án thay thế |
| `pay_scope` | `VARCHAR(30)` | NULL | `ONCE_PER_WORKFLOW`, `PER_OCCURRENCE`, `MANUAL` |
| `condition_result` | `JSONB` | DEFAULT `{}` | Kết quả điều kiện kích hoạt |
| `pay_key` | `VARCHAR(150)` | NULL | Key ổn định để chống tính trùng |

Ràng buộc:

```text
UNIQUE (task_node_id, checklist_key)
Node chỉ được gửi nghiệm thu khi mọi checklist bắt buộc = passed.
Checklist payable bắt buộc có work_item_id và pay_key.
```

### 4.6A `task_node_checklist_assignments`

Phân công người chính/phụ trực tiếp cho một công việc con trong checklist. Đây là căn cứ nhân sự của khoản khoán; khác `task_node_assignments` là người phụ trách tổng thể Node.

| Cột | Kiểu | Giải thích |
|---|---|---|
| `id` | `VARCHAR(50)` PK | ID phân công |
| `checklist_result_id` | FK | Checklist được giao |
| `employee_id` | FK | Nhân viên thực hiện |
| `role_code` | `VARCHAR(30)` | MAIN/ASSISTANT/WRITER/SUBMITTER… |
| `share_percent` | `NUMERIC(5,2)` | Tỷ lệ hưởng trong rate role |
| `work_item_rate_id` | FK, NULL | Rate đã khóa khi duyệt |
| `amount_override` | `NUMERIC`, NULL | Ngoại lệ có duyệt |
| `status` | `VARCHAR(20)` | proposed/assigned/completed/replaced/cancelled |
| `assigned_by/at` | FK/TIMESTAMPTZ | Người/lúc giao |
| `approved_by/at` | FK/TIMESTAMPTZ | Người/lúc duyệt khoản |
| `reason` | `TEXT` | Lý do override/thay người |

### 4.7 `task_node_assignments`

Phân công linh hoạt người chính/phụ/người nộp/người duyệt.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID phân công |
| `task_node_id` | `VARCHAR(50)` | FK → `task_nodes.id` | Node được giao |
| `employee_id` | `VARCHAR(50)` | FK → `employees.id` | Nhân viên nhận việc/khoán |
| `role_code` | `VARCHAR(20)` | NOT NULL | `MAIN`, `ASSISTANT`, `WRITER`, `SUBMITTER`, `REVIEWER` |
| `is_primary` | `BOOLEAN` | DEFAULT FALSE | Phụ trách chính |
| `assignment_status` | `VARCHAR(20)` | NOT NULL | `proposed`, `assigned`, `accepted`, `declined`, `completed`, `replaced` |
| `planned_start` | `TIMESTAMP` | NULL | Timetable bắt đầu |
| `planned_end` | `TIMESTAMP` | NULL | Timetable kết thúc |
| `assigned_by` | `VARCHAR(50)` | FK → `users.id` | Người giao |
| `assigned_at` | `TIMESTAMP` | DEFAULT NOW() | Lúc giao |
| `ended_at` | `TIMESTAMP` | NULL | Lúc đổi người |
| `replacement_reason` | `TEXT` | NULL | Lý do thay |
| `notes` | `TEXT` | NULL | Ghi chú |

### 4.8 `task_node_events`

Nhật ký bất biến của Node. Không xóa/sửa record cũ.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID event |
| `task_node_id` | `VARCHAR(50)` | FK → `task_nodes.id` | Node phát sinh |
| `event_type` | `VARCHAR(50)` | NOT NULL | `STARTED`, `AGENCY_REJECTED`, `REOPENED`… |
| `from_status` | `VARCHAR(20)` | NULL | Trạng thái trước |
| `to_status` | `VARCHAR(20)` | NULL | Trạng thái sau |
| `actor_user_id` | `VARCHAR(50)` | FK → `users.id`, NULL | Người thao tác |
| `payload` | `JSONB` | DEFAULT `{}` | Lý do, mã biên nhận, dữ liệu linh hoạt |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Thời điểm |

### 4.9 `task_node_acceptances`

Một record cho mỗi lần gửi nghiệm thu Node.

| Cột | Kiểu | Ràng buộc | Giải thích |
|---|---|---|---|
| `id` | `VARCHAR(50)` | PK | ID lần duyệt |
| `task_node_id` | `VARCHAR(50)` | FK → `task_nodes.id` | Node gửi duyệt |
| `attempt_no` | `INTEGER` | NOT NULL | Lần gửi 1, 2… |
| `status` | `VARCHAR(20)` | NOT NULL | `pending`, `accepted`, `rework_required`, `rejected` |
| `submitted_by` | `VARCHAR(50)` | FK → `users.id` | Người gửi duyệt |
| `submitted_at` | `TIMESTAMP` | DEFAULT NOW() | Lúc gửi |
| `reviewer_user_id` | `VARCHAR(50)` | FK → `users.id`, NULL | Người duyệt |
| `reviewed_at` | `TIMESTAMP` | NULL | Lúc quyết định |
| `quality_score` | `NUMERIC(5,2)` | NULL | Điểm chất lượng |
| `submission_payload` | `JSONB` | DEFAULT `{}` | Snapshot checklist/minh chứng lúc gửi |
| `review_payload` | `JSONB` | DEFAULT `{}` | Lý do trả lại/đánh giá |
| `review_note` | `TEXT` | NULL | Ghi chú ngắn |

Ràng buộc:

```text
UNIQUE (task_node_id, attempt_no)
```

### 4.10 Công việc khoán trong Checklist

Thiết kế chi tiết và kế hoạch chuyển đổi nằm tại [DB_PHASE_01A_TAI_SU_DUNG_LUONG_GOI_TASK_TYPE.md](./DB_PHASE_01A_TAI_SU_DUNG_LUONG_GOI_TASK_TYPE.md).

- `work_items`: danh mục cụm công việc có đầu ra như Đo GPS, Cắm mốc, Viết hồ sơ.
- `work_item_rates`: đơn giá MAIN/ASSISTANT/WRITER/SUBMITTER theo hiệu lực.
- `task_node_checklist_assignments`: người và role được giao trực tiếp cho checklist.
- checklist thường không sinh tiền; checklist liên kết work item có thể sinh tiền sau khi Node accepted.
- `pay_group_key` ngăn hai phương án thay thế nhau bị cộng đôi.

### 4.11 `work_pay_entitlements` — sổ quyền hưởng tiền

Khoản lương chỉ sinh cho checklist khoán đã passed sau khi Node được nghiệm thu `accepted`.

| Cột | Kiểu | Giải thích |
|---|---|---|
| `workflow_instance_id` | `VARCHAR(50)` FK | Hạng mục nào |
| `task_node_id` | `VARCHAR(50)` FK | Node sinh tiền |
| `checklist_result_id` | `VARCHAR(50)` FK | Công việc con sinh tiền |
| `checklist_assignment_id` | `VARCHAR(50)` FK | Người và role thực hiện checklist |
| `acceptance_id` | `VARCHAR(50)` FK | Lần nghiệm thu cho phép trả |
| `work_item_rate_id` | `VARCHAR(50)` FK | Đơn giá công việc đã dùng |
| `employee_id` | `VARCHAR(50)` FK | Người nhận tiền |
| `role_code` | `VARCHAR(50)` | MAIN/ASSISTANT/WRITER/SUBMITTER… |
| `amount` | `NUMERIC(15,2)` | Số tiền cuối cùng |
| `calculation_snapshot` | `JSONB` | Rate/hệ số áp dụng tại lúc tính |
| `idempotency_key` | `VARCHAR(150)` UNIQUE | Chống sinh tiền trùng |
| `earned_at` | `TIMESTAMPTZ` | Thời điểm đủ điều kiện hưởng |
| `status` | `VARCHAR(20)` | `eligible`, `approved`, `locked`, `void` |
| `approved_by`, `approved_at` | FK/TIMESTAMPTZ | Người và lúc duyệt |
| `voided_by`, `voided_at`, `void_reason` | FK/TIMESTAMPTZ/TEXT | Audit khi hủy quyền hưởng |
| `created_at` | `TIMESTAMP` | Ngày tạo khoản |

## 5. Mô phỏng một Hạng mục Pháp Lý bị trả hồ sơ

### 5.1 Hạng mục và Version đã khóa

| Bảng | Data |
|---|---|
| `service_lines` | `SL_001`: Hạng mục Cấp đổi Pháp Lý của Hợp đồng `HD_001` |
| `workflow_instances` | `WFI_001`: `service_line_id = SL_001`, `source_workflow_version_id = WFV_PLHS_V2`, `active_revision_id = WIR_001_R1`, `status = running` |
| `workflow_instance_revisions` | `WIR_001_R1`: Revision 1, `active`, chứa graph chạy thật |

### 5.2 Node và checklist

| task_node | Node | Trạng thái |
|---|---|---|
| `TN_K05_1` | K05 lần 1 — Hoàn thiện hồ sơ | accepted |
| `TN_K06_1` | K06 lần 1 — Nộp hồ sơ | blocked / NEED_SUPPLEMENT |
| `TN_K05_2` | K05 lần 2 — Bổ sung hồ sơ | in_progress |

| checklist của `TN_K05_2` | required | status |
|---|---|---|
| Kiểm tra bản chính giấy chứng nhận | true | passed |
| Scan CCCD khách hàng | true | passed |
| Soạn đơn đề nghị | true | passed |

### 5.3 Phân công, event, nghiệm thu

| Bảng | Data mô phỏng |
|---|---|
| `task_node_assignments` | `EMP_PL_A` là MAIN tại `TN_K05_2` |
| `task_node_events` | `TN_K06_1`: `AGENCY_REJECTED`, lý do thiếu bản chính |
| `task_node_acceptances` | `TN_K05_2`, lần 2, `accepted` bởi Giám đốc |

### 5.4 Sinh lương

```text
TN_K05_2 được nghiệm thu accepted
→ lấy checklist payable đã passed
→ lấy checklist assignment và work_item_rate phù hợp
→ tạo work_pay_entitlement duy nhất bằng idempotency_key
```

### 5.5 Bộ dữ liệu xuyên suốt — một Hạng mục từ đầu tới khi nộp lại

> Đây là data mô phỏng để hiểu quan hệ bảng, không phải dữ liệu thật hay đơn giá đã chốt.

#### A. Hạng mục thương mại và workflow được khóa

| Bảng | Record |
|---|---|
| `service_packages` | `PK_PL` — Gói Pháp Lý |
| `task_types` | `TT_CAP_DOI_PL` — Hạng mục Cấp đổi Pháp Lý |
| `service_lines` | `SL_001` — Hạng mục `TT_CAP_DOI_PL` của Hợp đồng `HD_001` |
| `workflow_templates` | `WFV_PLHS_V2` — `WF_PHAPLY_HS`, Version 2, `published` |
| Chọn mẫu tại Instance | `TT_CAP_DOI_PL` chọn `WFV_PLHS_V2` khi Giám đốc thiết lập; chưa có bảng binding mặc định live |
| `workflow_instances` | `WFI_001` — `service_line_id = SL_001`, nguồn `WFV_PLHS_V2`, active Revision `WIR_001_R1`, `status = running` |
| `workflow_instance_revisions` | `WIR_001_R1` — graph riêng của `SL_001`, Revision 1, `active` |

```text
HD_001
└── SL_001: Cấp đổi Pháp Lý
    └── WFI_001: Workflow Pháp Lý Có Hồ Sơ, V2
```

#### B. `workflow_instances` và Revision active

| id | service_line_id | source_workflow_version_id | active_revision_id | status |
|---|---|---|---|---|
| `WFI_001` | `SL_001` | `WFV_PLHS_V2` | `WIR_001_R1` | `running` |

| revision_id | workflow_instance_id | revision_no | source_version | status | activated_at | activated_by |
|---|---|---:|---|---|---|---|
| `WIR_001_R1` | `WFI_001` | 1 | `WFV_PLHS_V2` | `active` | 04/08 08:00 | `USR_DIRECTOR` |

`WIR_001_R1.graph` được copy từ `WFV_PLHS_V2.graph`, sau đó chứa cấu hình riêng đã khóa của Hạng mục. Dù Giám đốc xuất bản Version 3 sau đó, `WFI_001` vẫn chạy theo Revision active của mình.

#### C. `task_nodes` sau khi K06 bị trả và K05 được mở lại

| id | defined_by_revision_id | node_key | node_code | occurrence_no | status | outcome | blocked_reason |
|---|---|---|---|---:|---|---|---|
| `TN_001` | `WIR_001_R1` | `receive` | K01 | 1 | `accepted` | `COMPLETED` | — |
| `TN_002` | `WIR_001_R1` | `legal_check` | K04 | 1 | `accepted` | `COMPLETED` | — |
| `TN_003` | `WIR_001_R1` | `prepare` | K05 | 1 | `accepted` | `COMPLETED` | — |
| `TN_004` | `WIR_001_R1` | `submit` | K06 | 1 | `blocked` | `NEED_SUPPLEMENT` | Thiếu bản chính giấy chứng nhận |
| `TN_005` | `WIR_001_R1` | `tracking` | K07 | 1 | `pending` | — | — |
| `TN_006` | `WIR_001_R1` | `receive_result` | K08 | 1 | `pending` | — | — |
| `TN_007` | `WIR_001_R1` | `handover` | K09 | 1 | `pending` | — | — |
| `TN_008` | `WIR_001_R1` | `prepare` | K05 | 2 | `accepted` | `COMPLETED` | — |
| `TN_009` | `WIR_001_R1` | `submit` | K06 | 2 | `accepted` | `ACCEPTED` | — |
| `TN_010` | `WIR_001_R1` | `tracking` | K07 | 1 | `in_progress` | — | — |

Ràng buộc bắt buộc:

```text
UNIQUE (workflow_instance_id, node_key, occurrence_no)
```

K05 lần 1 không bị sửa/xóa. K05 lần 2 là record mới để lưu rõ lịch sử bổ sung.

#### D. `task_node_checklist_results` cho K05 lần 2

| id | task_node_id | checklist_key | is_required | status | completed_by | evidence_data |
|---|---|---|---|---|---|---|
| `CK_001` | `TN_008` | `original_certificate` | true | `passed` | `USR_PL_A` | `{"drive_url":".../GCN-ban-chinh"}` |
| `CK_002` | `TN_008` | `id_scan` | true | `passed` | `USR_PL_A` | `{"file_id":"FILE_CCCD_01"}` |
| `CK_003` | `TN_008` | `application_form` | true | `passed` | `USR_PL_A` | `{"file_id":"FILE_DON_01"}` |

Toàn bộ checklist bắt buộc `passed` nên `TN_008` được gửi nghiệm thu.

#### E. `task_node_assignments`

| id | task_node_id | employee_id | role_code | is_primary | assignment_status |
|---|---|---|---|---|---|
| `ASN_001` | `TN_003` | `EMP_PL_A` | `WRITER` | true | `completed` |
| `ASN_002` | `TN_004` | `EMP_PL_B` | `SUBMITTER` | true | `completed` |
| `ASN_003` | `TN_008` | `EMP_PL_A` | `WRITER` | true | `completed` |
| `ASN_004` | `TN_009` | `EMP_PL_B` | `SUBMITTER` | true | `completed` |
| `ASN_005` | `TN_010` | `EMP_PL_A` | `MAIN` | true | `accepted` |

#### F. `task_node_events`

| id | task_node_id | event_type | from_status | to_status | actor_user_id | payload |
|---|---|---|---|---|---|---|
| `EVT_001` | `TN_004` | `STARTED` | `ready` | `in_progress` | `USR_PL_B` | `{}` |
| `EVT_002` | `TN_004` | `AGENCY_REJECTED` | `in_progress` | `blocked` | `USR_PL_B` | `{"reason":"Thiếu bản chính giấy chứng nhận"}` |
| `EVT_003` | `TN_008` | `REOPENED` | `pending` | `ready` | `USR_DIRECTOR` | `{"source_node":"submit","outcome":"NEED_SUPPLEMENT"}` |
| `EVT_004` | `TN_008` | `SUBMITTED_FOR_ACCEPTANCE` | `in_progress` | `submitted` | `USR_PL_A` | `{}` |
| `EVT_005` | `TN_008` | `ACCEPTED` | `submitted` | `accepted` | `USR_DIRECTOR` | `{}` |
| `EVT_006` | `TN_009` | `AGENCY_ACCEPTED` | `in_progress` | `accepted` | `USR_PL_B` | `{"receipt_code":"H29.146-260505-13382"}` |

#### G. `task_node_acceptances`

| id | task_node_id | attempt_no | status | submitted_by | reviewer_user_id | review_note |
|---|---|---:|---|---|---|---|
| `ACC_001` | `TN_003` | 1 | `accepted` | `USR_PL_A` | `USR_DIRECTOR` | Hồ sơ đủ để đi nộp |
| `ACC_002` | `TN_008` | 1 | `accepted` | `USR_PL_A` | `USR_DIRECTOR` | Đã bổ sung bản chính |
| `ACC_003` | `TN_009` | 1 | `accepted` | `USR_PL_B` | `USR_DIRECTOR` | Cơ quan đã tiếp nhận |

#### H. Đơn giá và khoản khoán

Ví dụ số tiền để thấy liên kết; chính sách lương Pháp Lý cần chốt riêng với Giám đốc/Kế toán.

| `work_item_rates.id` | work_item | role_code | amount |
|---|---|---|---:|
| `RATE_WRITE_LEGAL` | Viết hồ sơ | `WRITER` | 300000 |
| `RATE_SUBMIT_LEGAL` | Đi nộp hồ sơ, không gồm theo dõi vòng đời | `SUBMITTER` | 350000 |

| `work_pay_entitlements.id` | task_node_id | checklist_assignment_id | acceptance_id | employee_id | amount | status |
|---|---|---|---|---|---:|---|
| `PAY_001` | `TN_003` | `CK_ASN_001` | `ACC_001` | `EMP_PL_A` | 300000 | `eligible` |
| `PAY_002` | `TN_009` | `CK_ASN_004` | `ACC_003` | `EMP_PL_B` | 350000 | `eligible` |

Không tạo `PAY` cho `TN_008` (K05 lần 2) theo nguyên tắc mặc định: làm lại/bổ sung không tự tạo khoán lần hai.

Nếu Giám đốc xác nhận đây là phát sinh được trả thêm, phải tạo khoản riêng có lý do và `idempotency_key` khác; không để hệ thống tự trả hai lần.

## 6. Trạng thái và quy tắc quan trọng

| Đối tượng | Quy tắc |
|---|---|
| Version PUBLISHED | Không sửa graph; muốn sửa tạo Version mới |
| Hạng mục kích hoạt | Ghi Version nguồn và khóa một Instance Revision active |
| Instance Revision | Graph active là luật chạy thật; sửa riêng phải tạo Revision mới |
| Checklist bắt buộc | Phải `passed` trước khi gửi nghiệm thu |
| Node | Chỉ `accepted` mới mở Node tiếp theo hoặc đủ điều kiện khoán |
| Khoán | Tổng các checklist có work item/rate hợp lệ sau khi Node accepted; checklist thường không sinh tiền |
| Hủy workflow | Chuyển Instance và Node mở sang `cancelled`, lưu mã/lý do/người/thời điểm; không xóa lịch sử hoặc khoản đã đủ điều kiện |
| `projects_tasks` | Đã loại khỏi schema vận hành; không còn dual-read |

## 7. Kết quả loại bỏ `projects_tasks`

1. Mô hình mới đã được tạo từ `service_lines`.
2. Backend/frontend Hợp đồng và Workflow Designer đã chuyển sang đọc mô hình mới.
3. Chủ hệ thống xác nhận 1.683 dòng `projects_tasks` là dữ liệu cũ/rác, không backfill.
4. Migration `20260806162743_remove_legacy_project_task_model` đã xóa bảng và các bảng payroll/task legacy phụ thuộc.
5. Luồng mới không được tái tạo adapter hoặc bảng “Task chính” tương đương.

## 8. Điểm cần duyệt tiếp

1. Hoàn thiện API nghiệm thu để tạo `work_pay_entitlements` idempotent sau Node accepted.
2. Hoàn thiện Work Execution, timetable và màn hình lương theo quyền.
3. Thiết kế module hồ sơ/tài liệu (`dossiers`, document version, custody) ở phase riêng nếu chưa có bảng live.
4. Thiết kế và test RLS theo vai trò trước khi bật cho các bảng public còn thiếu policy.
