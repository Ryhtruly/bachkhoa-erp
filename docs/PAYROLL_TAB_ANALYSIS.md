# Đề xuất: Tab Tính lương — khoá kỳ, bất biến, có dấu vết

Ngày viết: **11/08/2026**
Supabase project: `ejklrwydjplwzztfuygj`
Trạng thái: **Đề xuất — chưa code**
Liên quan: [SURVEY_RECORDS_AUTO_CREATE_ANALYSIS.md](./SURVEY_RECORDS_AUTO_CREATE_ANALYSIS.md) §4.8

---

## 1. Quy tắc lương đã chốt

| Phòng | Lương cơ bản | Lương khoán | Thưởng / Phạt |
|---|:---:|:---:|:---:|
| **Pháp lý** | ✅ | ❌ **Không có** | ✅ |
| **Đo vẽ** | ✅ | ✅ | ✅ |

```text
Nhân viên Pháp lý:  Lương = Cơ bản                + Thưởng/Phạt
Nhân viên Đo vẽ:    Lương = Cơ bản + Khoán        + Thưởng/Phạt
```

**Nguyên tắc bất di bất dịch: lương tháng đã chốt thì KHÔNG sửa lại được.**

### 1.1. Khoản 350k "Đi nộp hồ sơ" thuộc về ai?

Đã kiểm tra: `work_items.wi_legal_submission_delivery` — *"Đi nộp hồ sơ"*, vai trò `SUBMITTER`, **350.000đ**, đã published.

Khớp với nghiệp vụ bạn mô tả trước đó: khoản này phát sinh khi **gói Đo Vẽ có kèm hỗ trợ nộp** — tức **nhân viên đo vẽ** đi nộp giúp, nhận 350k. Nhân viên **pháp lý** đi nộp là **việc chính của họ**, đã nằm trong lương cơ bản, không tính khoán.

→ Cùng một công việc "đi nộp", nhưng ai làm mới quyết định có tiền khoán hay không.

### 1.2. Cách thể hiện quy tắc này trong hệ thống

Không nên viết cứng *"phòng Pháp lý thì bỏ qua khoán"* trong code, vì:
- Nhân viên có thể chuyển phòng;
- Sau này có thể phát sinh phòng/vai trò mới;
- Có thể có ngoại lệ (một nhân viên pháp lý được giao hẳn việc đo vẽ).

**Đề xuất: thêm cột `employees.pay_type`** với 2 giá trị:

| Giá trị | Nghĩa | Mặc định cho |
|---|---|---|
| `base_only` | Chỉ lương cơ bản + thưởng/phạt | Phòng Pháp lý |
| `base_plus_piece` | Cơ bản + khoán + thưởng/phạt | Phòng Đo vẽ |

Khi sinh khoản khoán (lúc nghiệm thu Node), nếu nhân viên là `base_only` thì **không sinh** — chặn ngay từ gốc, không để tiền rác nằm trong bảng rồi phải lọc sau. Muốn đổi chính sách cho một người thì sửa 1 ô dữ liệu, không phải sửa code.

---

## 2. ⚠️ Hai lỗ hổng trong cơ chế hiện tại

### 2.1. Chuỗi vòng đời tiền khoán **bị đứt**

```text
Giám đốc bấm "Duyệt đạt" nghiệm thu
        ↓
✅ Tự sinh work_pay_entitlement, status = 'eligible'
        ↓
❌ approved  →  ❌ paid          ← KHÔNG CÓ DÒNG CODE NÀO
```

Bảng đã có sẵn `approved_by`, `approved_at`, `voided_by`, `void_reason` và trạng thái `approved`/`paid`, nhưng **không ai chuyển trạng thái**. Hiện tại 3 khoản của Nguyễn Văn A (3.600.000đ) nằm mãi ở `eligible`.

### 2.2. Lương cơ bản đang tra cứu **sống** — đây là chỗ nguy hiểm nhất

```sql
select base_salary from employee_compensation_terms
where employee_id = :employee_id and status='published'
  and effective_from < period.end_date ...
```

Bảng lương **tính lại mỗi lần mở màn hình**. Ai sửa/thêm một mốc lương có hiệu lực lùi về quá khứ là **bảng lương các tháng đã trả tự nhảy số** — không cảnh báo, không dấu vết.

Tiền khoán thì an toàn (đã chốt cứng vào `amount` + `calculation_snapshot` lúc nghiệm thu). Riêng lương cơ bản và điều chỉnh thì không.

→ Với yêu cầu *"lương đã xong trong tháng đó thì không sửa nữa"*, **bắt buộc phải đóng băng kỳ lương**.

---

## 3. Thiết kế: đóng băng kỳ lương

### 3.1. Hai bảng mới

**`payroll_periods`** — mỗi tháng một dòng

| Cột | Ý nghĩa |
|---|---|
| `id` | |
| `period_month` | Ngày đầu tháng, VD `2026-08-01` (duy nhất) |
| `status` | `open` → `locked` |
| `locked_by`, `locked_at` | Ai khoá, lúc nào |
| `note` | |

**`payroll_lines`** — bảng lương **đã đóng băng** của từng người trong kỳ

| Cột | Ý nghĩa |
|---|---|
| `period_id`, `employee_id` | |
| `pay_type` | Chụp lại chính sách lúc chốt (`base_only` / `base_plus_piece`) |
| `base_salary` | **Số đã chốt**, không tra cứu lại |
| `piece_amount`, `piece_count` | Tổng khoán đã chốt |
| `adjustment_amount` | Tổng thưởng/phạt đã chốt |
| `total_amount` | Tổng thực nhận |
| `calculation_snapshot` (jsonb) | Chi tiết từng khoản để đối chiếu về sau |
| `locked_at` | |

Thêm `work_pay_entitlements.payroll_period_id` để biết khoản khoán đó đã được trả trong kỳ nào — đối chiếu chính xác, không đoán theo ngày.

### 3.2. Vòng đời kỳ lương

```text
┌─ Kỳ MỞ (open) ──────────────────────────────────┐
│ • Số liệu tính sống, xem trước được             │
│ • Thêm/sửa thưởng phạt thoải mái                │
│ • Khoản khoán mới vẫn rơi vào kỳ này            │
└─────────────────────────────────────────────────┘
                     ↓  Giám đốc bấm "Chốt lương tháng 8"
        ┌────────────────────────────────┐
        │ 1. Chụp toàn bộ số liệu        │
        │    → ghi vào payroll_lines     │
        │ 2. eligible → approved         │
        │    + gắn payroll_period_id     │
        │ 3. Kỳ chuyển sang LOCKED       │
        └────────────────────────────────┘
                     ↓
┌─ Kỳ ĐÃ KHOÁ (locked) ───────────────────────────┐
│ 🔒 KHÔNG sửa được gì thuộc kỳ này:              │
│    – không thêm/sửa/xoá thưởng phạt trong kỳ    │
│    – không huỷ khoản khoán đã chốt              │
│    – không đổi lương cơ bản ảnh hưởng kỳ này    │
│ ✅ Chỉ còn: đánh dấu "Đã trả" (approved → paid) │
└─────────────────────────────────────────────────┘
```

### 3.3. Sai rồi thì sửa thế nào? — **Truy hồi sang kỳ sau**

Đây là chỗ quyết định độ chặt chẽ. Nguyên tắc kế toán chuẩn: **không bao giờ sửa ngược vào kỳ đã khoá**.

```text
Tháng 8 đã khoá, phát hiện thiếu 500k của Nguyễn Văn A
        ↓
❌ KHÔNG mở lại tháng 8
✅ Tạo điều chỉnh ở tháng 9:
     Loại: Truy lĩnh
     Số tiền: +500.000
     Lý do: "Bù khoán Đo GPS 15/08 bị bỏ sót — kỳ T8 đã khoá"
     Người duyệt: Giám đốc
```

Như vậy sổ sách luôn khớp, và mọi sai sót đều để lại dấu vết ai sửa, sửa gì, vì sao — thay vì âm thầm đổi số quá khứ.

**Trường hợp cần mở lại kỳ** (hiếm, VD chốt nhầm): cho phép nhưng **bắt buộc nhập lý do** và ghi nhật ký `payroll_period_events`. Không phải nút bấm bình thường.

### 3.4. Tình huống biên phải xử lý

| Tình huống | Cách xử lý đề xuất |
|---|---|
| Node được nghiệm thu **muộn**, `earned_at` rơi vào tháng đã khoá | Khoản khoán chuyển sang **kỳ mở gần nhất**, ghi chú rõ "phát sinh từ T8" |
| Nhân viên vào/nghỉ giữa tháng | Lương cơ bản tính theo tỷ lệ ngày công — ❓ **cần bạn chốt cách tính** |
| Khoản khoán bị huỷ sau khi đã chốt kỳ | Không sửa kỳ cũ; tạo điều chỉnh **âm** ở kỳ sau kèm lý do |
| Nhân viên `base_only` nhưng vẫn được phân công việc có khoán | Không sinh khoản khoán (§1.2). Nên **cảnh báo ngay lúc phân công** để sếp biết |

---

## 4. Giao diện

### 4.1. Nhân viên — "Lương của tôi" (chỉ xem)

```text
Tháng 8/2026        🔒 Đã chốt 31/08

Lương cơ bản                      8.000.000
Khoán (3 việc)                    3.600.000
Thưởng/Phạt                               0
──────────────────────────────────────────
Thực nhận                        11.600.000

Chi tiết khoán:
  Đo GPS · 305/BK-2025 · 10/08      1.200.000
  Đo GPS · 310/BK-2025 · 09/08      1.200.000
  Cắm mốc · 312/BK-2025 · 09/08     1.200.000
```

Nhân viên **Pháp lý** thì không hiện mục Khoán — tránh gây hiểu nhầm là bị thiếu.

### 4.2. Giám đốc — "Tính lương"

- Chọn kỳ, thấy bảng toàn bộ nhân viên: Cơ bản · Khoán · Thưởng/Phạt · Tổng · Trạng thái
- Mở một người → chi tiết từng khoản
- Nút: **Thêm thưởng/phạt** (khi kỳ còn mở) · **Chốt lương** · **Đánh dấu đã trả**
- Kỳ đã khoá: mọi nút sửa **biến mất**, chỉ còn xem và đánh dấu đã trả

Tuân thủ quy tắc chung đã thống nhất: **sửa bằng nút, không sửa trực tiếp trên dòng dữ liệu**.

---

## 5. Phân quyền — nhạy cảm, phải chặn ở server

> ⚠️ Hiện `role_permissions` cho `survey_staff` và `legal_staff` quyền **giống hệt nhau**, đều `can_read` trên `payroll`. Và các route mới **chưa lọc theo người**.

Bắt buộc:
- Nhân viên chỉ đọc được **lương của chính mình** — lọc trong câu truy vấn, không phải ẩn trên giao diện.
- Chỉ giám đốc/admin mới thấy bảng lương toàn công ty và có quyền chốt kỳ.

---

## 6. Để khách tự thiết lập — đánh giá

**Ý này đúng hướng.** Mấy thứ đó là *chính sách của doanh nghiệp*, không phải chân lý kỹ thuật — viết cứng vào code thì mỗi lần công ty đổi chính sách lại phải sửa code, chờ deploy. Nhưng cần **tách làm 2 loại**, vì không phải thứ gì cũng nên cho tự do.

### 6.1. ✅ Nhóm nên cho khách tự setup — **tham số**

| # | Mục | Kiểu thiết lập | Ghi chú |
|---|---|---|---|
| 1 | `pay_type` từng nhân viên | Ô chọn trên hồ sơ nhân sự | Mặc định theo phòng, sửa được từng người |
| 3 | Ai được bấm **"Đã trả"** | **Đã có sẵn** bảng `role_permissions` | Chỉ cần thêm resource `payroll` + hành động; không phải làm mới |
| 4 | Có in phiếu lương không | Bật/tắt | `payroll_lines` đã đủ dữ liệu để in |
| 5 | Ngày chốt kỳ hàng tháng | Một con số (VD: ngày 5 tháng sau) | |

Đây đều là **giá trị rời rạc** — một con số, một lựa chọn, một quyền. Sai thì thấy ngay, sửa lại dễ.

### 6.2. ⚠️ Nhóm KHÔNG nên cho tự do — **quy tắc tính toán**

Mục **(2) vào/nghỉ giữa tháng** khác hẳn 4 mục kia: nó là **công thức tính tiền**.

Tôi đề nghị cho khách **chọn 1 trong 3 cách có sẵn**, chứ **không** làm ô nhập công thức tự do:

| Cách | Công thức | Dùng khi |
|---|---|---|
| **(a)** Theo ngày dương lịch | `Cơ bản ÷ số ngày trong tháng × số ngày có mặt` | Phổ biến, dễ giải thích |
| **(b)** Theo ngày làm việc | `Cơ bản ÷ số ngày làm việc × số ngày làm việc có mặt` | Chuẩn hơn với công ty nghỉ T7/CN |
| **(c)** Trả đủ tháng | Không chia theo tỷ lệ | Công ty ưu ái nhân viên mới |

**Vì sao không làm ô nhập công thức tự do:** lương tính sai là chuyện nghiêm trọng — dẫn tới khiếu nại, thậm chí tranh chấp lao động. Công thức tự do thì hệ thống **không có cách nào biết khách gõ sai**, không test trước được, và khi có sự cố thì không ai truy được lỗi ở đâu. Ba lựa chọn cố định thì kiểm chứng được từng cái.

### 6.3. 🚨 Cảnh báo: bảng cấu hình hiện tại **không đủ dùng cho lương**

Đã kiểm tra bảng `system_settings` — chỉ có **3 cột**: `key`, `value`, `description`.

Thiếu 2 thứ tối quan trọng với dữ liệu lương:
- **Không biết ai đổi, đổi lúc nào** (không có audit)
- **Không có hiệu lực theo thời gian** (không biết tháng trước quy tắc là gì)

Tình huống thật sẽ xảy ra: hôm nay sếp đổi cách tính ngày công → tháng sau nhân viên thắc mắc lương tháng trước → **không ai chứng minh được lúc đó quy tắc là gì**.

**Cách xử lý — nhẹ mà đủ chặt:**

1. Thêm `updated_by`, `updated_at` vào `system_settings` — biết ai đổi, lúc nào.
2. **Quan trọng hơn:** khi chốt kỳ, ghi luôn **bộ cấu hình đã dùng** vào `payroll_lines.calculation_snapshot`.

Điểm (2) mới là chỗ giải quyết triệt để: bảng lương tháng 8 **tự mang theo bằng chứng** nó được tính bằng quy tắc nào, đơn giá nào, lương cơ bản bao nhiêu. Sau này config đổi bao nhiêu lần cũng không ảnh hưởng — mở kỳ cũ ra là thấy đúng số và đúng lý do.

> Đây cũng chính là lý do cơ chế **đóng băng kỳ lương** ở §3 là bắt buộc, không phải tuỳ chọn.

---

## 7. Cần bạn chốt

| # | Điểm | Đề xuất |
|---|---|---|
| 1 | Cách tính **vào/nghỉ giữa tháng** — chọn (a), (b) hay (c)? (§6.2) | (b) nếu công ty nghỉ T7/CN |
| 2 | Ngày **chốt kỳ** hàng tháng | |
| 3 | Có làm **phiếu lương in** ngay đợt này không? | Để pha sau nếu chưa gấp |
| 4 | Làm tab Lương **ngay** hay sau khi xong tab Đo vẽ? | Sau — đợt Đo vẽ đã khá lớn |

**Chưa code — chờ bạn duyệt.**
