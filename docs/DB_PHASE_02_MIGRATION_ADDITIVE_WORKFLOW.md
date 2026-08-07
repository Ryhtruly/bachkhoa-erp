# DB Phase 02 — Migration Additive cho Dynamic Workflow

Trạng thái: **Đã thực hiện live — migration dynamic workflow hoàn tất**

> Kết quả thực tế: migration dynamic workflow đã tạo mô hình mới; các migration tiếp theo bổ sung index, cleanup bảng trống, audit hủy và xóa legacy. Phần bên dưới được giữ như kế hoạch/audit trước khi chạy. Xem [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md).

Sai khác đã chốt so với kế hoạch ban đầu:

- giữ tên vật lý `workflow_templates`; mỗi record vẫn là một Workflow Version;
- chưa tạo `task_type_workflow_bindings`; Version nguồn được chọn khi thiết lập Instance;
- tạo mới `work_pay_entitlements`, không mở rộng `task_pay_records`;
- `node_pay_rates`/`task_type_rates` không còn là nguồn giá; dùng `work_items`/`work_item_rates`;
- ProjectTask legacy được xóa ở migration riêng sau khi chủ hệ thống phê duyệt.

## 1. Mục tiêu

Tạo schema workflow mới mà không làm gián đoạn dữ liệu và API legacy.

Phase này:

- có chạy DDL sau khi được duyệt;
- không backfill 1.681 Task legacy;
- không xóa `projects_tasks`;
- không bật RLS hàng loạt trên bảng cũ;
- không tạo khoản lương thật.

## 2. Chuẩn bị trước DDL

1. Đọc lại schema và row count ngay trước migration.
2. Lưu schema-only baseline vào repository.
3. Tạo migration có tên rõ nghĩa.
4. Kiểm tra backend hiện có route/model nào đọc `workflow_templates` hoặc `task_nodes`.
5. Chuẩn bị rollback cho từng bước đổi tên/cấu trúc.

Nếu row count của `task_nodes`, `node_pay_rates` hoặc `task_pay_records` khác 0 so với baseline, dừng migration và báo lại. `node_pay_rates` chỉ được giữ như bảng legacy trống, không dùng làm nguồn giá mới.

## 3. Thứ tự migration đề xuất

### M02-01 — Chuẩn hóa danh mục

- bổ sung `created_at`, `updated_at` cho `workflow_nodes` nếu thiếu;
- giữ nguyên K01–K09;
- thêm CHECK/metadata cần thiết nhưng không đổi code đã seed.

### M02-02 — Chuẩn hóa Workflow Version

Do đổi tên bảng có thể làm code hiện tại lỗi, thực hiện theo hai bước:

1. Bước additive: giữ tên vật lý `workflow_templates`, bổ sung cột/constraint để nó có đầy đủ semantics của `workflow_versions`.
2. Bước cutover DB-04: phối hợp đổi tên thành `workflow_versions` cùng lúc sửa backend/frontend.

Cột chuẩn cần đạt:

```text
id
workflow_code        (từ code)
version_no           (từ version)
name
description
status
graph
definition_hash
created_by
created_at
published_by
published_at
archived_at
```

Không sửa graph của bốn record V1 trong Phase này; chỉ đánh dấu rõ đây là seed thử nghiệm cần review.

### M02-03 — Tạo binding

Tạo `task_type_workflow_bindings` với:

- FK `task_types`;
- FK Workflow Version;
- ngày hiệu lực;
- partial unique index bảo đảm một default đang hiệu lực theo quy tắc được duyệt.

Không tự bind cả 22 Hạng mục trong migration đầu. Chỉ bind hai Hạng mục test tại DB-03.

### M02-04 — Tạo Instance và Revision

Tạo:

```text
workflow_instances
workflow_instance_revisions
```

Thứ tự tránh FK vòng:

1. tạo `workflow_instances` với `active_revision_id` nullable;
2. tạo `workflow_instance_revisions` trỏ về Instance;
3. thêm FK `workflow_instances.active_revision_id`;
4. tạo partial unique index cho revision `active` và `draft`.

### M02-05 — Thay cấu trúc `task_nodes`

Bảng live đang 0 dòng nhưng vẫn xử lý có thể phục hồi:

1. đổi tên bảng cũ thành `task_nodes_legacy_empty`;
2. tạo `task_nodes` mới trỏ `workflow_instances`;
3. thêm FK `node_code → workflow_nodes.code`;
4. thêm `defined_by_revision_id`;
5. thêm CHECK status/outcome và unique occurrence;
6. giữ bảng legacy empty tới khi DB-03 hoàn tất.

Không `DROP TABLE` trực tiếp trong migration đầu.

### M02-06 — Tạo bảng runtime phụ

Tạo theo thứ tự:

```text
work_items
work_item_rates
task_node_checklist_results
task_node_checklist_assignments
task_node_assignments
task_node_acceptances
task_node_events
```

`task_node_events` là append-only. Quyền UPDATE/DELETE không cấp cho role ứng dụng.

### M02-07 — Chuẩn hóa khoán theo Checklist Work Item

Kết quả thực tế:

- bảng `node_pay_rates` trống được loại bỏ và không tạo lại;
- tạo `work_items` và `work_item_rates` theo tài liệu DB-01A;
- seed 15 công việc và 27 mức đã được chủ hệ thống xác nhận;
- `task_type_rates` bị xóa cùng legacy, không còn là nguồn giá.

Thiết kế thực tế tạo bảng mới `work_pay_entitlements` với:

```text
workflow_instance_id
task_node_id
checklist_result_id
checklist_assignment_id
acceptance_id
work_item_rate_id
role_code
amount
calculation_snapshot
idempotency_key
```

Không có `task_id` legacy trong bảng mới; mọi khoản truy ngược qua `workflow_instance_id`, Node, checklist, assignment và acceptance.

## 4. Constraint và index bắt buộc

- index mọi FK mới;
- partial index Node đang mở theo `status` và `planned_start`;
- index timetable theo `employee_id, assignment_status, planned_start`;
- index event theo `task_node_id, created_at desc`;
- unique idempotency cho Pay Event;
- unique `service_line_id` tại `workflow_instances`;
- unique `(workflow_instance_id, revision_no)`;
- unique `(workflow_instance_id, node_key, occurrence_no)`.

## 5. Transaction và hàm nghiệp vụ

DDL migration và seed tối thiểu phải transaction-safe.

Chưa tạo trigger kiểu:

```text
task_nodes.completed → tự sinh lương
```

Sau này Pay Event chỉ được sinh trong domain transaction khi:

```text
acceptance accepted
+ checklist payable đã passed
+ checklist assignment hợp lệ
+ work item rate đã published/khóa
+ chưa có idempotency_key
```

## 6. RLS trong Phase 02

- Bật RLS cho bảng mới trước khi cho Data API truy cập.
- Ban đầu chỉ backend role đáng tin cậy được ghi workflow runtime.
- Không cấp policy rộng `TO authenticated` mà thiếu điều kiện dữ liệu.
- Không dùng `user_metadata` để xác định role.
- Nếu backend hiện dùng kết nối server trực tiếp, ghi rõ đường truy cập trước khi mở frontend Data API.

## 7. Kiểm tra sau migration

- bảng/cột/FK/constraint đúng tài liệu;
- bốn Workflow V1 vẫn nguyên graph;
- `projects_tasks` vẫn đủ 1.683 dòng;
- hai `service_lines` vẫn nguyên;
- không có Node/Pay Event tự phát sinh;
- migration xuất hiện trong history;
- chạy security và performance advisors;
- chạy truy vấn rollback rehearsal trên môi trường test/branch nếu có.

## 8. Điều kiện đóng Phase 02

- [ ] Migration chạy thành công và được lưu trong repository.
- [ ] Không mất dữ liệu legacy.
- [ ] Schema mới truy vấn được.
- [ ] RLS bảng mới có policy tối thiểu phù hợp đường truy cập.
- [ ] Advisors không còn lỗi critical do bảng mới gây ra.
- [ ] Chưa cutover backend/frontend.
