# DB Phase 03 — Chạy thử hai Hạng mục và đối soát

Trạng thái: **Đã chạy một phần trên hai Hạng mục test — còn thiếu acceptance → pay entitlement xuyên suốt**

> Live 07/08/2026 hiện có 2 Instance, 3 Revision, 6 Node, 2 checklist result, 7 Node assignment và 10 event; chưa có `task_node_acceptances` hoặc `work_pay_entitlements`.

## 1. Phạm vi test

Chỉ dùng hai Service Line hiện có:

| Service Line | Hợp đồng | Hạng mục |
|---|---|---|
| `a111...111` | `HDDV-001` | Xác định diện tích — Đo Vẽ |
| `a222...222` | `HDDV-002` | Cấp đổi — phần Đo Vẽ |

Không dùng 1.681 Task legacy còn lại.

## 2. Kịch bản test bắt buộc

### Case T01 — Lưu nháp

- Giám đốc bấm Thiết lập quy trình.
- Tạo Instance `not_started`.
- Tạo Revision R1 `draft` từ Workflow Version published.
- Sửa Node/checklist/role/UI.
- Xác nhận chưa có `task_nodes`, assignment, timetable hay Pay Event.

### Case T02 — Khóa và kích hoạt

- Khóa R1 thành `active`.
- Set `active_revision_id`.
- Sinh Node/checklist/assignment trong một transaction.
- Node bắt đầu `ready`, Node sau `pending`.
- Nhân viên thấy việc trên timetable.

### Case T03 — Nghiệm thu và transition

```text
K01 accepted + outcome COMPLETED
→ đọc graph của active Revision
→ tìm transitions.COMPLETED
→ mở K02 ready
```

Xác nhận backend không đọc graph mẫu nếu Instance đã có active Revision.

### Case T04 — Làm lại và vòng lặp

- K06 trả `NEED_SUPPLEMENT`.
- Tạo K05 occurrence 2 hoặc mở nhánh đúng graph.
- Giữ nguyên K05 occurrence 1.
- Không tự sinh khoán lần hai cho rework.

### Case T05 — Sửa quy trình riêng

- Từ R1 active tạo R2 draft.
- Thêm checklist/Node tương lai.
- Khóa R2; R1 thành superseded.
- Node đã accepted vẫn trỏ revision cũ.
- Node mới có `defined_by_revision_id = R2`.
- Workflow Version mẫu không thay đổi.

### Case T06 — Chống tính tiền trùng

- Retry acceptance hai lần.
- Chỉ có một `work_pay_entitlement` theo `idempotency_key`.
- Rate thay đổi sau đó không sửa `calculation_snapshot` cũ.

## 3. Dữ liệu cần đối soát

| Kiểm tra | Kỳ vọng |
|---|---|
| Instance trên mỗi Service Line | 1 |
| Active Revision trên mỗi Instance | tối đa 1 |
| Draft Revision trên mỗi Instance | tối đa 1 |
| Node occurrence trùng | 0 |
| Assignment trùng role/người ngoài policy | 0 |
| Acceptance thiếu checklist bắt buộc | 0 |
| Pay Event trùng idempotency | 0 |
| Workflow Version bị sửa sau publish | 0 |
| Record runtime trỏ tới `projects_tasks` | 0; bảng legacy đã bị xóa |

## 4. Không dùng tiền thật

Rate trong Phase test là dữ liệu minh họa và phải có cờ test/sandbox. Không đưa vào kỳ lương thật, không gắn payroll period đang hoạt động.

## 5. Báo cáo đầu ra

Kết thúc Phase phải có:

- data dump chỉ gồm hai Instance test;
- timeline event của từng Node;
- ảnh/UI hoặc API response thể hiện timetable;
- báo cáo transition đúng graph;
- báo cáo không sinh lương trùng;
- danh sách lỗi và quyết định sửa schema nếu có.

## 6. Điều kiện cho phép sang cutover

- [ ] T01–T06 đều đạt.
- [x] Runtime test không phụ thuộc Task legacy.
- [ ] Giám đốc duyệt trải nghiệm Thiết lập → Lưu nháp → Khóa.
- [ ] Backend transaction xử lý được retry.
- [ ] Có câu xác nhận riêng để bắt đầu DB-04.
