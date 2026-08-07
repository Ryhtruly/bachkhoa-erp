# Tóm tắt bảng dữ liệu Dynamic Workflow — bản live 07/08/2026

Nguồn trạng thái chuẩn: [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md).

## Quan hệ chính

```text
contracts
→ service_lines
→ workflow_instances
→ workflow_instance_revisions
→ task_nodes
→ checklist / assignment / acceptance / event
→ work_pay_entitlements
```

## Bảng danh mục và thương mại

| Bảng | Thể hiện |
|---|---|
| `contracts` | Hợp đồng |
| `service_packages` | Gói Đo Vẽ, Pháp Lý, Xây Dựng |
| `task_types` | 22 Hạng mục thuộc đúng Gói |
| `service_lines` | Hạng mục khách thực sự mua trong một Hợp đồng |
| `workflow_nodes` | Danh mục cụm K01–K09 |
| `workflow_templates` | Các Workflow Version mẫu dạng JSONB State Machine |

## Bảng vận hành workflow

| Bảng | Thể hiện |
|---|---|
| `workflow_instances` | Một workflow thực tế của một Hạng mục |
| `workflow_instance_revisions` | Graph riêng R1/R2…; sửa quy trình không ghi đè lịch sử |
| `task_nodes` | Node chạy thật, trạng thái, lịch và occurrence khi quay lại |
| `task_node_checklist_results` | Checklist, kết quả, điều kiện và minh chứng Drive/file |
| `task_node_assignments` | Người phụ trách tổng thể Node và lịch dự kiến |
| `task_node_checklist_assignments` | Người làm công việc con, role, tỷ lệ và rate khoán |
| `task_node_acceptances` | Mỗi lần nhân viên gửi và người có quyền nghiệm thu |
| `task_node_events` | Nhật ký chuyển trạng thái không ghi đè |

## Bảng lương

| Bảng | Thể hiện |
|---|---|
| `work_items` | Danh mục công việc có đầu ra: Đo GPS, Cắm mốc, Đi nộp… |
| `work_item_rates` | Đơn giá theo role và thời gian hiệu lực |
| `employee_compensation_terms` | Lương cơ bản của nhân viên theo thời gian hiệu lực |
| `work_pay_entitlements` | Khoản khoán được hưởng sau nghiệm thu; có snapshot và chống trùng |
| `employee_pay_adjustments` | Phụ cấp, thưởng, khấu trừ, hoàn ứng được duyệt |
| `payroll_periods` | Kỳ lương và bước khóa tổng hợp |

## Hai JSONB không được nhầm

```text
workflow_templates.graph
= mẫu chung để bắt đầu cấu hình.

workflow_instance_revisions.graph
= luật chạy thật của một Hạng mục cụ thể.
```

Trạng thái, người thực hiện, thời gian, kết quả checklist, minh chứng, nghiệm thu và tiền nằm ở bảng quan hệ runtime, không ghi vào graph.

## Legacy

`projects_tasks`, `task_pay_records`, `task_type_rates` và các bảng payroll/task cũ liên quan đã được xóa bằng migration live ngày 06/08/2026. Không dùng lại các tên này trong code hoặc tài liệu thiết kế mới.
