# Thiết kế loại giấy động trong checklist và Tủ hồ sơ 100%

Ngày: 2026-09-04  
Phạm vi: workspace node của nhân viên, màn duyệt của Giám đốc, Mẫu giấy tờ và Tủ hồ sơ.

## 1. Mục tiêu

Nhân viên đang làm một node phải có thể:

1. Chọn loại giấy đã được cấu hình đúng combo Gói dịch vụ + Dạng hạng mục + Mã node.
2. Nếu không có gợi ý phù hợp, tạo loại giấy mới ngay trong checklist hiện tại.
3. Gắn nhiều file hoặc ảnh vào một loại giấy.
4. Nộp toàn bộ node qua nút Nộp nghiệm thu hiện có, không phát sinh một vòng gửi duyệt loại giấy riêng.
5. Khi node bị trả về, nhận lại nguyên trạng checklist, kết quả từng loại giấy, lý do không đạt và nơi upload lại.

Giám đốc duyệt theo **loại giấy**. Toàn bộ file của một loại là một bộ để đọc; Giám đốc bấm Đạt hoặc Không đạt trên hàng loại giấy. Không đạt bắt buộc có lý do.

Một checklist chỉ đạt 100% khi mọi loại giấy đang hoạt động trong checklist đều đạt. Chỉ lúc đó:

- các loại giấy của checklist mới xuất hiện trong Tủ hồ sơ của đúng quy trình;
- loại giấy do nhân viên tạo mới được ghi vào Mẫu giấy tờ để gợi ý cho lần sau.

Quy tắc 100% này áp dụng cho checklist có loại giấy. Checklist chỉ có minh chứng
không file tiếp tục dùng trạng thái minh chứng hiện hành và không sinh nội dung
trong Tủ hồ sơ.

## 2. Bất biến nghiệp vụ

### 2.1. Loại giấy và nhóm nguồn

Mỗi loại giấy thuộc đúng một nhóm nguồn:

- `KHACH_HANG`: Khách hàng cung cấp, ví dụ CCCD, giấy chứng nhận quyền sử dụng đất. Công ty không tự tạo loại giấy này.
- `CONG_TY`: Công ty soạn/lập hoặc tạo ra trong quá trình thực hiện.
- `CO_QUAN`: Pháp lý/cơ quan Nhà nước phát hành hoặc trả về. Mã DB cũ được giữ để tương thích; nhãn UI là “Pháp lý”.

Khi chọn một mẫu gợi ý có sẵn, tên và nhóm nguồn được khóa theo mẫu. Nhân viên chỉ tự nhập nhóm nguồn khi tạo loại giấy mới.

### 2.2. Khóa gợi ý chính xác

Một gợi ý chỉ khớp khi đồng thời thỏa:

```text
service_package_id + task_type_id + node_code
```

Danh tính loại giấy còn gồm tên chuẩn hóa và nhóm nguồn. Cùng tên nhưng khác nguồn là hai loại khác nhau và không được tự gộp.

Không rơi về gợi ý rộng hơn từ PACKAGE, TASK_TYPE hoặc GLOBAL trong form này. Các phạm vi cũ vẫn được giữ cho màn cũ, nhưng luồng nhân viên chỉ đọc combo chính xác.

### 2.3. Nhiều file trên một loại giấy

Một loại giấy có 0..n file/ảnh đang hoạt động. Trạng thái duyệt nằm ở cấp loại giấy, không nằm ở từng file.

- Thêm hoặc thay đổi tập file sau khi bị trả về đưa loại giấy về `draft`.
- Khi node được nộp nghiệm thu, loại giấy chuyển sang `pending_review`.
- Loại giấy không có file hoạt động không thể được Giám đốc đánh dấu Đạt.
- Đạt khóa tập file của loại giấy trong lượt duyệt đó.
- Không đạt giữ nguyên file, lưu lý do và cho phép nhân viên gỡ/thêm file sau khi node được trả về.
- File cũ không bị xóa vật lý; quan hệ hoạt động được hạ cờ để giữ lịch sử/audit.

### 2.4. Tủ hồ sơ

Tủ hồ sơ thuộc một `service_line`/workflow instance, không phải kho mẫu toàn hệ thống.

- Chỉ đọc các checklist đã đạt 100%.
- Mỗi hàng hiển thị tên loại giấy, nhóm nguồn và tổng số file hoạt động.
- Checklist chưa đủ 100% không lộ một phần tài liệu vào Tủ hồ sơ.
- Sidebar Hợp đồng và Tủ hồ sơ trong workspace nhân viên dùng cùng một API/source of truth.

## 3. Mô hình dữ liệu

### 3.1. Bảng loại giấy runtime

Thêm bảng `checklist_result_document_types`:

| Cột | Ý nghĩa |
|---|---|
| `id` | ID bền của loại giấy trong checklist runtime |
| `checklist_result_id` | Checklist chứa loại giấy |
| `template_id` | Mẫu có sẵn; nullable với loại nhân viên vừa tạo |
| `slot_id` | Ô giấy runtime; nullable trước khi materialize |
| `name` | Tên snapshot tại thời điểm thêm |
| `source` | `KHACH_HANG`, `CONG_TY`, `CO_QUAN` |
| `origin` | `CONFIGURED` hoặc `EMPLOYEE_CREATED` |
| `status` | `draft`, `pending_review`, `approved`, `rejected` |
| `rejection_reason` | Lý do không đạt ở cấp loại giấy |
| `created_by`, `reviewed_by`, timestamps | Audit |
| `promoted_template_id` | Mẫu được tạo/tái sử dụng sau khi checklist đạt 100% |

Ràng buộc:

- unique loại đang hoạt động theo `(checklist_result_id, normalized_name, source)`;
- `template_id` có thì tên và nguồn phải lấy từ template phía server;
- `rejected` luôn có `rejection_reason`;
- nhân viên chỉ sửa loại thuộc checklist/node mình được phân công và node đang ở trạng thái cho phép làm lại.

### 3.2. Bảng file của loại giấy

Thêm bảng `checklist_result_document_type_files`:

| Cột | Ý nghĩa |
|---|---|
| `document_type_id` | Loại giấy runtime |
| `document_id` | File/ảnh trong `dossier_documents` |
| `is_active` | Thuộc bộ file hiện tại hay chỉ còn lịch sử |
| `created_by`, `created_at`, `removed_by`, `removed_at` | Audit |

Một file được upload một lần và có thể được mở qua backend có kiểm quyền. Không copy object khi duyệt hoặc đưa vào Tủ hồ sơ.

### 3.3. Phạm vi Mẫu giấy tờ chính xác

Mở rộng `document_template_applicabilities` với `applicability_type = 'COMBO'`:

- bắt buộc có `service_package_id`;
- bắt buộc có `task_type_id`;
- bắt buộc có `node_code`;
- unique theo `(template_id, service_package_id, task_type_id, node_code)`.

`COMBO` có độ cụ thể cao nhất. API gợi ý của nhân viên chỉ lấy `COMBO` khớp cả ba khóa và `is_default = true`.

### 3.4. Backfill

Với checklist đang chạy:

- materialize mỗi `output_documents[].template_id` hiện có thành một dòng `CONFIGURED`;
- nối các `checklist_result_document_links` hiện hành vào loại runtime tương ứng qua slot/template;
- suy trạng thái loại giấy từ phán quyết hiện hành theo quy tắc “bản mới nhất thắng” để không đổi kết quả đang thấy;
- dữ liệu đề xuất cũ tiếp tục dùng API cũ; chỉ đề xuất tạo từ UI mới đi vào state machine mới.

Migration phải additive và có down migration tương ứng.

## 4. State machine

```text
Chọn gợi ý / Tạo mới
        |
        v
      draft <-------------------------+
        |                              |
        | Nộp nghiệm thu node          | sửa tập file sau khi trả về
        v                              |
 pending_review                       |
    |          |                       |
    | Đạt      | Không đạt + lý do     |
    v          v                       |
 approved    rejected ----------------+
    |
    | mọi loại giấy trong checklist approved
    v
 checklist 100% -> publish Tủ hồ sơ -> promote loại mới vào Mẫu giấy tờ COMBO
```

Nộp node và chuyển các loại `draft/rejected` sang `pending_review` phải cùng transaction. Duyệt loại cuối cùng và promotion/tủ hồ sơ cũng cùng transaction để không có trạng thái “đã đạt nhưng chưa học mẫu”.

## 5. API

### 5.1. Gợi ý đúng combo

```http
GET /api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-type-suggestions
```

Server tự suy contract, service line, package, task type và node từ assignment; client không truyền các khóa phạm vi.

```json
{
  "data": [
    {
      "template_id": "TPL-CCCD",
      "name": "CCCD/CMND",
      "source": "KHACH_HANG",
      "source_label": "Khách hàng cung cấp"
    }
  ],
  "context": {
    "service_package_name": "Gói tách thửa",
    "task_type_name": "Đo vẽ hiện trạng",
    "node_code": "K02"
  }
}
```

### 5.2. Thêm loại giấy vào checklist

Chọn gợi ý:

```http
POST /api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types
{"template_id":"TPL-CCCD"}
```

Tạo mới:

```http
POST /api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types
{"name":"Ảnh vị trí mốc phụ","source":"CONG_TY"}
```

Loại giấy xuất hiện ngay trong response checklist sau khi tạo.

### 5.3. File của loại giấy

```http
POST   /api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types/{type_id}/files
DELETE /api/employee-portal/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types/{type_id}/files/{document_id}
```

POST nhận multipart nhiều file. Backend kiểm loại file, kích thước, assignment và trạng thái node trước khi ghi.

### 5.4. Duyệt theo loại giấy

```http
POST /api/contracts/workflow/checklist/{checklist_result_id}/document-types/{type_id}/review
```

```json
{"decision":"approved","reason":null}
```

hoặc:

```json
{"decision":"rejected","reason":"Ảnh trang 2 bị mờ, không đọc được số thửa."}
```

Từ chối không có lý do trả 422. Duyệt Đạt loại giấy chưa có file hoạt động cũng
trả 422. Chỉ người có quyền duyệt node và chỉ khi node đang `submitted` mới gọi được.

### 5.5. Response checklist

Mỗi checklist trả thêm `document_types` đã materialize:

```json
{
  "id": "CR-01",
  "document_types": [
    {
      "id": "CRT-01",
      "template_id": null,
      "name": "Ảnh vị trí mốc phụ",
      "source": "CONG_TY",
      "origin": "EMPLOYEE_CREATED",
      "status": "rejected",
      "rejection_reason": "Ảnh trang 2 bị mờ.",
      "files": [
        {"document_id":"D-01","file_name":"moc-1.jpg"},
        {"document_id":"D-02","file_name":"moc-2.jpg"}
      ],
      "file_count": 2
    }
  ],
  "document_type_progress": {"approved": 1, "total": 2, "percent": 50}
}
```

## 6. Giao diện

### 6.1. Form Thêm loại giấy

Form là panel dropdown gọn nằm ngay dưới header của checklist, không mở modal
che workspace và không phải phiếu duyệt độc lập.

1. Combobox “Loại giấy” tìm trong gợi ý đúng combo.
2. Kết quả hiển thị tên + badge nhóm nguồn.
3. Chọn gợi ý khóa tên/nguồn theo mẫu.
4. Cuối danh sách có “Không thấy loại giấy — Tạo mới”.
5. Chế độ tạo mới mở tên + ba nhóm nguồn.
6. Context Gói + Dạng hạng mục + Node là chip chỉ đọc.
7. File picker có `multiple`, liệt kê file đã chọn trước khi lưu.
8. Nút chính là “Thêm vào checklist”; bỏ “Gửi duyệt”.

### 6.2. Hàng loại giấy của nhân viên

Mỗi hàng luôn có:

- tên loại giấy;
- badge nguồn;
- trạng thái;
- `n file` và dropdown xem danh sách file;
- nút upload nhiều file ở cuối hàng khi được phép sửa.

Trạng thái:

- `draft`: Chưa nộp;
- `pending_review`: Chờ duyệt;
- `approved`: tích xanh, khóa upload;
- `rejected`: viền đỏ, hiện nguyên văn lý do và mở upload/gỡ file khi node được trả về.

### 6.3. Hàng duyệt của Giám đốc

Giám đốc mở dropdown của loại giấy để đọc tất cả file, rồi bấm Đạt hoặc Không đạt ngay trên hàng loại giấy. Không đạt mở ô nhập lý do tại chỗ và không cho gửi rỗng.

### 6.4. Workspace cố định, mật độ cao

- Workspace desktop dùng chiều cao khả dụng của viewport (`100dvh` trừ app header).
- Thanh hợp đồng và timeline node ở trên; vùng hai cột chiếm phần còn lại.
- Hai cột bằng chiều cao, `min-height: 0` để cuộn đúng vùng.
- Cột trái nén khoảng cách: tên node, thời gian và tổng tiền luôn thấy; Mô tả và
  Tủ hồ sơ là dropdown, trong đó Tủ hồ sơ mặc định đóng.
- Cột phải cố định header Nhiệm vụ và footer Nộp nghiệm thu/Nhờ hỗ trợ.
- Kho giấy khách gửi và từng checklist là dropdown. Checklist đầu tiên mặc định
  mở; các checklist còn lại đóng. Kho giấy khách gửi tự đóng khi rỗng.
- Chỉ thân danh sách checklist cuộn nội bộ khi nội dung vượt chiều cao.
- Bỏ hoàn toàn cảnh báo rời “Còn thiếu giấy tờ đầu ra ở … mục checklist”; trạng thái thiếu/không đạt nằm ngay trên hàng liên quan.
- Mobile chuyển thành một cột và cuộn trang tự nhiên; không ép viewport cố định trên màn hình hẹp.

Giữ hệ màu cam–xanh hiện tại; dùng màu để mã hóa trạng thái, không thêm trang trí mới.

## 7. Tương thích và chuyển đổi

- API cũ của `document_slot_creation_requests` tiếp tục phục vụ phiếu cũ trong hàng chờ duyệt.
- UI nhân viên mới không tạo `slot-request` kiểu cũ.
- Duyệt từng document link hiện tại được giữ trong giai đoạn chuyển đổi; UI mới gọi duyệt theo loại giấy.
- `checklist_cabinet_by_node` chuyển sang đọc loại runtime và chỉ trả checklist 100%; `cabinet_by_node` vẫn giữ làm fallback cho màn cũ trong một chu kỳ phát hành.
- Mã nguồn `CO_QUAN` không đổi; chỉ đổi nhãn người dùng thành “Pháp lý”.

## 8. Xử lý lỗi và đồng thời

- Mọi endpoint suy ngữ cảnh combo phía server; không tin package/task type/node do client gửi.
- Khóa checklist result khi nộp, duyệt hoặc promote để hai lượt duyệt song song không promote hai lần.
- Promotion idempotent: dùng lại mẫu chỉ khi tên chuẩn hóa, nguồn và cấu hình tương thích; applicability COMBO dùng unique index.
- Upload lỗi một file không làm mất các file đã thành công; response trả kết quả từng file.
- Loại giấy approved không được thay file. Muốn sửa phải có quyết định trả về/rejected.
- Không cho xóa loại giấy đã vào một lượt nghiệm thu; chỉ cho bỏ khi còn draft và chưa từng review.

## 9. Kiểm thử

### Backend

- Gợi ý chỉ trả combo khớp đủ ba khóa.
- Chọn mẫu có sẵn lấy tên/nguồn từ DB, bỏ qua dữ liệu giả từ client.
- Tạo mới yêu cầu tên hợp lệ và đúng một trong ba nguồn.
- Một loại nhận nhiều file; file count chính xác.
- Nộp node chuyển trạng thái loại giấy trong cùng transaction.
- Từ chối bắt buộc lý do; node không `submitted` thì không duyệt được.
- Upload lại sau rejected đưa loại về draft và giữ lịch sử file cũ.
- Checklist chỉ đạt 100% khi tất cả loại đều approved.
- Promotion chỉ chạy ở mốc 100%, đúng COMBO và idempotent.
- Tủ hồ sơ không trả checklist 99%; ở 100% trả tên loại và toàn bộ file count.
- Phân quyền nhân viên/Giám đốc và cách ly hai service line cùng hợp đồng.

### Frontend

- Combobox ưu tiên gợi ý đúng combo, có nhánh Tạo mới.
- Chọn gợi ý khóa tên/nguồn; tạo mới cho chọn ba nhóm.
- File input nhận nhiều file và hiển thị danh sách.
- Loại giấy xuất hiện ngay trong đúng checklist sau khi thêm.
- Nút Nộp nghiệm thu là đường gửi duy nhất.
- Giám đốc duyệt theo loại; từ chối rỗng bị chặn.
- Nhân viên nhận lại đủ trạng thái, lý do và upload lại đúng hàng.
- Không còn cảnh báo rời ở hình 2.
- Desktop khóa workspace trong viewport; vùng dài cuộn nội bộ; mobile cuộn tự nhiên.

## 10. Ngoài phạm vi

- Không tự đoán nhóm nguồn bằng AI hoặc từ nội dung file.
- Không tự sửa nhóm nguồn của mẫu đã tồn tại.
- Không quảng bá loại mới sang phạm vi PACKAGE, TASK_TYPE hoặc GLOBAL.
- Không hiển thị checklist chưa 100% trong Tủ hồ sơ dù một số loại đã đạt.
- Không thay đổi nguyên tắc K06: kế toán thu đủ hoặc phiếu nợ được duyệt mới cho nghiệm thu/bàn giao.
