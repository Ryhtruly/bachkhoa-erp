# DB Phase 04 — Cutover Backend và Frontend

Trạng thái: **Đang thực hiện — trang Hợp đồng/Workflow Designer đã cutover, Work Execution/timetable/payroll còn tiếp tục**

> Không còn luồng `projects_tasks` để dual-read. Nguồn live duy nhất của Hạng mục mới là `service_lines → workflow_instances`. Xem [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md).

## 1. Mục tiêu

Chuyển luồng Hạng mục mới sang:

```text
service_lines
→ workflow_instances
→ workflow_instance_revisions
→ task_nodes
```

Legacy `projects_tasks` đã bị xóa theo quyết định của chủ hệ thống; code mới không được fallback về mô hình này.

## 2. Backend cutover

Backend phải có domain service, không cho frontend tự cập nhật trực tiếp status/payroll.

Các hành động tối thiểu:

- lấy Workflow Version published phù hợp TaskType;
- tạo Instance + Revision draft;
- lưu graph draft;
- validate và khóa Revision;
- materialize Node/checklist/assignment;
- start/submit/review Node;
- chạy transition từ active revision;
- tạo R2 khi sửa riêng Instance;
- tạo `work_pay_entitlements` idempotent;
- đọc work queue/timetable theo assignment.

Mọi thao tác thay đổi nhiều bảng phải chạy trong transaction.

Các phụ thuộc `ProjectTask` phải được thay thế theo đúng ngữ cảnh:

| Phụ thuộc cũ | Nguồn mới |
|---|---|
| Hồ sơ/Hạng mục | `service_lines` |
| Tiến độ tổng | `workflow_instances` + tổng hợp `task_nodes` |
| Người thực hiện | `task_node_assignments` |
| Nghiệm thu | `task_node_acceptances` |
| Lương khoán | `work_pay_entitlements` theo checklist work item + Node acceptance |
| Nộp hồ sơ | Submission Attempt gắn `workflow_instance_id/task_node_id` |
| Phân bổ thu/chi theo Hạng mục | `service_line_id`; khoản cấp hợp đồng dùng `contract_id` |
| Chat liên quan công việc | `service_line_id` hoặc `workflow_instance_id` |

## 3. Frontend cutover

Trong chi tiết Hợp đồng:

```text
Tab Quy trình
├── Danh sách Hạng mục bên trái
├── Nút Thiết lập quy trình cạnh từng Hạng mục
├── Canvas Node/transition ở giữa
├── Checklist/role/lịch/UI bên phải
└── Lưu nháp / Khóa & kích hoạt
```

Quy tắc UI:

- chỉ hiển thị Hạng mục đúng `service_package_id`;
- Version `archived` không xuất hiện cho lựa chọn bình thường;
- nhân viên không được sửa graph;
- published Version không có nút sửa trực tiếp;
- sau khi khóa, sửa riêng phải tạo Revision mới và nhập lý do;
- Node accepted hiển thị khóa;
- nhân viên thao tác ở Work Execution, không kéo thả canvas.

## 4. Quyết định tên vật lý

Release hiện tại giữ nguyên `workflow_templates(code, version)`. Mỗi record được hiểu là một Workflow Version. Không đổi tên bảng/cột chỉ vì cách gọi nghiệp vụ và không tạo thêm bảng `workflow_versions`; nếu sau này đổi tên phải là migration/code release riêng có lợi ích rõ ràng.

## 5. Chiến lược đọc hiện tại

```text
Nếu Service Line có Workflow Instance
→ đọc Instance/Revision/Node runtime.

Nếu Service Line chưa được thiết lập
→ hiển thị trạng thái “Chưa thiết lập”, cho Giám đốc tạo draft; không tạo ProjectTask thay thế.
```

Không dual-write sang bất kỳ mô hình legacy nào.

## 6. Rollback cutover

- feature flag tắt Workflow mới;
- giữ nguyên các bảng mới và dữ liệu test để điều tra;
- frontend tắt chức năng sửa/kích hoạt nhưng vẫn đọc read model mới;
- không xóa Node/Event đã tạo;
- rollback code không được rollback bằng cách xóa dữ liệu production.

## 7. Điều kiện đóng Phase 04

- [x] Hạng mục mới không tạo `projects_tasks`.
- [x] Không còn dual-read legacy.
- [x] UI Hợp đồng đọc `contracts` + `service_lines` và mở Workflow Designer theo Hạng mục.
- [x] UI chọn đúng gói và Hạng mục ở luồng hồ sơ hiện có.
- [ ] Timetable dùng assignments mới.
- [ ] Workflow execution chỉ qua backend domain service.
- [ ] Có metric/log cho lỗi transition và entitlement.
- [x] Backend luồng Hợp đồng/Workflow mới không còn query `ProjectTask`.
