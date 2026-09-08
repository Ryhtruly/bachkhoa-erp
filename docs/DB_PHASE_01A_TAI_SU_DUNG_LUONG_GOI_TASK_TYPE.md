# DB Phase 01A — Khoán theo công việc trong Checklist

Ngày cập nhật: 05/08/2026  
Trạng thái: **Schema lương mới đã triển khai; luồng acceptance → entitlement và UI kỳ lương còn tiếp tục**

> Đồng bộ live 07/08/2026: `task_type_rates`, `task_pay_records` và `projects_tasks` đã bị xóa. Sổ tiền mới là `work_pay_entitlements`. Xem [PHASE_STATUS_CURRENT_MODEL.md](./PHASE_STATUS_CURRENT_MODEL.md).

## 1. Điều chỉnh kết luận

Kế hoạch trước coi `task_type_rates` là tổng khoán trọn Hạng mục là chưa đủ linh hoạt.

Mô hình đúng:

- `task_types`: Hạng mục thương mại khách mua trong một Gói, ví dụ Hợp thửa Pháp Lý hoặc Hợp thửa phần Đo Vẽ.
- `work_items`: danh mục cụm công việc thực thi có đầu ra, ví dụ Đo GPS, Khảo sát, Điều chỉnh bản vẽ, Viết hồ sơ, Đi nộp.
- checklist trong Node có thể là việc kiểm tra bình thường hoặc tham chiếu một `work_item` có khoán.
- khi Node được nghiệm thu, hệ thống cộng các checklist khoán thực tế đã hoàn thành; không mặc định trả theo tên Hạng mục.

```text
Hợp đồng A
└── Hạng mục Hợp thửa                         task_types/service_lines
    └── Workflow Instance
        └── K02 Khảo sát và kỹ thuật
            ├── Kiểm tra bản vẽ kỹ thuật      checklist thường, 0 đồng
            ├── Đo GPS                        checklist khoán, 1.200.000
            └── Upload minh chứng             checklist thường, 0 đồng

K02 được nghiệm thu
→ tổng khoán K02 = tổng các checklist khoán hợp lệ
→ trường hợp trên chỉ tính Đo GPS = 1.200.000
```

Không cộng thêm 1.200.000 theo tên Hạng mục Hợp thửa nếu cấu hình thực tế chỉ chọn công việc khoán Đo GPS.

## 2. Kết quả kiểm tra Supabase live 07/08/2026

- `task_types` hiện có 22 Hạng mục thương mại thuộc ba Gói.
- “Hợp thửa” có hai ngữ cảnh khác nhau:
  - `tt_005`: Hợp thửa – phần Đo Vẽ;
  - `tt_012`: Hợp thửa – Pháp Lý.
- Không có `task_type` tên Đo GPS.
- `work_items` có 15 công việc và `work_item_rates` có 27 mức theo role/hiệu lực.
- `employee_compensation_terms` có 3 mức lương cơ bản lịch sử.
- `task_node_checklist_results` có 2 dòng, `task_node_checklist_assignments` có 4 dòng test.
- `work_pay_entitlements` đang 0 dòng vì chưa chạy xuyên suốt nghiệp vụ nghiệm thu sinh tiền.
- Các bảng `task_type_rates` và `projects_tasks` đã bị xóa; backend mới không được tính lương từ người chính/phụ cấp Hạng mục.

Điều này cho thấy `task_types` đang đúng vai trò Hạng mục thương mại nhưng không phù hợp làm danh mục mọi công việc con được trả khoán.

## 3. Một mô hình lương thống nhất

Tất cả tiền khoán chuyên môn đều đi qua `work_items`:

| Ví dụ `work_item` | Phòng | Có thể gắn vào checklist |
|---|---|---|
| Đo GPS | Đo Vẽ | Có |
| Khảo sát hiện trường | Đo Vẽ | Có |
| Cắm mốc | Đo Vẽ | Có |
| Điều chỉnh bản vẽ | Đo Vẽ | Có |
| Viết hồ sơ | Pháp Lý | Có |
| Đi nộp hồ sơ | Pháp Lý | Có |

`Đi nộp hồ sơ` có rate `SUBMITTER = 350.000đ`. Đầu ra kết thúc khi bộ hồ sơ được mang tới cơ quan và có minh chứng kết quả lần nộp. Công việc này không bao gồm K07 theo dõi vòng đời, bổ sung hồ sơ hoặc nhận kết quả.

Hạng mục khoán cố định vẫn biểu diễn được: template chỉ cần có một checklist khoán mang tên cụm công việc chính. Như vậy không cần duy trì hai engine “khoán Hạng mục” và “khoán Node”.

## 4. Phân biệt bốn lớp dữ liệu

| Lớp | Bảng | Ý nghĩa |
|---|---|---|
| Thương mại | `task_types`, `service_lines` | Khách mua Hạng mục gì |
| Danh mục thực thi | `work_items`, `work_item_rates` | Công việc nào được khoán và đơn giá |
| Thực thi | `task_node_checklist_results`, `task_node_checklist_assignments` | Checklist nào thực sự phải làm, ai làm chính/phụ |
| Sổ quyền hưởng | `work_pay_entitlements` | Khoản tiền phát sinh sau nghiệm thu và chống trùng |

## 5. Schema đề xuất

### 5.1 `work_items` — tạo mới

Danh mục cụm công việc có đầu ra nghiệm thu. Không phụ thuộc một Gói duy nhất nên có thể tái sử dụng trong nhiều workflow.

| Cột | Kiểu | Ràng buộc/ý nghĩa |
|---|---|---|
| `id` | `VARCHAR(50)` | PK |
| `code` | `TEXT` | UNIQUE, mã ổn định như `SURVEY_GPS` |
| `name` | `TEXT` | Tên như Đo GPS |
| `department_id` | FK, NULL | Phòng thực hiện mặc định |
| `output_definition` | `TEXT` | Đầu ra cần nghiệm thu |
| `default_unit` | `TEXT` | `job`, `visit`, `document`… |
| `is_active` | `BOOLEAN` | Còn được thêm vào workflow |
| `created_by` | FK | Người tạo |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | Audit thời gian |

### 5.2 `work_item_rates` — tạo mới

Đơn giá của công việc khoán theo role và thời gian hiệu lực.

| Cột | Kiểu | Ràng buộc/ý nghĩa |
|---|---|---|
| `id` | `VARCHAR(50)` | PK |
| `work_item_id` | FK | Công việc được định giá |
| `role_code` | `TEXT` | MAIN, ASSISTANT, WRITER, SUBMITTER… |
| `amount` | `NUMERIC(15,2)` | CHECK `amount >= 0` |
| `effective_from` | `DATE` | Bắt đầu hiệu lực |
| `effective_to` | `DATE`, NULL | Kết thúc hiệu lực |
| `status` | `TEXT` | draft, published, archived |
| `approved_by`, `approved_at` | FK/TIMESTAMPTZ | Giám đốc/Kế toán duyệt |
| `source_note` | `TEXT` | Nguồn bảng khoán/quyết định |
| `created_at` | `TIMESTAMPTZ` | Ngày tạo |

Quy tắc:

- rate `published` là bất biến;
- thay giá bằng record mới, không sửa lịch sử;
- không cho khoảng hiệu lực published của cùng `work_item_id + role_code` bị chồng nhau;
- index mọi FK và index một phần cho rate `status = 'published'` còn hiệu lực.

### 5.3 Checklist trong graph/revision

Checklist thường:

```json
{
  "key": "check_technical_drawing",
  "name": "Kiểm tra đã có bản vẽ kỹ thuật",
  "required": true,
  "payable": false
}
```

Checklist khoán có điều kiện:

```json
{
  "key": "survey_gps",
  "name": "Đo GPS",
  "required": true,
  "payable": true,
  "work_item_code": "SURVEY_GPS",
  "pay_group_key": "TECHNICAL_DRAWING_METHOD",
  "pay_scope": "ONCE_PER_WORKFLOW",
  "activation_condition": {
    "fact": "technical_drawing_available",
    "operator": "EQ",
    "value": false
  }
}
```

`activation_condition` dùng DSL JSON có danh sách operator cho phép; không cho nhập SQL/JavaScript tùy ý.

### 5.4 `task_node_checklist_results` — bổ sung

| Cột bổ sung | Ý nghĩa |
|---|---|
| `work_item_id` | FK nullable; NULL là checklist thường |
| `is_payable` | Snapshot có tính khoán không |
| `pay_group_key` | Nhóm loại trừ để tránh tính hai công việc thay thế nhau |
| `pay_scope` | `ONCE_PER_WORKFLOW`, `PER_OCCURRENCE`, `MANUAL` |
| `condition_result` | Điều kiện kích hoạt đúng/sai và dữ liệu đầu vào |
| `pay_key` | Key ổn định dùng chống trùng |

Ràng buộc:

- `is_payable = true` thì bắt buộc có `work_item_id` và `pay_key`;
- checklist không thỏa điều kiện chuyển `not_applicable`;
- trong cùng một Node, tối đa một checklist payable `passed` cho mỗi `pay_group_key` khác NULL;
- tất cả checklist bắt buộc đang áp dụng phải `passed` trước khi gửi nghiệm thu.

### 5.5 `task_node_checklist_assignments` — tạo mới

Phân công trực tiếp cho công việc con trong checklist.

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | `VARCHAR(50)` | PK |
| `checklist_result_id` | FK | Checklist được giao |
| `employee_id` | FK | Nhân viên thực hiện |
| `role_code` | `TEXT` | MAIN/ASSISTANT/WRITER/SUBMITTER… |
| `share_percent` | `NUMERIC(5,2)` | Phần hưởng trong rate role, mặc định 100 |
| `work_item_rate_id` | FK, NULL | Rate đã khóa khi duyệt phân công |
| `amount_override` | `NUMERIC`, NULL | Ngoại lệ có duyệt |
| `status` | `TEXT` | proposed, assigned, completed, replaced, cancelled |
| `assigned_by`, `assigned_at` | FK/TIMESTAMPTZ | Người và lúc giao |
| `approved_by`, `approved_at` | FK/TIMESTAMPTZ | Duyệt phần khoán |
| `reason` | `TEXT` | Bắt buộc khi override/thay người |

Quy tắc:

- tổng `share_percent` của mỗi checklist + role không vượt 100%;
- MAIN có thể một hoặc nhiều người; ASSISTANT là tùy chọn;
- checklist không payable vẫn được giao người nhưng không cần `work_item_rate_id`;
- `amount_override` chỉ Giám đốc/Kế toán được duyệt và luôn có audit.

### 5.6 `work_pay_entitlements` — bảng live mới

| Cột mới/chuyển đổi | Ý nghĩa |
|---|---|
| `workflow_instance_id` | Hạng mục đang chạy |
| `task_node_id` | Node được nghiệm thu |
| `checklist_result_id` | Công việc con sinh tiền |
| `checklist_assignment_id` | Người/role nhận tiền |
| `acceptance_id` | Lần nghiệm thu hợp lệ |
| `work_item_rate_id` | Rate được sử dụng |
| `employee_id`, `role_code` | Người và vai trò |
| `amount` | Rate × tỷ lệ hoặc override đã duyệt |
| `calculation_snapshot` | Tên công việc, rate, tỷ lệ, người duyệt |
| `idempotency_key` | UNIQUE chống tính trùng |
| `status` | `eligible`, `approved`, `locked`, `void` |

Không cần lưu một dòng tổng Node. Tổng Node/Hạng mục được `SUM(work_pay_entitlements.amount)` để vẫn truy ngược được tiền đến từng công việc con.

## 6. Cơ chế “vừa ràng buộc vừa thoải mái”

### Giám đốc được tự do

- thêm checklist thường tùy ý;
- chọn công việc khoán từ `work_items`;
- đặt điều kiện xuất hiện;
- chọn một hoặc nhiều người chính/phụ và chia tỷ lệ;
- tạo R2/R3 để đổi workflow đang chạy;
- đề xuất công việc/rate mới hoặc override tiền.

### Hệ thống ràng buộc

- checklist tự nhập không được sinh tiền nếu chưa liên kết `work_item` có rate published;
- không được cộng hai checklist cùng `pay_group_key` loại trừ;
- không gửi nghiệm thu nếu checklist bắt buộc chưa đạt;
- không sinh lương trước khi Node accepted;
- không tính trùng khi Node retry/quay lại;
- không sửa rate, revision hoặc pay record đã khóa;
- override/thay người phải có lý do và audit.

## 7. Mô phỏng Hạng mục Hợp thửa

### 7.1 Cấu hình

`service_line SL_A_01` là Hạng mục Hợp thửa của Hợp đồng A.

K02 có các checklist:

| key | Nội dung | payable | work_item | Điều kiện | pay_group |
|---|---|---:|---|---|---|
| `check_drawing` | Kiểm tra bản vẽ kỹ thuật | Không | — | Luôn chạy | — |
| `use_existing_drawing` | Xử lý trên bản vẽ đã có | Có | `HOP_THUA_TECH` | Có bản vẽ | `TECHNICAL_DRAWING_METHOD` |
| `survey_gps` | Đo GPS | Có | `SURVEY_GPS` | Thiếu bản vẽ | `TECHNICAL_DRAWING_METHOD` |
| `upload_evidence` | Upload file kỹ thuật | Không | — | Luôn chạy | — |

Hai checklist khoán cùng `pay_group_key`, nên chỉ một cái được áp dụng và trả tiền.

### 7.2 Trường hợp thiếu bản vẽ

| Checklist | Runtime status | Tiền MAIN |
|---|---|---:|
| Kiểm tra bản vẽ | passed | 0 |
| Xử lý trên bản vẽ đã có | not_applicable | 0 |
| Đo GPS | passed | 1.200.000 |
| Upload minh chứng | passed | 0 |

Phân công `Đo GPS`:

| Nhân viên | Role | Tỷ lệ | Tiền |
|---|---|---:|---:|
| Nguyễn A | MAIN | 100% | 1.200.000 |

K02 accepted tạo đúng một `task_pay_record = 1.200.000`. Không cộng thêm tiền khoán mang tên Hợp thửa.

### 7.3 Trường hợp có nhiều công việc khoán độc lập

Nếu một Node hợp lệ chứa:

- Đo GPS: 1.200.000;
- Cắm mốc: 1.200.000;

và chúng không cùng nhóm loại trừ, Node accepted sẽ tạo hai dòng pay, tổng Node 2.400.000. Giám đốc nhìn thấy rõ nguồn từng khoản thay vì một con số gộp không giải thích được.

## 8. Xử lý bảng cũ

### `task_type_rates`

- giữ nguyên trong giai đoạn đối soát;
- không dùng trực tiếp cho workflow/checklist mới;
- mapping các mức đã được Giám đốc/Kế toán xác nhận sang `work_item_rates`;
- sau cutover chuyển thành legacy/read-only; không ép đổi nghĩa bảng cũ.

### `node_pay_rates`

Bảng hiện đang trống. Không cần sử dụng trong mô hình thống nhất này vì công việc Pháp Lý như viết hồ sơ/đi nộp cũng là `work_items`. Tránh tồn tại hai bảng rate cùng trả lời một câu hỏi.

## 9. Kế hoạch triển khai

1. Chốt danh mục `work_items` từ bảng khoán khách cung cấp, gồm cả `Đi nộp hồ sơ` 350.000đ cho role SUBMITTER.
2. Phân loại từng item: công việc khoán, checklist thường hay phụ cấp thủ công.
3. Duyệt rate MAIN/ASSISTANT/WRITER/SUBMITTER chính thức.
4. Tạo schema additive: `work_items`, `work_item_rates`, `task_node_checklist_assignments` và mở rộng checklist/pay record.
5. Cho workflow editor gắn `work_item`, condition, pay group và người thực hiện vào checklist.
6. Viết payroll engine sinh từng dòng pay khi Node accepted trong cùng transaction.
7. Test Hợp thửa đủ bản vẽ, thiếu bản vẽ cần GPS, nhiều công việc cộng dồn, làm lại, đổi người và override.
8. Đối soát một kỳ bằng mô hình mới; không còn dual-write/dual-read với `projects_tasks/task_type_rates` vì legacy đã bị xóa theo quyết định của chủ hệ thống.

## 10. Điểm cần duyệt

- [ ] `task_types` chỉ là Hạng mục thương mại, không phải mọi công việc được khoán.
- [ ] Tiền khoán được cộng từ checklist có liên kết `work_items`.
- [ ] Checklist thường không sinh tiền.
- [ ] Hạng mục Hợp thửa thiếu bản vẽ chỉ tính công việc Đo GPS nếu đó là checklist khoán áp dụng.
- [ ] Dùng `pay_group_key` để các phương án thay thế không bị cộng đôi.
- [ ] Cho phép nhiều công việc khoán độc lập trong một Node được cộng dồn.
- [ ] Giám đốc được thêm/sửa trong draft/revision; rate hoặc override phải được duyệt và audit.
