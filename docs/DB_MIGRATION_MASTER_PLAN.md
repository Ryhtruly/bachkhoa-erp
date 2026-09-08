# Database Migration Master Plan — Dynamic Workflow

Ngày lập: 05/08/2026  
Ngày đồng bộ live: **07/08/2026**  
Trạng thái: **Schema mới và legacy cleanup đã hoàn thành; runtime/UI/RLS đang tiếp tục**  
Project Supabase: `ejklrwydjplwzztfuygj`

Nguồn trạng thái ngắn gọn: [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md).

## 1. Kiến trúc đích đã áp dụng

```text
contracts
└── service_lines                    Hạng mục khách mua
    └── workflow_instances           Quy trình thực tế của Hạng mục
        ├── workflow_instance_revisions
        │   └── graph JSONB          Sơ đồ riêng R1/R2…
        └── task_nodes               Node chạy thật
            ├── task_node_checklist_results
            ├── task_node_checklist_assignments
            ├── task_node_assignments
            ├── task_node_acceptances
            ├── task_node_events
            └── work_pay_entitlements
```

`projects_tasks` không thuộc kiến trúc đích và đã được xóa. Không còn dual-read hoặc backfill từ ProjectTask.

## 2. Kết luận kiểm tra Supabase live

| Đối tượng | Hiện trạng 07/08/2026 |
|---|---:|
| Bảng trong schema `public` | 47 |
| `customers` | 1.198 dòng |
| `contracts` | 847 dòng |
| `service_lines` | 2 dòng |
| `workflow_nodes` | 9 dòng |
| `workflow_templates` | 4 dòng |
| `workflow_instances` | 2 dòng |
| `workflow_instance_revisions` | 3 dòng |
| `task_nodes` | 6 dòng |
| `task_node_checklist_results` | 2 dòng |
| `task_node_checklist_assignments` | 4 dòng |
| `task_node_assignments` | 7 dòng |
| `task_node_acceptances` | 0 dòng |
| `task_node_events` | 10 dòng |
| `work_items` | 15 dòng |
| `work_item_rates` | 27 dòng |
| `employee_compensation_terms` | 3 dòng |
| `work_pay_entitlements` | 0 dòng |

## 3. Các migration đã chạy

| Version live | Tên | Kết quả |
|---|---|---|
| `20260805045816` | `dynamic_workflow_work_item_compensation` | Tạo Instance/Revision/Node/checklist/assignment/acceptance/event/lương mới |
| `20260805045915` | `move_btree_gist_to_extensions_schema` | Chuẩn hóa extension phục vụ range constraint |
| `20260805050039` | `index_dynamic_workflow_composite_foreign_keys` | Bổ sung index FK/composite |
| `20260805052128` | `remove_obsolete_empty_workflow_tables` | Xóa các bảng workflow trống cũ |
| `20260806155931` | `workflow_cancellation_audit` | Thêm nghiệp vụ hủy có lý do/người/thời điểm/audit |
| `20260806162743` | `remove_legacy_project_task_model` | Xóa ProjectTask và payroll/task legacy |

Tên file migration local đầu tiên có thể khác version history live do quá trình pull/đồng bộ; nội dung schema live và migration history Supabase là căn cứ vận hành.

## 4. Nguyên tắc kiến trúc bắt buộc

- `service_lines` là trung tâm Hạng mục.
- Một Hạng mục có tối đa một `workflow_instance` chính.
- Bảng vật lý `workflow_templates` chứa các Workflow Version nhờ `(code, version)`.
- Graph mẫu nằm ở `workflow_templates.graph`; graph chạy thật nằm ở `workflow_instance_revisions.graph`.
- Published template không sửa trực tiếp; sửa mẫu tạo version mới.
- Sửa workflow đang vận hành tạo Revision mới và bắt buộc có lý do.
- Node/checklist đã nghiệm thu không bị ghi đè khi Revision thay đổi.
- Trạng thái, assignment, checklist result, acceptance, event và tiền lưu bằng bảng quan hệ.
- Checklist thường không sinh tiền; checklist payable phải có work item/rate/assignment hợp lệ.
- `work_pay_entitlements` chỉ sinh sau acceptance và phải idempotent.
- Lương tháng = lương cơ bản + entitlement được duyệt + adjustment hợp lệ.
- Hủy workflow không xóa lịch sử hoặc tiền đã phát sinh hợp lệ.
- Không bật RLS hàng loạt nếu chưa có policy và test JWT/role thật.

## 5. Trạng thái các phase

| Phase | File | Trạng thái |
|---|---|---|
| DB-00 | [DB_PHASE_00_HIEN_TRANG_VA_DONG_BANG.md](./DB_PHASE_00_HIEN_TRANG_VA_DONG_BANG.md) | Đã đóng; snapshot lịch sử |
| DB-01 | [DB_PHASE_01_CHOT_MO_HINH_DICH.md](./DB_PHASE_01_CHOT_MO_HINH_DICH.md) | Đã chốt và triển khai |
| DB-01A | [DB_PHASE_01A_TAI_SU_DUNG_LUONG_GOI_TASK_TYPE.md](./DB_PHASE_01A_TAI_SU_DUNG_LUONG_GOI_TASK_TYPE.md) | Schema đã có; runtime/UI lương còn tiếp tục |
| DB-02 | [DB_PHASE_02_MIGRATION_ADDITIVE_WORKFLOW.md](./DB_PHASE_02_MIGRATION_ADDITIVE_WORKFLOW.md) | Đã hoàn thành migration live |
| DB-03 | [DB_PHASE_03_CHAY_THU_VA_DOI_SOAT.md](./DB_PHASE_03_CHAY_THU_VA_DOI_SOAT.md) | Đã chạy một phần; còn acceptance → entitlement |
| DB-04 | [DB_PHASE_04_CUTOVER_BACKEND_FRONTEND.md](./DB_PHASE_04_CUTOVER_BACKEND_FRONTEND.md) | Đang thực hiện UI/runtime |
| DB-05 | [DB_PHASE_05_BACKFILL_RLS_VA_LEGACY.md](./DB_PHASE_05_BACKFILL_RLS_VA_LEGACY.md) | Legacy đã xóa; RLS còn mở |

## 6. Việc tiếp theo

1. Hoàn thiện Work Execution: bắt đầu, checklist, Drive evidence, gửi nghiệm thu, làm lại và chuyển Node.
2. Hoàn thiện API tạo `work_pay_entitlements` idempotent sau acceptance.
3. Hoàn thiện timetable từ `task_node_assignments.planned_start/planned_end` và kiểm tra ngày không trước ngày ký Hợp đồng.
4. Hoàn thiện màn hình lương: lương cơ bản, khoản khoán, điều chỉnh, duyệt và khóa kỳ.
5. Thiết kế RLS theo Giám đốc/Kế toán/Sales/Pháp Lý/Đo Vẽ/nhân viên rồi test JWT thật.
6. Thiết kế module hồ sơ/tài liệu riêng nếu cần quản lý document version, Drive link và custody ngoài checklist evidence.

## 7. Điều kiện hoàn thành toàn bộ chương trình

- Hai Hạng mục test chạy xuyên suốt từ draft → active → checklist → acceptance → entitlement.
- Revision mới không làm đổi Node/checklist đã nghiệm thu.
- Hủy workflow giữ đầy đủ audit và không tạo tiền mới sai.
- Timetable truy vấn đúng theo nhân viên, vai trò và lịch.
- Retry acceptance không sinh entitlement trùng.
- UI/API không còn tham chiếu `projects_tasks`, `task_pay_records` hoặc `task_type_rates`.
- RLS được test bằng từng vai trò trước khi bật cho các bảng public còn thiếu.
