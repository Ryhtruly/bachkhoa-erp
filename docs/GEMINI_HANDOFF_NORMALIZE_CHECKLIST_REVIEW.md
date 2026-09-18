# Handoff cho Gemini: Chuẩn hóa duyệt loại giấy và checklist không có loại giấy

## 1. Vai trò của tài liệu

Đây là yêu cầu triển khai và kiểm tra cho agent Gemini/Codex.

Mục tiêu là chuẩn hóa toàn bộ luồng nghiệm thu Node để không còn hai cách duyệt chồng chéo:

- Duyệt loại giấy có file.
- Xác nhận checklist không có loại giấy.
- Duyệt hoàn thành Node.
- Thông báo điều hướng tới đúng đối tượng cần xử lý.

Không tự ý deploy production, không push `main`, không chạy thao tác xóa dữ liệu. Làm trên nhánh sửa lỗi hiện tại và kiểm tra local trước.

## 2. Bối cảnh lỗi thực tế

Hợp đồng kiểm tra local:

```text
005/BK-2026
```

Node:

```text
K01
status = submitted
```

Dữ liệu thực tế đã kiểm tra:

```text
Checklist 1: Kiểm tra tính hợp lệ giấy tờ đầu vào
Checklist status: pending
Runtime document type: XX
Document type status: pending_review
File count: 1

Checklist 2: Tiếp nhận hồ sơ & giấy tờ từ khách
Checklist status: pending_approval
Runtime document type: none
File count: 0
```

Hiện tượng người dùng thấy:

- Một checklist có loại giấy và file.
- Một checklist không có loại giấy.
- Sếp đã vào luồng duyệt nhưng Node vẫn chưa hoàn tất.
- Chuông thông báo không phân biệt rõ loại giấy chờ duyệt và checklist không có loại giấy.
- Có thể xuất hiện thông báo checklist nhưng khi mở ra không có nút xử lý phù hợp.

## 3. Quyết định nghiệp vụ cần triển khai

### 3.1. Checklist có loại giấy

Nếu checklist có một hoặc nhiều runtime document type:

```text
Nhân viên thêm loại giấy
→ upload file
→ pending_review
→ Sếp duyệt từng loại giấy
→ approved hoặc rejected
```

Điều kiện một loại giấy đạt:

```text
status = approved
và có ít nhất một active file
```

Điều kiện checklist có loại giấy đạt:

```text
Tất cả active document types của checklist đều approved
và mỗi loại có ít nhất một active file
```

Nếu còn `pending_review`, không được hoàn tất Node.

Nếu có `rejected`, Node phải có đường trả lại nhân viên.

### 3.2. Checklist không có loại giấy

Nếu checklist bắt buộc nhưng không có runtime document type:

- Không tạo nút duyệt loại giấy.
- Không giả định checklist đã đạt chỉ vì không có file.
- Không tạo thông báo `document_type_review`.
- Đưa checklist vào nhóm **Checklist cần xác nhận** trong modal nghiệm thu Node.

Modal cần hiển thị rõ:

```text
Checklist “Tiếp nhận hồ sơ & giấy tờ từ khách”
Chưa được phân loại loại giấy hoặc chưa có minh chứng file.
Bạn có xác nhận checklist này đã hoàn thành không?
```

Hai lựa chọn:

```text
Xác nhận hoàn thành
Trả lại nhân viên
```

Quy tắc:

- `Xác nhận hoàn thành`: ghi trạng thái checklist approved/confirmed, actor và timestamp.
- `Trả lại nhân viên`: bắt buộc ghi chú, chuyển Node `rework_required` và checklist `failed`.
- Nếu checklist có `is_required = false`, không chặn hoàn thành Node.
- Nếu checklist có `is_required = true`, phải có xác nhận mới được hoàn tất Node.

## 4. Một modal nghiệm thu Node duy nhất

Mục tiêu frontend:

```text
Một Node chỉ có một luồng duyệt cuối cùng.
```

Modal/Review Inbox cần có các vùng:

1. **Loại giấy cần duyệt**
   - Tên loại giấy.
   - Checklist cha.
   - File.
   - Trạng thái.
   - Duyệt / Từ chối.

2. **Checklist không có loại giấy cần xác nhận**
   - Tên checklist.
   - Ghi chú nhân viên nếu có.
   - Nút xác nhận.
   - Nút trả lại.

3. **Tài liệu bị từ chối hoặc còn thiếu**
   - Tên tài liệu.
   - Lý do.
   - File hiện tại.

4. **Kết luận Node**
   - Duyệt hoàn thành Node.
   - Trả lại nhân viên.
   - Chọn outcome nếu Node có nhiều transition.
   - Ghi chú nghiệm thu.

Không tạo thêm một UI duyệt riêng trên Dashboard cho cùng nghiệp vụ. Chuông và màn hình workflow phải dùng cùng component/state hoặc ít nhất cùng payload/handler chuẩn.

## 5. Chuẩn hóa trạng thái

### Runtime document type

Giữ các trạng thái hiện có:

```text
draft
pending_review
approved
rejected
```

### Checklist không có runtime document type

Ưu tiên dùng trạng thái hiện có để giảm migration:

```text
pending_approval  = chờ sếp xác nhận checklist không giấy
approved          = đã xác nhận hoàn thành
failed            = bị trả lại
```

Nếu agent chọn thêm trạng thái mới như `pending_confirmation`, phải:

- Có migration rõ ràng.
- Cập nhật toàn bộ query/backend/frontend/test.
- Không để trạng thái mới bị bỏ sót trong notification và submit gate.

## 6. Backend cần kiểm tra và sửa

### File chính

```text
dev/backend/src/dossiers/checklist_document_types.py
dev/backend/src/contracts/workflow_runtime.py
dev/backend/src/routes/routes_notifications.py
dev/backend/src/routes/routes_contracts.py
dev/backend/src/routes/routes_employee_portal.py
dev/backend/src/dossiers/documents.py
```

### Logic hiện tại cần đối chiếu

Các hàm quan trọng:

```text
progress()
node_type_review_summary()
submit_types_for_node()
promote_completed_checklist_types()
review_type()
node_document_review_summary()
node_documents_all_approved()
submit_task_node_for_acceptance()
review_task_node_acceptance()
```

### Việc cần làm

1. Tách rõ hai tập dữ liệu:
   - `pending_document_type_reviews`
   - `pending_checklist_confirmations`

2. Khi duyệt loại giấy cuối cùng:
   - Không tự hoàn tất Node nếu còn checklist bắt buộc không có loại giấy chưa xác nhận.
   - Chỉ tự hoàn tất nếu toàn bộ điều kiện đã đạt và Node có thể tự chọn outcome.
   - Nếu cần chọn outcome, trả về `requires_node_outcome = true` để frontend mở modal chọn outcome.

3. Khi xác nhận checklist không có loại giấy:
   - Ghi actor, timestamp và trạng thái.
   - Không tạo fake document type.
   - Không đưa checklist đó vào bộ đếm document type.

4. Khi trả lại:
   - Bắt buộc reason tối thiểu hợp lý, nên từ 5 ký tự.
   - Đưa Node về `rework_required`.
   - Đưa checklist cần sửa về `failed`.
   - Ghi `task_node_events` với payload chứa checklist id và lý do.

5. Duyệt Node phải kiểm tra:
   - Checklist bắt buộc không còn trạng thái chưa nộp/chưa xác nhận.
   - Document type có loại giấy phải đạt 100%.
   - Không còn file hiện hành bị rejected.
   - Điều kiện công nợ của Node bàn giao.
   - Outcome hợp lệ nếu workflow có nhiều nhánh.

## 7. Chuẩn hóa thông báo

Không dùng một type chung cho hai nghiệp vụ khác nhau.

### Thông báo loại giấy

Payload đề xuất:

```json
{
  "type": "document_type_review",
  "target_type": "document_type_review",
  "target_id": "document-type-id",
  "task_node_id": "task-node-id",
  "checklist_result_id": "checklist-result-id",
  "document_type_id": "document-type-id",
  "contract_id": "005/BK-2026",
  "node_key": "k01",
  "label": "Loại giấy XX trong checklist ... chờ duyệt"
}
```

Click phải:

- Mở đúng contract/service line.
- Chọn đúng Node.
- Mở Review Inbox.
- Focus đúng loại giấy.

### Thông báo checklist không có loại giấy

Payload đề xuất:

```json
{
  "type": "checklist_confirmation",
  "target_type": "checklist_confirmation",
  "target_id": "checklist-result-id",
  "task_node_id": "task-node-id",
  "checklist_result_id": "checklist-result-id",
  "contract_id": "005/BK-2026",
  "node_key": "k01",
  "label": "Checklist ... chưa có loại giấy, chờ xác nhận"
}
```

Click phải:

- Mở đúng Node.
- Focus đúng checklist trong modal nghiệm thu.
- Không mở một màn hình trống.

### Không gửi thông báo sai

Không tạo `checklist_review` cho checklist không có document type nếu UI đích không có nút xử lý tương ứng.

Không gửi thông báo `document_type_review` cho checklist không có document type.

## 8. Frontend cần kiểm tra và sửa

### File chính

```text
dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx
dev/frontend/src/components/contracts/ContractWorkspace.jsx
dev/frontend/src/components/contracts/NodeChecklistCard.jsx
dev/frontend/src/components/NotificationBell.jsx
dev/frontend/src/App.jsx
```

### Hiện trạng cần lưu ý

`pendingReviewItems` hiện đang gom cả:

- Runtime document types ở trạng thái `pending_review`.
- Checklist legacy/runtime không có type ở trạng thái `pending_approval` hoặc `late_pending_approval`.

Agent phải giữ hai nhóm này tách biệt trong UI và notification, không chỉ đổi nhãn.

`NodeChecklistCard` hiện có hai đường render:

- `DocumentTypeRow` cho runtime document type.
- `DocumentRow` cho output document legacy.

Không để checklist không có type rơi vào `DocumentTypeRow` hoặc bị coi là đã đạt mặc định.

### Acceptance modal

Nếu chưa có modal tổng hợp, có thể mở rộng Review Inbox hiện có, nhưng phải đảm bảo:

- Một lần fetch có đủ thông tin của Node.
- Duyệt nhiều loại giấy không làm mất context.
- Checklist không có type có checkbox/nút confirm riêng.
- Nút hoàn tất Node bị khóa nếu còn blocker.
- Nút trả lại yêu cầu reason.

## 9. Luồng chuẩn sau khi sửa

```text
Nhân viên upload loại giấy XX
  -> document_type = pending_review
  -> thông báo document_type_review
  -> sếp duyệt XX

Checklist không có loại giấy
  -> pending_approval
  -> thông báo checklist_confirmation
  -> sếp xác nhận hoặc trả lại

Khi cả hai nhóm đạt
  -> mở modal hoàn tất Node
  -> nếu nhiều nhánh: chọn outcome
  -> accepted/completed
  -> mở Node tiếp theo
```

## 10. Test bắt buộc

### Backend unit/integration

Tạo test cho các tình huống:

1. Một checklist có một document type, có file, status `pending_review`.
2. Duyệt document type thành công.
3. Một checklist không có document type nhưng bắt buộc.
4. Checklist không type không được tự động coi là approved.
5. Xác nhận checklist không type thành công.
6. Từ chối checklist không type bắt buộc reason.
7. Duyệt document type cuối cùng nhưng còn checklist không type chưa xác nhận: Node không được hoàn tất.
8. Duyệt document type cuối cùng và xác nhận checklist không type: Node hoàn tất.
9. Một checklist không bắt buộc không chặn Node.
10. Node nhiều transition trả `requires_node_outcome`.
11. Tài liệu bị rejected vẫn chặn cho tới khi có file hiện hành mới.
12. Notification query trả đúng hai loại thông báo.

### Frontend

Chạy tối thiểu:

```bash
docker compose -f docker-compose.dev.yml exec -T frontend npm run build

docker compose -f docker-compose.dev.yml exec -T frontend npm test -- \
  --run src/App.sidebar.test.jsx

docker compose -f docker-compose.dev.yml exec -T frontend npm test -- \
  --run src/components/contracts/NodeChecklistCard.test.jsx

docker compose -f docker-compose.dev.yml exec -T frontend npm test -- \
  --run src/features/employee-portal/ChecklistOutputDocuments.test.jsx
```

Nếu có test mới cho Review Inbox/notification, phải chạy thêm test đó.

### Manual test với dữ liệu K01

Dùng dữ liệu local đã xác định:

```text
contract: 005/BK-2026
node: K01
node status: submitted
runtime type: XX, pending_review, 1 file
checklist không type: pending_approval
```

Kiểm tra:

1. Chuông hiển thị thông báo loại giấy XX.
2. Chuông hiển thị thông báo checklist không type.
3. Click thông báo loại giấy mở đúng Node và focus XX.
4. Click thông báo checklist mở đúng Node và focus checklist không type.
5. Duyệt XX nhưng chưa xác nhận checklist không type: Node chưa hoàn tất.
6. Xác nhận checklist không type: modal cho phép hoàn tất Node.
7. Trả checklist không type: Node về `rework_required`, có lý do cho nhân viên.

## 11. Ràng buộc an toàn

- Không chạy `docker compose down -v`.
- Không xóa dữ liệu production.
- Không sửa migration đã chạy nếu chưa có kế hoạch migration mới.
- Không đưa token, password, private key hoặc `.env` vào commit.
- Không push trực tiếp `main`.
- Không tự động deploy VPS trong lúc đang test local.
- Giữ các thay đổi không liên quan trong workspace, không revert thay đổi của người khác.

## 12. Tiêu chí nghiệm thu cuối

- [ ] Chỉ còn một mô hình duyệt Node rõ ràng.
- [ ] Document type có file được duyệt theo document type.
- [ ] Checklist không có document type được xác nhận trong modal Node.
- [ ] Checklist bắt buộc không bị bỏ qua.
- [ ] Checklist không bắt buộc không chặn Node.
- [ ] Duyệt loại giấy cuối cùng không tự bỏ qua checklist không type.
- [ ] Từ chối luôn cần lý do và trả đúng Node.
- [ ] Notification phân biệt `document_type_review` và `checklist_confirmation`.
- [ ] Click notification focus đúng Node/checklist/document type.
- [ ] Node nhiều nhánh yêu cầu chọn outcome.
- [ ] Không còn UI duyệt trùng gây mâu thuẫn.
- [ ] Build và test pass.
- [ ] Manual test dữ liệu K01 pass.

## 13. Báo cáo agent cần trả về

Agent sau khi thực hiện phải báo cáo:

1. Files đã sửa.
2. Schema/migration có thay đổi hay không.
3. Các API/notification payload đã đổi.
4. Logic cũ nào đã loại bỏ.
5. Test đã chạy và kết quả.
6. Manual test K01 có pass hay còn blocker.
7. Có cần migration/deploy production hay không.
8. Commit SHA trên branch sửa lỗi, không phải `main`.
