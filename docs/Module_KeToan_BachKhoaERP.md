# ĐẶC TẢ MODULE KẾ TOÁN (TÀI CHÍNH - CÔNG NỢ - LƯƠNG KHOÁN)
**Dự án:** Bách Khoa ERP  
**Phân hệ:** Kế toán & Quản trị Tài chính nội bộ  
**Phiên bản:** 3.4 (Cập nhật chuẩn quyền phê duyệt tập trung cho Giám đốc — 2026-08-14)

> **Nguồn tham chiếu:** Đặc tả kỹ thuật này được đối chiếu đồng thời với:
> - Supabase DB thực tế (project: `ejklrwydjplwzztfuygj`)
> - Codebase thực tế (`contracts/workflow_runtime.py`, `routes_contracts.py`, `routes_employee_portal.py`, `finance/services.py`)
> - Google Sheets khảo sát nghiệp vụ "Cau_Hoi_Khao_Sat_BachKhoa_ERP" (Câu 13a, 21; Bảng Cụm công việc & khoán)
> - Yêu cầu nghiệp vụ khách hàng: **Mọi quyết định, phê duyệt trong hệ thống đều do Giám đốc (`admin`) duyệt; cấp dưới (Kế toán, Đo vẽ, Pháp lý, Sales) chỉ tạo, nộp yêu cầu, minh chứng và lập dự thảo.**
>
> **Ký hiệu:** ✅ Đã khớp DB | 🔨 DB cần migration/update | ⚙️ Cần xử lý trong code logic

---

## 1. MỤC TIÊU MODULE

Module Kế toán trên Bách Khoa ERP được thiết kế nhằm số hóa toàn bộ quy trình quản lý thu chi, theo dõi công nợ khách hàng và tự động hóa việc tính lương khoán cho nhân sự dựa trên tiến độ thực tế của các "Cụm công việc". Hệ thống giúp loại bỏ sai sót từ việc tính toán thủ công trên Excel/Google Sheets, đảm bảo minh bạch tài chính, chống thất thoát và quản lý chính xác hiệu quả lợi nhuận trên từng hợp đồng.

---

## 2. QUẢN LÝ DOANH THU, THANH TOÁN & CÔNG NỢ HỢP ĐỒNG

### 2.1. Cơ chế thanh toán theo đợt & Luồng duyệt Thu/Chi ✅

- Hỗ trợ ghi nhận một hợp đồng có thể thanh toán 1 lần hoặc chia làm nhiều đợt.
- **Các trường dữ liệu bắt buộc cho mỗi đợt thanh toán:**
  - Số tiền phải thu.
  - Hạn thanh toán (Ngày đến hạn) — field `due_date` trên bảng `receivables`.
  - Số tiền thực thu — field `paid_amount`.
  - Phương thức thanh toán (Tiền mặt / Chuyển khoản) — field `payment_method` trên `cashflow_transactions`.
  - Tài khoản / Quỹ nhận tiền — field `scope` (cash / bank).
  - File đính kèm — field `receipt_attachment_url` (hóa đơn, UNC, bill chuyển khoản).
  - Người tạo phiếu — field `created_by_user_id` (Kế toán lập phiếu).

> **Quy trình phê duyệt Phiếu thu & Phiếu chi (Approval Flow):**
> 
> Phiếu thu/chi được lưu tại bảng `cashflow_transactions`. Quyền phê duyệt tuyệt đối thuộc về **Giám đốc (`admin`)**:
>
> 1. **Kế toán** (`accountant`) thực hiện lập phiếu thu hoặc phiếu chi, đính kèm chứng từ/minh chứng $\rightarrow$ phiếu ở trạng thái `pending` (Chờ duyệt).
> 2. **Giám đốc** (`admin`) kiểm tra chứng từ trên hệ thống và duyệt:
>    - **Duyệt (`approved`)**: Phiếu chính thức có hiệu lực, cập nhật số dư quỹ tiền mặt/ngân hàng và đồng bộ công nợ hợp đồng (`_sync_receivables`).
>    - **Từ chối / Hủy (`cancelled`)**: Bắt buộc nhập `cancellation_reason`. Phiếu không phát sinh dòng tiền.
> 3. Phiếu ở trạng thái `pending` hoặc `cancelled` **tuyệt đối không được tính** vào số tiền thực thu/thực chi và không làm thay đổi công nợ.

### 2.2. Tự động hóa Trạng thái Công nợ 🔨

Hệ thống tính toán động trạng thái công nợ dựa trên dữ liệu bảng `receivables` (`paid_amount`, `remaining_amount`, `due_date`). Trạng thái **không lưu cứng** vào DB — tính tại tầng Read Model (`contracts/read_model.py`). Không cho phép nhân viên tự chỉnh sửa.

**6 trạng thái công nợ chuẩn:**

| Mã trạng thái | Tên hiển thị | Điều kiện tính toán |
|---|---|---|
| `not_started` | Chưa thu | `paid_amount = 0` VÀ `due_date >= ngày hiện tại` |
| `partial` | Thu một phần | `0 < paid_amount < total_value` VÀ `due_date >= ngày hiện tại` |
| `settled` | Đã thu đủ | `paid_amount >= total_value` (hoặc nợ đã chuyển sang HĐ khác) |
| `overdue` | Quá hạn | Còn nợ (`paid < total`) VÀ `due_date < ngày hiện tại` |
| `written_off` | Xóa nợ / Miễn giảm | Giám đốc duyệt xóa nợ còn lại (xem §2.2.1) |
| `refunded` | Hoàn tiền | Hợp đồng bị hủy / khách đòi lại cọc |

> **Cơ chế Scheduler cho trạng thái `overdue`:** ✅
> - **Thời gian chạy:** Mỗi ngày lúc **00:05 (giờ Việt Nam)**.
> - **Logic:** Hợp đồng đang `not_started` hoặc `partial` $\rightarrow$ nếu `due_date < hôm nay` $\rightarrow$ chuyển sang `overdue`.
> - **Thông báo:** Gửi cho `accountant` và `sales` phụ trách.
> - **Cảnh báo sớm:** Trước **3 ngày** đến hạn $\rightarrow$ gửi cảnh báo cho `sales` phụ trách.

#### 2.2.1. Kiểm soát Bàn giao tại Node K08 & Ngoại lệ duyệt của Giám đốc

> **Bối cảnh thực tế:** Điểm kiểm soát của Cụm K08 ("Nhận kết quả và Bàn giao") quy định: *"Chỉ hoàn thành khi đủ file, bàn giao và đạt điều kiện công nợ"*. Để tránh rủi ro mất tiền (mất "con tin" là sổ đỏ/bản vẽ), hệ thống kiểm soát cứng việc hoàn thành K08 và xuất biên bản bàn giao.

**1. Mặc định: CHẶN CỨNG tại Node K08 khi còn nợ (`debt > 0`)**
- Khi Kế toán chưa xác nhận hợp đồng đã thu đủ 100% (`paid_amount < total_value`):
  - **Node K08 bị KHOÁ** (nút "Hoàn thành K08" bị disable / mờ).
  - Hệ thống **CHẶN tuyệt đối** việc in/xuất Biên bản bàn giao có mã QR / chữ ký số công ty.
  - Trạng thái Hợp đồng trong DB giữ nguyên `in_progress` (Chưa hoàn thành).
  - **Node K09 (Lưu trữ / Scan Drive):** Nhân viên vẫn thực hiện scan file, lưu Drive bình thường (Node K09 sáng và Pass để ghi nhận xong công việc kỹ thuật).

**2. Luồng ngoại lệ: Giám đốc duyệt "Yêu cầu xuất bàn giao nợ"**
- Với khách VIP/khách quen được nợ: Nhân viên gửi *"Yêu cầu xuất bàn giao nợ"*.
- **Giám đốc (`admin`)** mở Modal xác nhận nhạy cảm $\rightarrow$ nhập lý do cam kết $\rightarrow$ bấm **"Duyệt cho nợ & Bàn giao"**.
- Khi duyệt ngoại lệ:
  - Node K08 được mở khóa, cho phép in Biên bản bàn giao.
  - Trạng thái Hợp đồng chuyển thành `completed` (Hoàn thành) trong DB, cờ `completion_override = true`.
  - Khoản nợ còn lại giữ nguyên trên sổ nợ để Kế toán tiếp tục theo dõi thu hồi.

**3. Các kịch bản xóa nợ / chuyển nợ:**
- **Xóa nợ / Miễn giảm (`written_off`):** Giám đốc duyệt xóa nợ qua Modal $\rightarrow$ trạng thái công nợ sang `written_off`, P&L hạch toán mục "Nợ xấu / Xóa nợ".
- **Chuyển nợ HĐ cũ sang HĐ mới (`carried_forward`):** Giám đốc duyệt gộp nợ $\rightarrow$ HĐ cũ chuyển `settled`, HĐ mới cộng thêm nợ.

#### 2.2.2. Quy tắc thiết kế: Modal Xác nhận Thao tác Nhạy cảm (Sensitive Action Modal)

> **Nguyên tắc ERP chống thất thoát:** Mọi thao tác ảnh hưởng đến tài chính, công nợ, phân quyền lead, hoặc chốt sổ **BẮT BUỘC** hiển thị Modal xác nhận 2 bước:

1. **Hiển thị cảnh báo rủi ro màu đỏ/cam** (VD: *"Bạn đang duyệt cho nợ 15.000.000đ với hợp đồng HD-0012"*).
2. **Bắt buộc nhập Lý do (Reason)** — nút "Xác thực" bị mờ nếu chưa nhập lý do.
3. **Ghi Audit Log tức thì:** Lưu `actor_id`, `action`, `payload` (lý do + số tiền) vào bảng `audit_log` không thể chỉnh sửa.

Các thao tác bắt buộc dùng Modal:
- Duyệt phiếu chi (Giám đốc)
- Duyệt tạm ứng (Giám đốc)
- Duyệt cho nợ bàn giao tại K08 (Giám đốc)
- Xóa nợ / Miễn giảm công nợ (Giám đốc)
- Chốt bảng lương tháng (Giám đốc)

### 2.3. Quản lý hạng mục "Không phát sinh chi phí" ✅

- Đối với các dịch vụ đi kèm hoặc hỗ trợ thêm không thu tiền khách hàng (VD: Hỗ trợ nộp hồ sơ K06 kèm gói Đo vẽ).
- **Quy tắc ERP:** Sử dụng Checkbox/Cờ đánh dấu `"Đã bao gồm trong gói/Không tính tiền"`.
- **Tuyệt đối không:** Nhập giá trị `1 đồng` (như hệ thống cũ) để tránh làm sai lệch báo cáo doanh thu thực tế và báo cáo thuế.

### 2.4. Phân loại Khách hàng & Chiết khấu ✅

- Phân định rõ 3 khái niệm: **Nhóm khách hàng**, **Khách hàng cụ thể** (người đứng tên HĐ), và **Tên hồ sơ** (Chủ sử dụng đất).
- **Cơ chế Chiết khấu tự động:**
  - **Căn cứ:** Tính trên **giá trị hợp đồng chưa VAT** (giá gốc trước thuế).
  - **Quyền override:** Chỉ `admin` (Giám đốc) được phép thay đổi tỷ lệ chiết khấu ngoài chính sách $\rightarrow$ ghi Audit Log.
  - **Thứ tự ưu tiên:** Chiết khấu override từng HĐ > Chiết khấu theo Nhóm KH > Mặc định 0%.

### 2.5. Xử lý VAT & Thuế ✅

- **Thuế suất động:** Cấu hình linh hoạt khi tạo hợp đồng — field `vat_rate` trên bảng `contracts` (gợi ý 10%, 8%). Hỗ trợ `vat_policy = 'exempt'` (Miễn VAT).
- Hiển thị rõ: `Giá trị chưa VAT`, `Giá trị VAT`, `Tổng giá trị (đã VAT)`.
- **Báo cáo thuế:** Xuất dữ liệu kê khai VAT tháng/quý để đối chiếu với MISA SME (mẫu 01/GTGT).

### 2.6. Quản lý Tạm ứng & Chi phí phát sinh 🔨

> **Lưu ý thiết kế:** Tuyệt đối không dùng từ ngữ nhạy cảm. Các chi phí được mô hình hóa bằng ngôn ngữ kế toán quản trị.

- **Phân loại nhóm chi phí** (field `category_code` trên `cashflow_transactions`):
  - `Lệ phí nhà nước` — có biên lai/hóa đơn đỏ, flag `is_pass_through_fee = true`.
  - `Chi phí ngoại giao / Tiếp khách` — chi linh hoạt quan hệ/đẩy nhanh tiến độ.
  - `Chi phí dịch vụ xử lý nhanh`.
  - `Chi phí đi lại / Công tác phí`.

- **Quy trình Tạm ứng (Nhân viên đề xuất $\rightarrow$ Giám đốc duyệt $\rightarrow$ Kế toán chi tiền):**
  1. **Nhân viên** (`survey_staff` / `legal_staff`) tạo *Yêu cầu tạm ứng*, gắn vào **Mã hồ sơ** (`contract_id`). Chọn loại chi phí, nhập số tiền, ghi chú lý do $\rightarrow$ trạng thái `pending`.
  2. **Giám đốc** (`admin`) xem xét, đánh giá tính cần thiết và **Duyệt chi** qua Modal xác nhận.
  3. **Kế toán** (`accountant`) thực hiện xuất quỹ chi tiền theo đúng phê duyệt của Giám đốc $\rightarrow$ cập nhật `approved`.

- **Quy trình Hoàn ứng & Ghi nhận:**
  - `Lệ phí nhà nước`: Bắt buộc đính kèm ảnh chụp biên lai/hóa đơn (`receipt_attachment_url`).
  - `Chi phí ngoại giao`: Cần giấy đề nghị thanh toán nội bộ (Giám đốc ký). Hạch toán vào sổ quản trị nội bộ để theo dõi Cashflow thực tế.

- **Báo cáo P&L theo Hợp đồng:**
  - **Lợi nhuận gộp hồ sơ** = [Tổng tiền thu] − [Lương khoán] − [Lệ phí nhà nước] − [Chi phí ngoại giao/phát sinh khác].

---

## 3. CƠ CHẾ TÍNH LƯƠNG KHOÁN & KPI NHÂN SỰ

### 3.1. Công thức tính lương tháng ✅

> **Lương nhận cuối tháng** = [Lương cơ bản cố định] + [Tổng lương khoán các Cụm công việc đã nghiệm thu] + [Phụ trội được duyệt] − [Khấu trừ lỗi nội bộ / Phạt đi trễ]

**Các bảng DB tham chiếu:**
- `employee_compensation_terms` — lương cơ bản, versioning theo `effective_period`.
- `work_pay_entitlements` — tổng hợp lương khoán từng hồ sơ theo kỳ.
- `employee_pay_adjustments` — phụ trội (`bonus`/`overtime`) và khấu trừ (`deduction`).
- `payroll_periods` — kỳ lương tháng: `open` $\rightarrow$ `locked` $\rightarrow$ `paid`.

**Định nghĩa "Phụ trội được duyệt":**
1. Nhân viên tạo yêu cầu phụ trội $\rightarrow$ ghi vào `employee_pay_adjustments` (`adjustment_type = 'bonus'` hoặc `'overtime'`).
2. **Giám đốc (`admin`)** xem xét và duyệt (`approved_by`, `approved_at`).
3. **Mức trần:** Phụ trội tối đa không vượt quá **50% đơn giá khoán tiêu chuẩn** (ngoại lệ cần văn bản Giám đốc).

### 3.2. Nguyên tắc khoán theo Cụm công việc & Luồng Nghiệm thu ✅

> **Nguyên tắc vàng về Lương khoán:** Lương khoán của nhân viên kỹ thuật (Đo vẽ, Pháp lý) được **TÍNH NGAY KHI CỤM CÔNG VIỆC ĐƯỢC GIÁM ĐỐC DUYỆT (PASS)**, **KHÔNG PHẢI CHỜ KHÁCH HÀNG TRẢ HẾT TIỀN**.

1. **Tách bạch trách nhiệm & Luồng nghiệm thu:**
   - Nhân viên hoàn thành công việc $\rightarrow$ upload minh chứng $\rightarrow$ gửi nghiệm thu node (`submit_task_node_for_acceptance`).
   - **Giám đốc (`admin`)** kiểm tra minh chứng $\rightarrow$ bấm Duyệt Đạt (`review_task_node_acceptance`).
   - Khi Giám đốc duyệt: Hệ thống tự động kích hoạt `_generate_work_pay_entitlements` tạo ngay bản ghi lương khoán cho nhân viên vào kỳ lương hiện tại, đồng thời mở khóa (`ready`) node tiếp theo.
   - Việc đòi tiền khách hàng là trách nhiệm của Kế toán & CSKH, không ảnh hưởng đến lương khoán kỹ thuật đã được nghiệm thu.

2. **Ngoại lệ duy nhất tại Cụm K08 (Nhận kết quả & Bàn giao):**
   - Điểm kiểm soát của K08 yêu cầu "đạt điều kiện công nợ". Do đó, tiền khoán của riêng nhân viên phụ trách thao tác K08 chỉ được ghi nhận khi Node K08 đạt trạng thái Pass (khi khách đã trả đủ tiền hoặc Giám đốc duyệt ngoại lệ cho nợ).

3. **Deadline chốt khoán tháng:**
   - Các cụm được Giám đốc duyệt Pass trước **23:59 ngày 25 hàng tháng** $\rightarrow$ tính vào kỳ lương tháng đó.
   - Duyệt sau ngày 25 $\rightarrow$ tự động chuyển sang kỳ lương (`payroll_periods`) của tháng tiếp theo.

### 3.3. Bảng Đơn giá Khoán chi tiết & Hệ số Phụ trội ✅

**Phạm vi áp dụng:** Chỉ áp dụng cho **Tổ Đo vẽ** (`survey_staff`). Tổ Pháp lý/CSKH áp dụng lương cứng + KPI.

> **Ghi chú kỹ thuật:** Trong DB, vai trò khoán lưu bằng `role_code`: **`MAIN`** (Phụ trách chính) và **`ASSISTANT`** (Phụ đo). Bảng: `work_item_rates` — liên kết với `work_items` qua `work_item_id`.

**Bảng đơn giá chuẩn** ✅ *(effective_from: 2026-08-05 — đã xác nhận khớp 100% DB)*:

| Hạng mục | Code (`work_items`) | MAIN (Phụ trách chính) | ASSISTANT (Phụ đo) |
|---|---|:---:|:---:|
| Cắm mốc | `SURVEY_STAKEOUT` | 1.200.000đ | 300.000đ |
| Hoàn công | `SURVEY_COMPLETION` | 1.100.000đ | 200.000đ |
| Cấp đổi | `SURVEY_CERTIFICATE_REISSUE` | 1.100.000đ | 200.000đ |
| Cấp sổ lần đầu | `SURVEY_FIRST_CERTIFICATE` | 1.100.000đ | 200.000đ |
| Chuyển mục đích | `SURVEY_LAND_USE_CHANGE` | 1.100.000đ | 200.000đ |
| Hợp thửa | `SURVEY_PARCEL_MERGE` | 1.200.000đ | 200.000đ |
| Tách thửa | `SURVEY_PARCEL_SPLIT` | 900.000đ | 200.000đ |
| Đo GPS | `SURVEY_GPS` | 1.200.000đ | 0đ |
| Kiểm tra hiện trạng | `SURVEY_SITE_CHECK` | 300.000đ | 150.000đ |
| Xác định diện tích | `SURVEY_AREA_CONFIRM` | 700.000đ | 200.000đ |
| Điều chỉnh bản vẽ | `SURVEY_DRAWING_ADJUST` | 500.000đ | — |
| Xin phép xây dựng | `CONSTRUCTION_PERMIT` | 1.500.000đ | — |
| Khảo sát | `SURVEY_FIELD_VISIT` | 400.000đ | — |
| Hỗ trợ vẽ theo yêu cầu | `SURVEY_CUSTOM_DRAWING` | 350.000đ | — |
| Đi nộp hồ sơ *(Pháp lý)* | `LEGAL_SUBMISSION_DELIVERY` | — | 350.000đ *(role: SUBMITTER)* |

**Bảng hệ số điều chỉnh (Phụ trội tự động theo đặc thù hồ sơ):**

| Điều kiện | Hệ số nhân |
|-----------|-----------|
| Diện tích ≥ 5.000 m² | × 1.2 |
| Diện tích ≥ 10.000 m² | × 1.5 |
| Số mốc ≥ 8 mốc (Cắm mốc) | × 1.3 |
| Địa hình phức tạp / vùng sâu | × 1.2 |
| Hồ sơ tranh chấp / khiếu nại | × 1.5 |

- **Cap Limit:** Tổng hệ số tự động tối đa 1.5. Muốn vượt trần $\rightarrow$ `admin` duyệt override.

### 3.4. Quản lý Hiệu lực Đơn giá (Versioning) & Chốt Lương ✅

- Mọi đơn giá khoán và hệ số phải gắn `effective_from`. Không áp dụng hồi tố.
- **Quyền cấu hình đơn giá:** Chỉ `admin` (Giám đốc). Kế toán chỉ sử dụng đơn giá đã cài sẵn — không được sửa *(chống rủi ro gian lận lương)*.

**Quy trình Chốt lương tháng:**

1. **Kế toán** (`accountant`) tổng hợp, rà soát toàn bộ số liệu: lương cơ bản, khoán nghiệm thu, phụ trội/khấu trừ $\rightarrow$ tạo **bản nháp bảng lương** (trạng thái `open`).
2. **Kế toán** gửi bảng lương lên hệ thống để Giám đốc duyệt.
3. **Giám đốc** (`admin`) kiểm tra tổng thể và nhấn **"Duyệt chốt bảng lương [MM/YYYY]"** $\rightarrow$ trạng thái chuyển thành `locked`, đồng thời ghi `locked_by_user_id` + timestamp vào Audit Log.
4. Kỳ lương sau khi `locked` không ai được sửa. Sai sót phải điều chỉnh tháng sau qua `employee_pay_adjustments`.
5. Sau khi thực chi, Kế toán cập nhật trạng thái thành `paid`.

**Vòng đời kỳ lương** ✅: `open` $\rightarrow$ `locked` $\rightarrow$ `paid`

---

## 4. PHÂN QUYỀN & KIỂM SOÁT HỆ THỐNG (AUDIT LOG)

### 4.1. Phân quyền theo Vai trò (Role-based Access Control) ✅

> **Các Role trong hệ thống** *(Giữ nguyên 6 role hiện có — không thêm role mới)*:
> - `admin` — Giám đốc / Quản trị (toàn quyền phê duyệt & ra quyết định)
> - `accountant` — Kế toán (tạo phiếu, theo dõi nợ, lập bảng lương, xuất quỹ)
> - `sales` — Sale / CSKH (quản lý lead, theo dõi công nợ hồ sơ của mình)
> - `survey_staff` — Nhân viên đo vẽ (thực hiện công việc, nộp minh chứng)
> - `legal_staff` — Nhân viên pháp lý (thực hiện hồ sơ, đề xuất tạm ứng, nộp minh chứng)
> - `employee` — Nhân viên (generic, dùng cho Employee Portal)

**Ma trận phân quyền:**

| Chức năng | `admin` (Giám đốc) | `accountant` (Kế toán) | `sales` (Sale/CSKH) | `survey_staff` (Đo vẽ) | `legal_staff` (Pháp lý) |
|---|:---:|:---:|:---:|:---:|:---:|
| Xem Dashboard tổng hợp doanh thu | ✅ | ✅ | ❌ | ❌ | ❌ |
| Tạo Phiếu thu / Phiếu chi | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Duyệt** Phiếu thu / Phiếu chi | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xem công nợ hồ sơ mình phụ trách | ✅ | ✅ | ✅ | ✅ | ✅ |
| Xem toàn bộ công nợ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Tạo Yêu cầu tạm ứng | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Duyệt** Tạm ứng chi phí | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xuất quỹ chi tiền sau khi duyệt | ✅ | ✅ | ❌ | ❌ | ❌ |
| Nộp minh chứng nghiệm thu node | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Phê duyệt "Pass" Cụm CV / Minh chứng** | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xem bảng lương cá nhân | ✅ | ✅ | ✅ | ✅ | ✅ |
| Xem bảng lương tổng công ty | ✅ | ✅ | ❌ | ❌ | ❌ |
| Lập dự thảo / Cập nhật bảng lương | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Duyệt chốt** bảng lương tháng | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cấu hình đơn giá khoán | ✅ | ❌ | ❌ | ❌ | ❌ |
| Duyệt cho nợ bàn giao (K08) / Override | ✅ | ❌ | ❌ | ❌ | ❌ |
| Duyệt xóa nợ / Chuyển nợ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xem Audit Log | ✅ | ❌ | ❌ | ❌ | ❌ |
| Quản lý User & Phân quyền | ✅ | ❌ | ❌ | ❌ | ❌ |

### 4.2. Nhật ký Hệ thống (Audit Log) — Bắt buộc 100% ✅

Mọi thao tác thay đổi trạng thái dòng tiền, duyệt chi, duyệt cho nợ, và chốt quỹ/lương **bắt buộc** ghi vào bảng `audit_log`.

**Thông tin bắt buộc trong mỗi bản ghi** (bảng `audit_log`):

| Field | Ý nghĩa |
|---|---|
| `actor_id` | ID người thực hiện (`users.id`) |
| `created_at` | Thời gian đến từng giây |
| `action` | Hành động (`created` / `approved` / `cancelled` / `locked` / `override_handover` / `written_off`) |
| `object_type` | Loại đối tượng (`cashflow_transaction` / `payroll_period` / `task_node` / `contract`) |
| `payload_json` | Chi tiết thay đổi + lý do bắt buộc |

**Tính đóng:** Read-only tuyệt đối — không ai (kể cả `admin`) được sửa hoặc xóa log.

---

## 5. BÁO CÁO & XUẤT DỮ LIỆU

### 5.1. Danh sách báo cáo ✅

| Báo cáo | Tần suất | Người xem | Định dạng xuất |
|---------|----------|-----------|---------------|
| Doanh thu theo tháng / quý / năm | Theo yêu cầu | `admin`, `accountant` | PDF, Excel |
| Công nợ theo trạng thái (`not_started` / `partial` / `overdue` / `written_off`) | Hàng ngày | `accountant`, `admin` | Trực tiếp trên app, Excel |
| P&L theo từng Hợp đồng (Lãi/Lỗ thực tế) | Theo yêu cầu | `admin` | Excel |
| Bảng lương tháng | Hàng tháng | `accountant`, `admin` | PDF, Excel |
| Kê khai VAT | Hàng tháng / quý | `accountant` | Excel (mẫu 01/GTGT — MISA) |
| Tình hình tạm ứng / hoàn ứng | Hàng tuần | `accountant`, `admin` | Excel |

### 5.2. Yêu cầu tích hợp phần mềm kế toán ✅

- **Xuất kê khai VAT:** File Excel tương thích MISA SME (mẫu 01/GTGT).
- **Giai đoạn 1:** Luồng một chiều — ERP xuất file $\rightarrow$ nhập MISA thủ công.
- **Giai đoạn 2 (Tương lai):** Tích hợp API 2 chiều với MISA/FAST.

---

## PHỤ LỤC: DANH SÁCH THAY ĐỔI DATABASE CẦN THỰC HIỆN

> Giữ nguyên 6 role hiện có. Không thêm role mới. Dưới đây là các migration SQL cần thực hiện.

### A. Bổ sung fields bảng receivables

```sql
-- 1. Bổ sung các fields phục vụ 6 trạng thái công nợ
ALTER TABLE receivables
  ADD COLUMN IF NOT EXISTS is_refunded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_by VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS refund_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_written_off BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS written_off_reason TEXT,
  ADD COLUMN IF NOT EXISTS written_off_by VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carried_forward_to VARCHAR REFERENCES contracts(id),
  ADD COLUMN IF NOT EXISTS carried_forward_from VARCHAR REFERENCES contracts(id);
```

### B. Bổ sung fields bảng contracts

```sql
-- 2. Bổ sung fields hoàn thành ngoại lệ do Giám đốc duyệt
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS completion_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completion_override_by VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS completion_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS completion_override_at TIMESTAMPTZ;
```

### C. Migration bảng payroll_periods

```sql
-- 3. Thêm tracking ai chốt lương
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS locked_by_user_id VARCHAR REFERENCES users(id);
```

### D. Seed cấu hình & RBAC

```sql
-- 4. Seed cấu hình ngưỡng vào finance_settings (nếu cần tham chiếu)
INSERT INTO finance_settings ("key", "value")
VALUES ('expense_approval_threshold', 2000000),
       ('advance_admin_threshold', 5000000)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
```