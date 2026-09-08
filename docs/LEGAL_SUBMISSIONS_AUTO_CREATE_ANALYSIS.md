# Phân tích nghiệp vụ: Tự động tạo hồ sơ Pháp lý từ Node quy trình

Ngày viết: **10/08/2026**
Supabase project: `ejklrwydjplwzztfuygj`
Trạng thái: **Chỉ phân tích — chưa code, chờ xác nhận theo yêu cầu của chủ hệ thống**

---

## 1. Nghiệp vụ được mô tả (diễn giải lại để xác nhận)

> Quy trình (workflow) của một Hạng mục hợp đồng có thể chứa một **Node Pháp lý** (ví dụ: "Nộp hồ sơ chuyển mục đích", "Nộp hồ sơ cấp sổ"…). Khi Node ngay trước đó được nghiệm thu xong, Node Pháp lý chuyển sang trạng thái **Sẵn sàng thực hiện**. Nhân viên phòng Pháp lý bấm **"Bắt đầu làm"** (start) trên Node đó → hệ thống phải **tự động sinh 1 dòng dữ liệu mới** trong tab "Hồ Sơ Pháp Lý", điền sẵn mọi thông tin đã biết từ Hợp đồng/Node, **hạn chế tối đa nhập tay**.
>
> Cột **"Số biên nhận"** phải để **trống lúc tạo dòng** — vì số này chỉ có sau khi nhân viên pháp lý mang hồ sơ đi nộp trực tiếp tại cơ quan nhà nước và nhận biên nhận giấy. Đây là trường **bắt buộc nhập tay sau, không thể tự động điền lúc tạo dòng**.
>
> Bảng có 2 phần: **hàng dữ liệu tổng hợp** (list, dùng để lọc/theo dõi nhanh) và **thông tin chi tiết** từng hồ sơ (khi mở 1 dòng ra xem/sửa).

Tôi hiểu đúng nghiệp vụ theo cách này — nếu có điểm nào lệch ý, cần bạn chỉnh lại trước khi tôi code.

---

## 2. Đối chiếu bảng tham khảo bạn gửi (Google Sheet hiện tại của phòng Pháp lý)

| Cột trong sheet | Suy đoán ý nghĩa | Có thể tự động điền từ đâu? |
|---|---|---|
| Tình trạng thanh (toán?) | Trạng thái thu phí nộp hồ sơ — bị cắt chữ, chưa chắc chắn | ❓ Cần bạn xác nhận ý nghĩa cột này |
| Dấu thời gian | Thời điểm dòng được tạo (kiểu Google Form auto-timestamp) | Tự động = lúc bấm "Bắt đầu làm" |
| Số biên nhận | Mã biên nhận cơ quan cấp khi nộp | **Để trống, nhập tay sau** (đúng như bạn nói) |
| Số điện thoại | **✅ Đã xác nhận: SĐT của nhân viên Phụ trách pháp lý** (không phải SĐT khách hàng) — 18 dòng mẫu trùng số vì cùng 1 nhân viên phụ trách giai đoạn đó | Tự động = `employees.phone` của nhân viên đang được phân công trên Node (bảng `employees` đã có sẵn cột `phone`) |
| Phụ trách pháp lý | Tên nhân viên xử lý hồ sơ ("Hồ Thị Mỹ Hằng", "Trần Thụy Tường Vy"…) | Tự động = nhân viên đang được phân công (`task_node_assignments`) trên Node đó |
| Tên hồ sơ | Tên người đứng tên hồ sơ (không hẳn trùng khách ký hợp đồng) | Gợi ý mặc định = tên khách hàng hợp đồng, nhưng **cho phép sửa tay** vì có thể khác người đại diện pháp lý thực tế |
| TÌNH TRẠNG | **✅ Đã xác nhận đủ 4 giá trị** (theo bộ lọc thật của khách): `Đang chi nhánh`, `Hoàn thành`, `Rút hồ sơ`, `Trả công văn` | Mặc định khởi tạo = `Đang chi nhánh`, đổi tay theo tiến độ thực tế — nên làm dropdown cố định 4 giá trị này, không phải text tự do |
| Ghi chú | Mô tả loại việc ("chuyển mục đích", "cấp sổ nhà", "trích lục GPXD"…) | Gợi ý mặc định = tên/mô tả của Node hoặc Hạng mục, cho sửa tay |
| Hình chụp biên nhận | Link Drive ảnh chụp biên nhận giấy | Nhập tay sau khi có biên nhận thật (giống Số biên nhận) |
| Tệp hồ sơ | Link Drive toàn bộ hồ sơ | Có thể tái dùng link hồ sơ đã có sẵn ở Hợp đồng/minh chứng Node nếu đã upload, hoặc nhập tay |
| Ngày nhận | Ngày cơ quan tiếp nhận hồ sơ | Nhập tay (ngày nộp thực tế thường không trùng ngày bấm "Bắt đầu làm" trên hệ thống) |
| Ngày hẹn trả | Ngày hẹn trả kết quả theo biên nhận | Nhập tay (chỉ biết được khi có biên nhận) |
| Hạng… (bị cắt) | Chưa rõ — có thể là "Hạng mục" (tên Hạng mục hợp đồng) hoặc mức ưu tiên | ❓ Cần bạn xác nhận cột này là gì |

**Còn 2 điểm chưa chắc, cần bạn xác nhận thêm:**
1. "Tình trạng thanh (toán?)" — ý nghĩa chính xác?
2. Cột "Hạng…" bị cắt chữ trong ảnh — nội dung đầy đủ là gì?

*(2 điểm còn lại — "Số điện thoại" và "TÌNH TRẠNG" — đã được bạn xác nhận, xem cập nhật trong bảng trên.)*

---

## 3. Hiện trạng đã kiểm tra trong DB và code

### 3.1. Phát hiện quan trọng: tính năng "Hồ Sơ Pháp Lý" hiện tại đã **chết hoàn toàn**

- Trang `dev/frontend/src/pages/LegalSubmissions.jsx` đang gọi các API `/api/legal-submissions/*` và `/api/tasks/`.
- Backend **không còn** `routes_legal_submissions.py` lẫn `routes_tasks.py` (đã bị xoá khỏi ổ đĩa, hiện `git status` báo `D`, chưa commit).
- Model SQLAlchemy `TaskSubmission` và `ProjectTask` mà route cũ dùng **không còn tồn tại** trong `db/models/`.
- Trong Supabase, **không có bảng nào tên `legal_submissions` hay `task_submissions`** (`information_schema.tables` xác nhận).
- Đối chiếu `docs/PHASE_STATUS_CURRENT_MODEL.md` (§4): bảng `task_submissions` đã bị xoá tường minh trong migration `20260806162743_remove_legacy_project_task_model`, cùng đợt dọn `projects_tasks`, `task_pay_records`… — tức đây là hệ quả của lần dọn dẹp hệ thống cũ (chuyển sang mô hình Node/Workflow mới), **không phải lỗi phát sinh ngoài ý muốn**.

→ Kết luận: hiện bấm "Hồ Sơ Pháp Lý" trên UI sẽ chỉ ra lỗi tải dữ liệu (API 404), trang này **đang trôi nổi, không gắn gì với dữ liệu thật**. Yêu cầu của bạn không phải "vá thêm 1 tính năng cũ" mà là **xây lại từ đầu, gắn đúng vào mô hình Node hiện hành** (`task_nodes` / `workflow_instances`) — đúng thời điểm để làm, vì chưa có dữ liệu cũ phải di trú.

### 3.2. Mô hình Node hiện hành có thể tái dùng

```text
contracts → service_lines → workflow_instances → workflow_instance_revisions (graph JSON)
                                                  └── task_nodes (K01, K02, K09...)
                                                        ├── task_node_assignments   (ai phụ trách Node)
                                                        ├── task_node_checklist_results
                                                        └── task_node_events        (nhật ký trạng thái)
```

- `task_nodes.status`: `pending → ready → in_progress → submitted → accepted/rework_required`.
- Hàm `start_task_node()` (`dev/backend/src/contracts/workflow_runtime.py:1334`) là nơi xử lý đúng hành động **"nhân viên bấm Bắt đầu làm"** (`ready/rework_required → in_progress`) — **chính là điểm nối nghiệp vụ bạn mô tả** ("bấm sẵn sàng thì tự động tạo dòng").
- Thông tin có sẵn tại thời điểm đó, lấy được **không cần nhập tay**:
  - Khách hàng, SĐT, hợp đồng: từ `contracts` → `customers` (`full_name`, `phone`).
  - Nhân viên phụ trách: từ `task_node_assignments` (JOIN `employees.full_name`, đã dùng sẵn ở Node card ngoài Designer).
  - Tên/Mô tả loại hồ sơ: từ `task_nodes` (qua graph JSON của Node: `name`, `description`) hoặc `service_lines.task_type`.
  - Ngày tạo dòng: `now()`.

### 3.3. Vấn đề: hiện **không có cách nào đánh dấu 1 Node là "Node Pháp lý"**

Đã kiểm tra kỹ:
- `task_nodes` (bảng thật): không có cột role/department/category nào.
- `workflow_nodes` (catalog K01…K09): chỉ có `code, name, description, is_active` — không có phân loại.
- Trong graph JSON của từng Node (`workflow_instance_revisions.graph`) có field `role`, nhưng qua kiểm tra dữ liệu thật, field này **luôn rỗng `""`** và trong UI Designer nó được dùng cho mục đích khác (label "Vai trò mặc định", placeholder `MAIN, ASSISTANT, SUBMITTER` — tức là role_code **mặc định khi phân công người**, không phải "loại/phòng ban của Node"). **Không nên tái dùng field này** vì sai nghĩa, dễ gây nhầm lẫn về sau.
- Có sẵn bảng `departments` với đúng dòng `Phòng Pháp lý` (`id=dept_phaply`, `code=LEGAL`) — nhưng bản thân Node không liên kết trực tiếp tới phòng ban; chỉ nhân viên (`employees.department_id`) mới có phòng ban.

→ Cần **thêm 1 cờ đánh dấu Node tường minh** (không suy luận gián tiếp qua phòng ban của người được phân công, vì phân công có thể đổi người/đổi phòng ban theo thời gian mà bản chất Node vẫn luôn cần nộp cơ quan nhà nước).

### 3.4. Bổ sung nghiệp vụ: 2 tab = 2 phạm vi Drive khác nhau, cùng 1 quy trình

Bạn xác nhận thêm 1 điểm quan trọng:

> Các Node (Đo vẽ, Pháp lý…) đều chỉ là **các bước trong cùng 1 quy trình để hoàn thành 1 Hạng mục** — không phải 2 quy trình tách biệt. Nhưng phạm vi tài liệu lưu trữ (Drive) của 2 tab khác nhau:
> - **Tab Đo vẽ**: Drive chỉ chứa **sản phẩm kỹ thuật** (bản vẽ, ảnh hiện trạng, tọa độ GPS…).
> - **Tab Pháp lý**: Drive chứa **toàn bộ** — cả sản phẩm kỹ thuật (thừa hưởng từ Đo vẽ) **lẫn** giấy tờ pháp lý do nhân viên Pháp lý soạn — vì hồ sơ nộp cơ quan nhà nước cần đầy đủ cả 2 loại.

Điểm này xác nhận đúng hướng đã đề xuất ở §4.2 cho field `dossier_file_url` (Tệp hồ sơ): đây không phải một link rời rạc nhập tay từ đầu, mà về bản chất là **Drive tổng hợp**, kế thừa từ minh chứng (evidence) của các Node Đo vẽ trước đó cộng thêm giấy tờ pháp lý mới.

**✅ Đã chốt hướng (b):** 2 Drive folder riêng — 1 cho Đo vẽ, 1 cho Pháp lý — **phạm vi theo từng Hạng mục** (không phải chung cả hợp đồng, vì bạn xác nhận "1 hợp đồng có thể có nhiều Hạng mục, mỗi Hạng mục là 1 quy trình nên cần Drive riêng của Hạng mục đó"). Khi Node Pháp lý của Hạng mục đó bấm "Bắt đầu làm", hệ thống **tự liên kết** (không copy vật lý) các file minh chứng từ Node Đo vẽ *cùng Hạng mục* sang hồ sơ Pháp lý vừa tạo.

---

## 4. Hướng đề xuất

### 4.1. Cờ đánh dấu Node — thêm field mới, không tái dùng `role`

Thêm 1 field boolean tường minh trong graph JSON của Node, ví dụ `requires_gov_submission: true/false`, sửa ở đúng chỗ đang có `evidence_required` (checkbox) trong Node Inspector của Workflow Designer. Ý nghĩa rõ ràng: "Node này khi bắt đầu làm sẽ tự tạo 1 hồ sơ nộp cơ quan nhà nước cần theo dõi" — tách bạch khỏi khái niệm "vai trò phân công" hiện có.

*(Đặt tên field cụ thể sẽ chốt lúc code — đây là hướng, không phải quyết định cuối.)*

### 4.1b. Chỗ lưu 2 Drive folder theo Hạng mục

Đã kiểm tra `service_lines` (bảng Hạng mục) — hiện **chưa có cột lưu Drive folder nào** (chỉ có `property_address`, `property_certificate_number`, `property_metadata` jsonb…). Vì hướng (b) ở §3.4 cần 2 folder riêng theo từng Hạng mục, cần thêm 2 cột mới, ví dụ `survey_drive_folder_url` và `legal_drive_folder_url` trên `service_lines` (nullable, nhập tay lúc tạo Hạng mục hoặc lúc cần, không bắt buộc ngay từ đầu).

### 4.2. Bảng dữ liệu mới `legal_submissions`

Không phục hồi bảng `task_submissions` cũ (đã bị xoá có chủ đích cùng cả hệ mô hình cũ). Tạo bảng mới, khoá vào `task_nodes` thay vì `projects_tasks`:

| Cột đề xuất | Nguồn điền | Bắt buộc nhập tay? |
|---|---|---|
| `id` | tự sinh | — |
| `task_node_id` | Node vừa bấm "Bắt đầu làm" | Tự động |
| `contract_id`, `customer_id` | suy ra qua `task_node → workflow_instance → service_line → contract` | Tự động |
| `dossier_name` (Tên hồ sơ) | mặc định = tên khách hàng, **cho sửa tay** | Gợi ý, có thể sửa |
| `case_description` (Ghi chú/loại việc) | mặc định = tên/mô tả Node | Gợi ý, có thể sửa |
| `assigned_employee_id` (Phụ trách pháp lý) | từ `task_node_assignments` tại thời điểm bắt đầu | Tự động |
| `contact_phone` | `employees.phone` của nhân viên đang được phân công Node (đã xác nhận) | Tự động |
| `receipt_code` (Số biên nhận) | — | **Bắt buộc nhập tay, sau khi nộp thật** |
| `receipt_photo_url` | — | **Bắt buộc nhập tay** |
| `dossier_file_url` (Tệp hồ sơ) | Drive tổng hợp — xem hướng (a)/(b) ở §3.4, kế thừa minh chứng Đo vẽ + giấy tờ Pháp lý mới | Gợi ý tự động (theo hướng chọn ở §3.4), có thể bổ sung tay |
| `received_date` (Ngày nhận) | — | Nhập tay |
| `expected_return_date` (Ngày hẹn trả) | — | Nhập tay |
| `gov_status` (TÌNH TRẠNG) | mặc định khởi tạo = `Đang chi nhánh`; dropdown cố định 4 giá trị đã xác nhận (§2) | Đổi tay theo tiến độ |
| `is_first_submission` | `true` mặc định; hồ sơ bị trả/cần bổ sung thì tạo dòng mới với `false` + liên kết dòng trước | Tự động suy ra khi tạo dòng resubmit |
| `created_at`, `updated_at` | tự động | — |

Thiết kế `task_node_id` là 1-nhiều (1 Node có thể có nhiều dòng `legal_submissions` theo thời gian) để khớp đúng thực tế "Cần bổ sung → nộp lại" đang thấy trong sheet mẫu (nhiều mã biên nhận khác nhau cho cùng 1 khách), thay vì ép 1 Node = đúng 1 dòng.

### 4.3. Luồng tự động

```text
Node trước được nghiệm thu (accepted)
        │
        ▼
Node Pháp lý: pending → ready  (đã có sẵn cơ chế unlock trong review_task_node_acceptance)
        │
Nhân viên Pháp lý bấm "Bắt đầu làm"
        │
        ▼
start_task_node()  ← điểm nối thêm logic mới
        │
   Nếu Node có cờ requires_gov_submission = true:
        │
        ▼
   Tự tạo 1 dòng legal_submissions, điền sẵn mọi field "Tự động" ở bảng 4.2
   Số biên nhận / ảnh biên nhận / ngày nhận / ngày hẹn trả: để trống
        │
        ▼
Nhân viên Pháp lý mở dòng vừa sinh trong tab Hồ Sơ Pháp Lý → chỉ cần điền các ô còn trống sau khi đi nộp thực tế
```

Việc này tận dụng đúng hạ tầng đã có (không cần tạo cơ chế trigger riêng): `start_task_node` đã là 1 hàm transaction duy nhất, thêm 1 bước `INSERT` cùng transaction là an toàn, không cần thêm hàng đợi/event bus.

### 4.4. UI "1 bên hàng data, 1 bên chi tiết"

Đúng mô hình master-detail đã dùng ở trang Hợp Đồng (danh sách trái/khung phải, hoặc bảng + modal chi tiết) — tái dùng pattern/CSS đã có (`DataTable`, `Modal`, hoặc layout kiểu `contract-master-detail`) thay vì làm mới, để đồng bộ giao diện toàn hệ thống.

---

## 5. Câu hỏi cần bạn chốt trước khi code

Chỉ còn **2 câu hỏi mở**:

1. Ý nghĩa chính xác cột **"Tình trạng thanh (toán)"**?
2. Cột **"Hạng…"** bị cắt chữ — nội dung đầy đủ?

**Các câu đã được bạn trả lời:**

- ✅ **"Nhiều hồ sơ/Node?"** — Không xảy ra ở cấp Node. Nếu 1 Hợp đồng cần cả "chuyển mục đích" lẫn "cấp sổ", đó là **2 Hạng mục khác nhau** (mỗi Hạng mục = 1 quy trình/`workflow_instance` riêng, 1 hợp đồng có thể có nhiều Hạng mục) — không phải 1 Node phải xử lý nhiều hồ sơ cùng lúc. → Giữ nguyên thiết kế 1 Node = 1 hồ sơ (có thể nhiều **dòng** lịch sử nếu nộp lại, như đã nêu ở §4.2).
- ✅ **Node Pháp lý mẫu** — Đồng ý tạo Node mẫu trong Workflow Designer để có dữ liệu test (sẽ làm khi bắt đầu code).
- ✅ **Hướng Drive tổng hợp** — Chọn **(b)**: 2 folder riêng Đo vẽ/Pháp lý theo từng Hạng mục, tự liên kết khi Node Pháp lý bắt đầu (chi tiết ở §3.4).

---

## 6. Phạm vi việc nếu được duyệt (ước lượng, chưa làm)

- Migration Supabase: bảng `legal_submissions` mới + cột cờ Node + 2 cột Drive folder (`survey_drive_folder_url`, `legal_drive_folder_url`) trên `service_lines`.
- Backend: model, schema, service tạo dòng tự động trong `start_task_node` (kèm bước liên kết Drive Đo vẽ → Pháp lý), route CRUD mới thay `routes_legal_submissions.py` cũ (không phục hồi file cũ, viết lại theo mô hình Node).
- Frontend: sửa `LegalSubmissions.jsx` trỏ đúng API mới, thêm checkbox "Yêu cầu nộp cơ quan nhà nước" trong Node Inspector của `ContractWorkflowDesigner.jsx`, tạo 1 Node Pháp lý mẫu trong quy trình test.
- Không đụng tới `routes_tasks.py`/`Payroll.jsx` đã xoá — ngoài phạm vi yêu cầu này.

**Chưa code bất kỳ dòng nào ở trên — chờ bạn xác nhận mục 5 rồi mới bắt đầu.**
