# Phân tích nghiệp vụ: Tab Hồ Sơ Đo Vẽ — tự động tạo dòng từ Node quy trình

Ngày viết: **11/08/2026**
Supabase project: `ejklrwydjplwzztfuygj`
Trạng thái: **Chỉ phân tích — chưa code, chờ chốt các điểm ở mục 5**
Tài liệu liên quan: [LEGAL_SUBMISSIONS_AUTO_CREATE_ANALYSIS.md](./LEGAL_SUBMISSIONS_AUTO_CREATE_ANALYSIS.md)

---

## 1. Nghiệp vụ được mô tả (diễn giải lại để xác nhận)

> Tab **Hồ Sơ Đo Vẽ** hoạt động cùng cơ chế với tab Pháp lý đã làm: trong quy trình của một Hạng mục có **Node Đo vẽ**. Khi nhân viên đo vẽ bấm **"Bắt đầu làm"** trên Node đó, hệ thống **tự sinh 1 dòng** trong tab Hồ Sơ Đo Vẽ, điền sẵn mọi thông tin đã biết, hạn chế nhập tay.
>
> **Ràng buộc giao diện (mới, bắt buộc):** mọi chỉnh sửa phải đi qua **nút bấm** (mở form/panel sửa) — **không** cho sửa trực tiếp trên dòng dữ liệu (không dropdown/ô nhập nằm ngay trong bảng).

**Một chỗ cần bạn xác nhận:** trong yêu cầu bạn viết *"tự động tạo 1 dòng data trong tab pháp lý"*, nhưng toàn bộ ngữ cảnh đang nói về tab Đo vẽ. Tôi hiểu là **tạo dòng trong tab Đo vẽ** (Node Đo vẽ → hồ sơ đo vẽ), song song và độc lập với cơ chế Node Pháp lý → hồ sơ pháp lý đã có. Nếu sai, cần bạn chỉnh trước khi tôi code.

---

## 2. Đối chiếu 17 cột trong ảnh với dữ liệu hệ thống hiện có

| # | Cột trong ảnh | Ý nghĩa | Nguồn dữ liệu | Nhập tay? |
|---|---|---|---|---|
| 1 | Dấu thời gian | Thời điểm dòng được tạo | `now()` lúc bấm Bắt đầu làm | Tự động |
| 2 | Mã hợp đồng | VD `305/BK-2025` | `contracts.id` (qua task_node → workflow → service_line) | Tự động |
| 3 | Tên hồ sơ | Tên người/hồ sơ đứng tên | Mặc định = tên khách hàng, **cho sửa** | Gợi ý |
| 4 | **Pháp lý** | ✅ Hồ sơ đo vẽ này **có kèm phần pháp lý hay không** (§3.6) | **Suy ra được** từ các Hạng mục của cùng hợp đồng | Tự động |
| 5 | **Phường** | Đơn vị hành chính của thửa đất | ⚠️ **Chưa có trường riêng** — xem §3.3 | Cần bổ sung |
| 6 | Tên khách hàng | Khách ký hợp đồng | `customers.full_name` | Tự động |
| 7 | Số điện thoại liên hệ | ✅ **SĐT của KHÁCH HÀNG** (đã xác nhận) | `customers.phone` | Tự động |
| 8 | Phụ trách chính | Người chịu trách nhiệm chính | `task_node_assignments` role `MAIN` | Tự động |
| 9 | **Phụ đo** | Người phối hợp đo | `task_node_assignments` role `ASSISTANT` ("Phối hợp / phụ") | Tự động |
| 10 | **Độ ưu tiên** | Cao / Trung bình / Thấp | ⚠️ **Chưa có trong DB** | Cần bổ sung, sửa tay |
| 11 | **Trạng thái m…** | (bị cắt chữ) Trạng thái xử lý | `task_nodes.status` hoặc trạng thái riêng — xem mục 5 | ❓ |
| 12 | **Cảnh báo** | Trong hạn / Sắp đến hạn / Trễ hạn | **Nên TÍNH TOÁN**, không lưu — xem §4.3 | Tự động |
| 13 | Hạng mục công việc | VD "Tách thửa", "Xác định diện tích" | `service_lines.service_type` / `task_types.name` | Tự động |
| 14 | Ngày bắt đầu | Ngày khởi công | `task_nodes.started_at` (lúc bấm Bắt đầu làm) | Tự động |
| 15 | Hạn xử lý | ✅ **Tính = ngày bắt đầu + thời lượng sếp cấu hình** (§4.6) | `started_at` + `duration` | Tự động |
| 16 | Ngày nộp | ✅ **Ngày gửi nghiệm thu** (đã xác nhận) | `task_nodes.submitted_at` | Tự động |
| 17 | Ngày HT | Ngày hoàn thành (được duyệt) | `task_nodes.accepted_at` / `completed_at` | Tự động |

**Điểm đáng chú ý:** trong 17 cột thì **14 cột lấy tự động được** từ dữ liệu đã có (kể cả cột *Pháp lý* — suy ra từ gói dịch vụ, xem §3.6). Chỉ còn **3 cột** cần xử lý thêm: *Phường* (§3.3), *Độ ưu tiên* (§3.4), *Trạng thái* (chờ chốt). Đây là lý do dẫn tới đề xuất kiến trúc ở §4.1 — không nên copy dữ liệu ra bảng mới.

---

## 3. Hiện trạng đã kiểm tra

### 3.1. Trang "Hồ Sơ Đo Vẽ" hiện tại đã **chết**, y hệt trang Pháp lý trước đây

- `dev/frontend/src/pages/Tasks.jsx` đang gọi `/api/tasks/`, `/api/tasks/stats`, `/api/tasks/assignment-options`, `/api/tasks/contracts-lookup`, `/api/tasks/task-types`.
- Backend **không còn** `routes_tasks.py` (đã bị xoá trong đợt dọn mô hình cũ `projects_tasks`).
- → Bấm vào tab "Hồ Sơ Đo Vẽ" hiện tại chỉ ra lỗi tải dữ liệu. Cũng như tab Pháp lý, đây là **xây lại từ đầu**, không phải vá.

### 3.2. Vai trò phân công đã có sẵn, khớp đúng 2 cột trong bảng

`ASSIGNMENT_ROLES` hiện có: `MAIN` (Phụ trách chính), `ASSISTANT` (Phối hợp / phụ), `WRITER`, `SUBMITTER`, `REVIEWER`.
→ Cột **Phụ trách chính** = `MAIN`, cột **Phụ đo** = `ASSISTANT`. **Không cần thêm vai trò mới.**

### 3.3. Chưa có trường "Phường" — địa chỉ đang là văn bản tự do

Đã rà toàn bộ schema, chỉ có 3 trường địa chỉ, đều là text tự do:
- `contracts.service_location`
- `service_lines.property_address`
- `customers.address`

Không có bảng danh mục phường/xã, không có cột `ward`. Muốn **lọc theo Phường** (biểu tượng lọc trên cột trong ảnh cho thấy đây là cột dùng để lọc) thì phải có trường riêng, tách khỏi địa chỉ tự do — vì không thể lọc chính xác bằng cách dò chuỗi trong địa chỉ.

### 3.4. Chưa có "Độ ưu tiên" ở bất kỳ bảng nào

Không tồn tại cột priority/độ ưu tiên trong toàn bộ schema. Cần bổ sung.

### 3.5. ⚠️ Trang Pháp lý vừa làm đang **vi phạm** quy tắc "sửa bằng nút"

Trang `LegalSubmissions.jsx` tôi vừa dựng có **dropdown đổi Tình trạng ngay trên dòng dữ liệu** (`handleInlineStatusChange`) — đúng kiểu "bấm trên data sửa" mà bạn vừa yêu cầu bỏ.
→ Đề xuất: sửa luôn cho thống nhất 2 tab (bỏ dropdown inline, chỉ còn nút "Chi tiết" mở form sửa). Cần bạn duyệt vì đây là thay đổi ngoài phạm vi tab Đo vẽ.

### 3.6. Cột "Pháp lý" — cấu trúc 3 gói đã có sẵn trong DB ✅

Bạn xác nhận: cột này cho biết **dòng đo vẽ đó có kèm phần pháp lý hay không** — vì cùng một tên công việc có thể bán kèm pháp lý hoặc không.

Đã kiểm tra DB, cấu trúc này **đã tồn tại đầy đủ**, không cần tạo mới:

| Gói (`service_packages`) | Số Hạng mục | Danh sách |
|---|---:|---|
| `sp_001` **Đo Vẽ** | 9 | Đo hiện trạng · Cắm mốc · Xác định diện tích · Hoàn công **– phần đo vẽ** · Cấp đổi **– phần đo vẽ** · Hợp thửa **– phần đo vẽ** · Tách thửa **– phần đo vẽ** · Cấp sổ lần đầu **– phần đo vẽ** · Chuyển mục đích **– phần đo vẽ** |
| `sp_002` **Pháp Lý** | 10 | Hoàn công · Cấp đổi · Hợp thửa · Tách thửa · Cấp sổ lần đầu · Chuyển mục đích · Chuyển nhượng · Tặng cho · Thừa kế · Gia hạn đất nông nghiệp |
| `sp_003` **Xin Phép Xây Dựng** | 3 | Xin phép xây dựng mới · Sửa chữa, cải tạo · Gia hạn giấy phép xây dựng |

**Quy luật ghép cặp:** cùng tên gốc, gói Đo Vẽ có hậu tố `– phần đo vẽ`, gói Pháp Lý thì không.
VD: `Tách thửa – phần đo vẽ` (đo vẽ) ↔ `Tách thửa` (pháp lý).

**3 Hạng mục chỉ có ở gói Đo Vẽ** (Đo hiện trạng, Cắm mốc, Xác định diện tích) **không có** cặp pháp lý → cột này luôn là "Không".

→ **Kết luận: cột "Pháp lý" KHÔNG phải trường nhập tay**, mà suy ra được: *hợp đồng này có Hạng mục nào thuộc gói Pháp Lý không?* Đây là bằng chứng thêm cho hướng ở §4.1 — không copy dữ liệu, chỉ tính lúc đọc.

**✅ Đã chốt: suy ra theo HỢP ĐỒNG** — hợp đồng có bất kỳ Hạng mục nào thuộc gói Pháp Lý → cột này là "Có".

> ⚠️ **Hệ quả cần bạn biết trước:** bạn cũng lưu ý *"1 hợp đồng có thể có nhiều Hạng mục, mỗi Hạng mục có bộ hồ sơ riêng"*. Với cách suy theo hợp đồng, nếu hợp đồng gồm `Tách thửa – phần đo vẽ` (đo vẽ) **và** `Chuyển mục đích` (pháp lý) — hai việc **khác nhau** — thì dòng đo vẽ "Tách thửa" vẫn hiện **"Có pháp lý"**, dù bản thân nó không được mua kèm pháp lý.
> Nếu điều đó gây hiểu nhầm khi chia việc, giải pháp đúng là **thêm liên kết tường minh giữa 2 Hạng mục** (Hạng mục đo vẽ ↔ Hạng mục pháp lý tương ứng) thay vì dò theo tên — nên làm ở pha sau, không dựa vào quy ước đặt tên vì đổi tên là hỏng.

**Lưu trữ giấy tờ theo từng Hạng mục — thiết kế hiện tại đã đúng ✅**
Vì mỗi Hạng mục có bộ hồ sơ riêng, 2 cột Drive đã được đặt ở bảng `service_lines` (cấp Hạng mục), **không** đặt ở `contracts`:
`service_lines.survey_drive_folder_url` và `service_lines.legal_drive_folder_url`. Một hợp đồng nhiều Hạng mục sẽ có nhiều bộ thư mục độc lập, đúng như bạn mô tả.

### 3.7. ⭐ "Hỗ trợ nộp 350k" ≠ "Gói Pháp Lý" — hai thứ hoàn toàn khác nhau

Đây là điểm **quan trọng nhất** bạn vừa làm rõ, và nó ảnh hưởng ngược lại phần Pháp lý đã code:

> Gói **Đo Vẽ** có thể kèm **hỗ trợ nộp** — trả **350.000đ tiền công** cho nhân viên — nhưng **KHÔNG** kéo theo vòng đời hồ sơ (không biên nhận, không theo dõi tình trạng tại cơ quan).
> Chỉ gói **Pháp Lý** mới phải **theo dõi trọn vòng đời** hồ sơ.

**Đã kiểm tra DB — khoản 350k này đã tồn tại sẵn, không cần tạo mới:**

| `work_items` | Vai trò | Đơn giá | Trạng thái |
|---|---|---:|---|
| `wi_legal_submission_delivery` — **"Đi nộp hồ sơ"** | `SUBMITTER` | **350.000đ** | `published` |

Nghĩa là cơ chế đã có đủ: đánh dấu checklist là **payable** → gắn `work_item` này → khi Node được nghiệm thu, hệ thống tự sinh `work_pay_entitlements` 350k cho người giữ vai `SUBMITTER`. **Không cần code gì thêm cho phần tiền.**

#### Hệ quả bắt buộc phải tuân thủ

| Tình huống | Sinh dòng hồ sơ Pháp lý? | Trả 350k? | Theo dõi biên nhận / tình trạng CQNN? |
|---|---|---|---|
| Hạng mục gói **Pháp Lý** | ✅ Có | Theo cấu hình checklist | ✅ Có — trọn vòng đời |
| Hạng mục gói **Đo Vẽ** + hỗ trợ nộp | ❌ **Không** | ✅ 350k qua checklist payable | ❌ Không |
| Hạng mục gói **Đo Vẽ** thuần | ❌ Không | Không | ❌ Không |

> ⚠️ **Rủi ro đã nhận diện trong phần Pháp lý ĐÃ CODE:** cờ `requires_gov_submission` hiện là checkbox thủ công trong Workflow Designer. Nếu admin tick nhầm nó lên một Node thuộc gói **Đo Vẽ** có hỗ trợ nộp, hệ thống sẽ sinh ra hồ sơ pháp lý rỗng và bắt theo dõi biên nhận — **sai nghiệp vụ**.
> **Đề xuất chặn:** khi bấm "Bắt đầu làm", chỉ sinh hồ sơ pháp lý nếu Node đó **vừa có cờ, vừa thuộc Hạng mục của gói `sp_002` (Pháp Lý)**. Đây là ràng buộc ở tầng dữ liệu, không phụ thuộc người dùng tick đúng hay sai.

### 3.8. Cột "Trạng thái" — suy luận về giá trị **"Nộp thành công"**

Bạn cho biết 3 giá trị: **Hoàn thành · Huỷ · Nộp thành công**, và gợi ý rằng *"Nộp thành công"* có liên hệ với cột **Pháp lý có/không**. Dưới đây là lập luận của tôi.

**Vì sao "Nộp thành công" không thể là trạng thái dùng chung cho mọi dòng:** một Hạng mục đo vẽ thuần (VD *Đo hiện trạng*, *Cắm mốc*) thì **không có gì để nộp** cho cơ quan nhà nước — sản phẩm giao thẳng cho khách. Với những dòng đó, "Nộp thành công" là vô nghĩa. Nghĩa là trạng thái này chỉ xuất hiện khi hồ sơ **thực sự rời khỏi công ty để vào cơ quan nhà nước** — và điều đó chỉ xảy ra trong 2 tình huống, đúng như bạn gợi ý:

| Tình huống | Ai đi nộp | "Nộp thành công" nghĩa là | Sau đó |
|---|---|---|---|
| **Pháp lý = Không**, có **hỗ trợ nộp** (350k) | Chính nhân viên đo vẽ | Đã nộp xong tại cơ quan | **Kết thúc** — không theo dõi tiếp (§3.7) |
| **Pháp lý = Có** | Nhân viên pháp lý | Hồ sơ đã bàn giao và đã được nộp | Theo dõi tiếp ở **tab Pháp lý** (biên nhận, ngày hẹn trả…) |
| **Pháp lý = Không**, không hỗ trợ nộp | — | **Không bao giờ xuất hiện** | Kết thúc ở "Hoàn thành" |

**Điểm cần bạn phân xử:** với trường hợp **Pháp lý = Có**, dòng đo vẽ nên dừng ở trạng thái nào?

- **Cách 1 — "Hoàn thành" là đích của dòng đo vẽ.**
  Phòng Đo vẽ xong việc của mình (giao sản phẩm kỹ thuật cho pháp lý) là "Hoàn thành". Việc nộp và theo dõi cơ quan là của tab Pháp lý, không lặp lại ở đây.
  *Ưu:* mỗi tab chỉ chịu trách nhiệm phần việc của mình, không có dữ liệu trùng và không sợ hai tab lệch nhau.

- **Cách 2 — dòng đo vẽ phản chiếu tiến độ pháp lý.**
  Đo xong → "Nộp thành công" (khi pháp lý nộp) → "Hoàn thành" (khi có kết quả trả về).
  *Ưu:* nhìn tab Đo vẽ biết luôn số phận cuối cùng của hồ sơ.
  *Nhược:* trạng thái dòng đo vẽ bị điều khiển bởi phòng khác; phải đồng bộ 2 nơi, dễ lệch — đúng loại lỗi đã gặp nhiều lần trong dự án này.

**Khuyến nghị: Cách 1**, kèm cột "Pháp lý = Có" đóng vai trò chỉ đường ("hồ sơ này còn tiếp ở tab Pháp lý"). Muốn xem tiếp thì bấm sang. Như vậy vừa đủ thông tin, vừa không nhân bản trạng thái ở hai nơi.

**Câu hỏi phụ cần chốt:** "Huỷ" ở đây là **huỷ Hạng mục/hợp đồng** (khách bỏ ngang) hay **huỷ hồ sơ đã nộp** (rút về)? Bên tab Pháp lý đã có riêng giá trị *"Rút hồ sơ"*, nên cần phân biệt để không trùng nghĩa.

---

## 4. Hướng đề xuất

### 4.1. Kiến trúc dữ liệu — **không copy, chỉ bổ sung** (khác với tab Pháp lý)

Đây là khác biệt quan trọng so với `legal_submissions`, cần cân nhắc kỹ:

- Tab **Pháp lý** cần bảng riêng vì có nhiều dữ liệu **thật sự mới** không tồn tại ở đâu khác (số biên nhận, ảnh biên nhận, tình trạng tại cơ quan, ngày hẹn trả) và có thể **nhiều lần nộp cho cùng 1 Node**.
- Tab **Đo vẽ** thì ngược lại: 13/17 cột đã có sẵn trong `task_nodes` + `service_lines` + `contracts` + `customers`.

Nếu copy toàn bộ sang bảng mới, sẽ sinh lỗi kinh điển: khách đổi số điện thoại / admin đổi lịch / đổi người phụ trách → **bảng Đo vẽ vẫn hiện dữ liệu cũ**, hai nơi lệch nhau.

**Đề xuất: bảng `survey_records` chỉ giữ đúng phần dữ liệu KHÔNG có chỗ nào khác**, phần còn lại JOIN trực tiếp lúc đọc:

| Cột | Ghi chú |
|---|---|
| `id` | tự sinh |
| `task_node_id` | Node Đo vẽ vừa bắt đầu (unique — 1 Node = 1 hồ sơ đo vẽ) |
| `dossier_name` | Tên hồ sơ, mặc định = tên khách hàng, cho sửa |
| `ward` | Phường (§4.2) |
| `priority` | `HIGH` / `NORMAL` / `LOW`, mặc định `NORMAL` |
| `note` | Ghi chú nội bộ |
| `created_at`, `updated_at` | tự động |

Mọi cột còn lại (mã hợp đồng, khách hàng, SĐT, phụ trách, phụ đo, hạng mục, ngày bắt đầu, hạn xử lý, ngày nộp, ngày HT, trạng thái) → **đọc trực tiếp** từ `task_nodes`/`service_lines`/`contracts`/`customers`/`task_node_assignments`. Luôn khớp thực tế, không bao giờ lệch.

### 4.2. Trường "Phường" — dùng danh mục hành chính chuẩn ✅ (đã kiểm chứng)

**Đã tìm được nguồn dữ liệu chuẩn và test thật:** `https://provinces.open-api.vn/api/v2/`

Kết quả kiểm tra ngày 11/08/2026:

| Kiểm tra | Kết quả |
|---|---|
| Số đơn vị cấp tỉnh | **34** (đúng cơ cấu sau sáp nhập 01/07/2025) |
| Cấu trúc | **2 cấp**: Tỉnh/TP → Phường/Xã (**không còn cấp Quận/Huyện**) |
| TP.HCM | mã `79`, có **168** phường/xã |
| Đối chiếu với sheet của khách | Khớp chính xác: `26803 Phường Tam Bình`, `26809 Phường Hiệp Bình`, `26800 Phường Linh Xuân`, `26824 Phường Thủ Đức` |

Mỗi phường có **mã hành chính chính thức** (VD `26803`) — đây mới là thứ nên lưu vào DB, không phải chuỗi tên.

> ⚠️ **Lưu ý nghiệp vụ quan trọng:** từ 01/07/2025 cấp **Quận/Huyện đã bị bỏ**, "TP. Thủ Đức" không còn là đơn vị hành chính; các phường Tam Bình / Hiệp Bình / Linh Xuân giờ **trực thuộc thẳng TP.HCM**. Dữ liệu địa chỉ cũ trong `contracts.service_location` vẫn ghi theo cơ cấu cũ ("… TP. Thủ Đức"), nên khi đối chiếu/di trú phải xử lý riêng, không map máy móc.

#### Kế hoạch triển khai — **nạp 1 lần vào DB, không gọi API lúc chạy**

Không nên gọi API bên thứ ba mỗi lần mở form, vì:
1. Mất mạng hoặc API chết → **không nhập được địa chỉ**, chặn cả nghiệp vụ.
2. Dữ liệu hành chính **gần như tĩnh** — chỉ đổi khi có nghị quyết, vài năm một lần. Gọi liên tục là lãng phí.
3. Cần **mã ổn định lưu trong DB** để lọc, thống kê, join — phụ thuộc API ngoài thì không đảm bảo.
4. Hệ đang chạy trong Docker, cần hoạt động độc lập.

Các bước:

| Bước | Việc |
|---|---|
| 1 | Tạo bảng `wards`: `code` (khoá chính, mã chính thức), `name`, `province_code`, `province_name`, `division_type`, `is_active`, `synced_at` |
| 2 | Script nạp 1 lần từ API v2 → ghi vào bảng (chạy lại thủ công khi có thay đổi địa giới) |
| 3 | `survey_records.ward_code` tham chiếu `wards.code` — lưu **mã**, không lưu chữ |
| 4 | Giao diện: ô chọn có **tìm kiếm gõ tên** (168 phường riêng TP.HCM, quá nhiều để cuộn tay) |
| 5 | Mặc định lọc theo tỉnh/TP công ty đang làm việc, cho phép mở rộng khi cần |

**✅ Đã chốt: công ty làm chủ yếu ở TP.HCM.**
→ Mặc định lọc theo TP.HCM (mã `79`, **168 phường/xã**) cho gọn khi nhập.
→ Vẫn **nạp đủ danh mục toàn quốc** vào bảng `wards` và để một tuỳ chọn "xem tỉnh/thành khác", vì "chủ yếu" không phải "chỉ" — lỡ có hồ sơ ở tỉnh khác thì vẫn nhập được, không phải sửa code.

### 4.3. Cột "Cảnh báo" — tính toán, **không lưu vào DB**

Cảnh báo phụ thuộc thời gian hiện tại so với `hạn xử lý`:
- Đã hoàn thành → *Hoàn thành*
- Còn > 2 ngày → *Trong hạn*
- Còn ≤ 2 ngày → *Sắp đến hạn*
- Quá hạn → *Trễ hạn*

Nếu lưu vào DB, giá trị sẽ **chết cứng** tại thời điểm ghi và sai ngay hôm sau, trừ khi có job chạy nền cập nhật liên tục — phức tạp không cần thiết. Tính lúc đọc là chính xác tuyệt đối và miễn phí.
*(Ngưỡng "2 ngày" là đề xuất, cần bạn chốt ở mục 5.)*

### 4.4. Cờ đánh dấu Node Đo vẽ

Tương tự `requires_gov_submission` đã làm cho Pháp lý, thêm cờ riêng trong graph JSON của Node — ví dụ `creates_survey_record` — kèm 1 checkbox trong Node Inspector của Workflow Designer.

**Không** suy luận tự động qua phòng ban của người được phân công, vì người phụ trách có thể đổi hoặc thuộc phòng khác, trong khi bản chất Node vẫn là bước đo vẽ.

### 4.5. Giao diện — đúng quy tắc "sửa bằng nút"

- Bảng danh sách: **chỉ hiển thị**, không có ô nhập/dropdown nào trong dòng.
- Mỗi dòng có nút **"Chi tiết"** → mở panel/modal, trong đó có nút **"Sửa"** → chuyển sang chế độ nhập → **"Lưu" / "Huỷ"**.
- Áp dụng đúng khuôn mẫu master–detail + bố cục cố định (thanh công cụ trên, bảng cuộn giữa, phân trang dưới) đã dùng ở trang Hợp đồng và Pháp lý, để đồng bộ toàn hệ thống.

---

### 4.6. ⭐ Hạn xử lý — sếp cấu hình **thời lượng**, không chọn ngày cố định

Bạn xác nhận: *"ngày hết hạn sẽ do sếp setup, nghĩa là chọn bao nhiêu ngày kể từ ngày bắt đầu, có cho set giờ nữa"*.

**Khác với cách hiện tại:** hiện admin phải chọn **mốc ngày giờ tuyệt đối** cho `planned_start` / `planned_end` trong tab Phân công. Cách đó có nhược điểm thật: không ai biết trước nhân viên sẽ bấm "Bắt đầu làm" lúc nào, nên hạn đặt sẵn thường lệch — đúng như thực tế đang thấy (lịch xếp 25/08 nhưng việc bắt đầu ngày khác).

**Cách mới:**

```text
Sếp cấu hình cho Node:  thời lượng = 3 ngày 4 giờ
                                  ↓
Nhân viên bấm "Bắt đầu làm"  →  started_at = 11/08 09:00
                                  ↓
Hạn xử lý tự tính           =  14/08 13:00
```

- Lưu **thời lượng** (số ngày + số giờ) trong graph JSON của Node — cùng chỗ với `evidence_required`, để mỗi Hạng mục/quy trình có mức hạn riêng.
- Khi `start_task_node` chạy: `planned_end = started_at + thời lượng`, ghi vào `task_nodes.planned_end`.
- Node chưa bắt đầu thì **chưa có hạn** — đúng bản chất, thay vì hiện một hạn ảo đã trôi qua.

Cần bạn chốt ở mục 5: thời lượng tính theo **ngày làm việc** (bỏ T7/CN) hay **ngày tự nhiên**? Nghiệp vụ đo đạc/nộp hồ sơ nhà nước thường tính ngày làm việc, nhưng cần bạn xác nhận vì nó đổi hẳn công thức.

### 4.7. Chia tab theo phòng ban + tab tổng hợp cho giám đốc

**Đánh giá: hướng đúng** — khớp thực tế (2 phòng đang giữ 2 sheet riêng), giảm nhiễu cho nhân viên. Nhưng có 2 điểm nên làm khác cách hiểu ban đầu.

#### (1) Tab tổng hợp **không nên** là phép ghép 2 bảng

Hai tab có bộ cột **khác hẳn nhau**: Đo vẽ có *Phụ đo, Độ ưu tiên, Phường, Cảnh báo*; Pháp lý có *Số biên nhận, Tình trạng CQNN, Ngày hẹn trả, Ảnh biên nhận*. Ghép lại sẽ ra bảng khổng lồ nửa trống nửa đầy, và phải nuôi **3 trang** thay vì 2 — mỗi lần sửa lỗi phải sửa 3 nơi.

**Đề xuất: tab giám đốc là view theo HẠNG MỤC — mỗi dòng là một đường ống.**

```text
Hạng mục                 │ Đo vẽ         │ Pháp lý           │ Cảnh báo
─────────────────────────┼───────────────┼───────────────────┼────────────
305/BK-2025 · Tách thửa  │ ✅ Hoàn thành │ ⏳ Đang chi nhánh │ Trong hạn
310/BK-2025 · Cấp đổi    │ ⏳ Đang đo    │ — (không mua)     │ Sắp đến hạn
312/BK-2025 · Cắm mốc    │ ✅ Hoàn thành │ — (không có)      │ Xong
```

Đây mới trả lời đúng câu hỏi của giám đốc: *"hồ sơ này đang nằm ở khâu nào?"* — thay vì bắt đọc 2 bảng rồi tự ghép trong đầu. Bấm vào một ô là mở chi tiết khâu đó.

#### (2) ⚠️ Phân quyền hiện tại **chưa hề tách** 2 phòng — phải chặn ở server, không phải ẩn tab

Đã kiểm tra bảng `role_permissions`: `survey_staff` và `legal_staff` đang có quyền **giống hệt nhau** trên cả 7 tài nguyên (`contract`, `hoso`, `task_node`, `checklist`, `evidence`, `workflow`, `payroll`) — không có gì phân biệt 2 phòng.

Nghiêm trọng hơn, route `/api/legal-submissions/` tôi vừa viết **chỉ kiểm tra đã đăng nhập**, không lọc theo phòng ban:

```python
def list_legal_submissions(..., user: User = Depends(get_current_user)):   # không lọc gì
```

→ Hiện tại **bất kỳ ai đăng nhập cũng đọc được toàn bộ hồ sơ pháp lý**, kể cả nhân viên đo vẽ. Ẩn tab ở giao diện **không phải phân quyền** — ai biết đường dẫn API vẫn lấy được dữ liệu.

**Phải làm:** thêm resource `legal_submission` / `survey_record` vào `role_permissions`, và **lọc ngay trong câu truy vấn** theo phòng ban người đăng nhập; giám đốc/admin thì không lọc.

Cần bạn chốt mức nhìn thấy của nhân viên:
- **(a) Theo phòng ban** — nhân viên đo vẽ thấy mọi hồ sơ đo vẽ (kể cả của đồng nghiệp) để phối hợp, bàn giao, hỗ trợ nhau. *Khuyến nghị* — công ty nhỏ, cần nhìn nhau mà chạy việc.
- **(b) Chỉ việc của mình** — chặt hơn nhưng vướng khi thay người hoặc cần hỗ trợ chéo.

### 4.8. Menu theo vai trò + lịch toàn phòng cho giám đốc + avatar trên timetable

Bạn mô tả: mỗi nhân viên có sơ đồ công việc riêng không chồng chéo, có **tab Lương** và **tab Đo vẽ hoặc Pháp lý** theo phòng của mình; giám đốc xem được lịch **toàn bộ** nhân viên; mọi dòng công việc trên timetable đều có **avatar nhỏ** của người đang làm.

**Trả lời: làm được.** Hiện trạng từng mảnh:

| Mảnh | Hiện trạng | Việc phải làm |
|---|---|---|
| **Avatar trên công việc** | ✅ **Đã có** — node quy trình đã hiện avatar thật (hoặc chữ cái đầu), rê chuột ra tên + vai trò + lịch | Áp dụng thêm cho ô sự kiện trên timetable |
| **Lịch cá nhân nhân viên** | ✅ Đã có, lọc đúng theo `employee_id` người đăng nhập | — |
| **Lịch toàn bộ nhân viên (giám đốc)** | ❌ **Chưa có API nào** | Viết mới: bỏ điều kiện lọc theo 1 người, kèm thông tin nhân viên |
| **Tab Lương** | ⚠️ Trang `Payroll.jsx` và `routes_payroll.py` **đã bị xoá** (cùng đợt dọn với Tasks/Legal) — nhưng **dữ liệu lương của nhân viên vẫn còn**, đã tính sẵn trong `employee_portal` (`latest_payroll`) | Dựng lại trang, tận dụng dữ liệu có sẵn |
| **Menu theo vai trò** | ⚠️ Chế độ nhân viên hiện chỉ có **1 mục** "Không gian nhân viên" | Tách thành: Tổng quan · [Đo vẽ \| Pháp lý] · Lương, chọn theo `employees.department_id` |

#### ⚠️ Ràng buộc kỹ thuật cần biết trước: lịch nhiều người

Thư viện lịch đang dùng là FullCalendar, và dự án chỉ cài 3 gói **miễn phí**: `core`, `react`, `timegrid`.

Kiểu hiển thị "mỗi nhân viên một làn riêng nằm cạnh nhau" (resource timeline — giống bảng phân ca) là **tính năng trả phí** của FullCalendar (`@fullcalendar/resource-*`), **không có** trong bản đang dùng.

→ Nghĩa là **cách bạn đề xuất lại chính là giải pháp đúng và miễn phí**: vẫn dùng lưới tuần hiện có, nhưng mỗi ô công việc gắn **avatar + màu riêng theo người**. Kèm thêm bộ lọc chọn nhân viên để giám đốc soi từng người khi cần.

```text
Thứ 3 · 12/08
┌──────────────────────────────┐
│ (TV) Nộp hồ sơ · 305/BK-2025 │   ← avatar Tường Vy, viền màu của cô ấy
│ 09:00 – 11:00                │
├──────────────────────────────┤
│ (NA) Khảo sát · 310/BK-2025  │   ← avatar Nguyễn Văn A, màu khác
│ 09:30 – 12:00                │
└──────────────────────────────┘
```

*Lưu ý nhỏ:* trong lịch **cá nhân** thì avatar luôn là chính người đó nên hơi thừa — avatar chỉ thật sự có giá trị ở **lịch giám đốc** (nhiều người trộn nhau). Đề xuất: bật avatar ở lịch giám đốc, còn lịch cá nhân giữ nguyên cho thoáng.

---

## 5. Cần bạn chốt trước khi code

1. ~~**Cột "Pháp lý"** nghĩa là gì? Suy ra thế nào?~~
   → ✅ **Đã chốt: có kèm phần pháp lý hay không, suy ra THEO HỢP ĐỒNG** (§3.6). Không nhập tay.
2. ~~**Cột "Trạng thái"** — danh sách giá trị?~~
   → ✅ **Đã chốt 3 giá trị: Hoàn thành · Huỷ · Nộp thành công** (§3.8).
   → ✅ **"Huỷ" = huỷ, không làm nữa** (không phải rút hồ sơ đã nộp). **"Hoàn thành" = đã đo vẽ xong.**
   → ❓ **Còn 1 điểm (§3.8):** khi *Pháp lý = Có*, dòng đo vẽ dừng ở "Hoàn thành" *(khuyến nghị)* hay phản chiếu tiếp tiến độ pháp lý?
3. ~~**Cột "Số Điện Thoại Li…"** — là SĐT khách hàng hay nhân viên phụ trách?~~
   → ✅ **Đã chốt: SĐT của KHÁCH HÀNG**, lấy từ `customers.phone`.
   > ⚠️ **Khác với tab Pháp lý** — bên đó cột SĐT là **của nhân viên** phụ trách (in trên biên nhận để cơ quan liên hệ). Hai tab dùng hai nguồn khác nhau, tuyệt đối không gom chung một hàm.
4. ~~**Phường** — gõ tự do hay danh mục? Làm ở tỉnh nào?~~
   → ✅ **Đã chốt: danh mục chuẩn** nạp từ `provinces.open-api.vn/api/v2` vào bảng `wards`; **mặc định TP.HCM** (168 phường/xã), vẫn nạp đủ toàn quốc để dự phòng (§4.2).
5. **Ngưỡng cảnh báo** — "Sắp đến hạn" tính trước hạn bao nhiêu ngày? (đề xuất 2 ngày)
6. ~~**Xác nhận** hiểu đúng ở mục 1: Node **Đo vẽ** sinh hồ sơ **Đo vẽ**?~~
   → ✅ **Đã xác nhận đúng.** Node Đo vẽ sinh hồ sơ trong tab Đo vẽ, độc lập với nhánh Pháp lý.
7. ~~**Có sửa luôn trang Pháp lý** để bỏ dropdown sửa trực tiếp trên dòng (§3.5) cho đồng bộ quy tắc không?~~
   → ✅ **Đã chốt: CÓ.** Đã thực hiện ngày 11/08/2026 — bỏ dropdown inline, cột Tình trạng chuyển thành nhãn chỉ đọc; sửa qua nút "Chi tiết" → "Sửa" → "Lưu / Huỷ". Xem §4.5.
8. ~~**Hỗ trợ nộp 350k** và **vòng đời hồ sơ** quan hệ thế nào?~~
   → ✅ **Đã chốt (§3.7):** gói Đo Vẽ + hỗ trợ nộp = **chỉ trả 350k**, KHÔNG theo dõi vòng đời. Chỉ gói Pháp Lý mới theo dõi trọn vòng đời. `work_item` 350k đã có sẵn (`wi_legal_submission_delivery`).
9. ~~**Hạn xử lý** lấy từ đâu?~~
   → ✅ **Đã chốt (§4.6):** sếp cấu hình **thời lượng** (số ngày + giờ); hạn = ngày bắt đầu + thời lượng, tính lúc nhân viên bấm "Bắt đầu làm".
   → ❓ **Còn cần chốt:** thời lượng tính theo **ngày làm việc** (trừ T7/CN) hay **ngày tự nhiên**?
10. ~~**Ngày nộp** là ngày nào?~~
   → ✅ **Đã chốt:** ngày **gửi nghiệm thu** (`submitted_at`).

### Tóm lại — còn 4 điểm chưa chốt

| # | Điểm | Đề xuất của tôi |
|---|---|---|
| 1 | Khi **Pháp lý = Có**, dòng đo vẽ dừng ở đâu? (§3.8) | Dừng ở "Hoàn thành"; cột Pháp lý chỉ đường sang tab Pháp lý |
| 2 | Thời lượng tính theo **ngày làm việc** hay **ngày tự nhiên**? (§4.6) | — |
| 3 | Ngưỡng **"Sắp đến hạn"** | 2 ngày trước hạn |
| 4 | Nhân viên thấy **cả phòng** hay **chỉ việc của mình**? (§4.7) | Theo phòng ban — dễ phối hợp, bàn giao |
| 5 | Tab giám đốc làm theo **view đường ống theo Hạng mục** hay ghép 2 bảng? (§4.7) | View đường ống — tránh nuôi 3 trang |
| 6 | **Tab Lương** dựng lại luôn trong đợt này hay để pha sau? (§4.8) | Để pha sau — đợt này đã khá lớn |
| 7 | **Lịch giám đốc** làm trong đợt này hay pha sau? (§4.8) | Pha sau, sau khi tab Đo vẽ chạy ổn |

---

## 6. Phạm vi việc nếu được duyệt (chưa làm)

- **Migration**: bảng `survey_records` + bảng `wards` (kèm script nạp danh mục hành chính 1 lần).
- **Backend**: sinh dòng tự động trong `start_task_node` (nối thêm cạnh nhánh Pháp lý đã có), tính `planned_end` từ thời lượng (§4.6), route CRUD `/api/survey-records` viết mới thay `routes_tasks.py` cũ đã xoá.
- **Frontend**: viết lại `Tasks.jsx` theo mẫu master–detail + sửa-bằng-nút; thêm checkbox cờ Node Đo vẽ + ô nhập thời lượng trong `ContractWorkflowDesigner.jsx`.
- **Sửa lại phần Pháp lý đã code (§3.7)**: chặn sinh hồ sơ pháp lý nếu Node không thuộc Hạng mục gói `sp_002`, tránh gói Đo Vẽ + hỗ trợ nộp bị kéo vào vòng đời hồ sơ sai nghiệp vụ.
- ~~**Tuỳ chọn**: bỏ inline-edit ở `LegalSubmissions.jsx`~~ → ✅ đã làm.

**Chưa code bất kỳ dòng nào — chờ bạn trả lời mục 5.**
