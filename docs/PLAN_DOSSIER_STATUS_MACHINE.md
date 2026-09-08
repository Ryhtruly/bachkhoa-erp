# PLAN: Chuẩn hoá trạng thái hồ sơ Đo vẽ ↔ Pháp lý

Ngày viết: **12/08/2026** · Cập nhật: **13/08/2026** (bản 5 — gộp thành 4 đợt thi công)

## 📊 Tiến độ

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| **1** | Nền móng: tiền · danh mục node · toàn bộ schema | ✅ **XONG** 13/08/2026 |
| **2** | Trạng thái tính sống · một quy tắc khoá dùng chung | ✅ **XONG** 13/08/2026 |
| **3** | Vòng đời hồ sơ pháp lý (node K06) | ✅ **XONG** 13/08/2026 |
| **4** | Node bàn giao K08 · 2 làn · Kế toán | ✅ **XONG** 13/08/2026 |

**Đợt 4 kiểm chứng:** ✅ 26/26 bước kịch bản bàn giao · ✅ 318 request không lỗi 500 · ✅ build production

**Đợt 3 kiểm chứng:** ✅ 16/16 bước kịch bản vòng đời · ✅ 39/39 test backend · ✅ 26/26 test frontend

**Đợt 2 kiểm chứng:** ✅ 39/39 test backend · ✅ 26/26 test frontend · ✅ 8/8 bước kịch bản trạng thái

**Đợt 1 kiểm chứng:** ✅ 20/20 test đơn vị · ✅ 8/8 bước kịch bản nghiệp vụ trên dữ liệu thật · ✅ 4/4 test frontend · ❌ chưa kiểm được bằng trình duyệt *(Playwright MCP không nạp được)*

> ### 🔴 Sự cố sau Đợt 1 — đã sửa 13/08/2026
> **Hai trang danh sách Đo vẽ và Pháp lý chết trắng.** Migration đổi tên
> `survey_records.status` → `manual_status` và `legal_submissions.gov_status` → `legacy_gov_status`,
> nhưng các câu SQL viết tay trong route vẫn gọi tên cũ → `UndefinedColumn`.
>
> **Vì sao không test nào bắt được:** hai trang này dùng SQL viết tay, không qua ORM.
> 14 test lúc đó đều là test logic thuần, không chạm CSDL thật. Migration xanh, test xanh, trang chết.
>
> **Đã sửa:** 10 chỗ trong 2 route, giữ nguyên bí danh `as status` / `as gov_status`
> để frontend không phải sửa gì. Thêm `tests/test_sql_2_trang_ho_so.py` (6 test) —
> chạy **đúng câu SQL của trang trên CSDL thật**, nên lần sau đổi tên cột mà quên sửa truy vấn là đỏ ngay.
>
> **Bài học đưa vào Đợt 2–4:** mỗi lần đụng schema, phải chạy lại truy vấn của **mọi trang** dùng SQL viết tay,
> không chỉ chạy test logic.

> **Bản 5 sửa gì**
> · Gộp **8 bước → 4 đợt**, mỗi đợt làm trọn được **không cần hỏi giữa chừng** (§4.0)
> · **Chốt sẵn cả 6 câu treo** thay vì chờ trả lời (§4.1) — không còn gì chặn
> · Mỗi đợt kèm **cách tự kiểm** bằng SQL / gọi API / trình duyệt thật, để báo cáo kết quả chứ không hỏi *"nhìn ổn chưa"*
>
> **Bản 4 sửa gì**
> · **Không chặn bàn giao khi còn nợ** — hỏi xác nhận, cho giao, nhưng quy trình treo *"Chưa hoàn thành"* tới khi thu đủ rồi **tự đóng**. Bỏ cơ chế "giám đốc châm chước" (§6.11)
> · **Giữ K08 và K09 riêng** *(đảo lại đề xuất gộp ở bản 3)* — K08 là nơi tiền về, K09 là nơi file về; file không nên chờ tiền → **7 node**
> · **K08 chia 2 làn**: Pháp lý (hiện vật) + Kế toán (tiền); xong làn Pháp lý là mở K09 và **trả tiền khoán ngay**
> · **Kế toán được theo dõi quy trình** — cấp `workflow`/`task_node` chỉ đọc; hiện đang không thấy gì cả
>
> **Bản 3 sửa gì**
> · 🚨 Phát hiện **hai danh mục node khác nhau dùng chung một bộ mã** — CSDL và đặc tả lệch nhau ở K04, K07, K08, K09 (§6.10)
> · Chốt **danh mục chuẩn 6 node**: bỏ **K04 · K07 · K08**, K03 thành *"Chuẩn hoá tài liệu kỹ thuật"*
> · Thêm việc **chuẩn hoá danh mục node** vào kế hoạch thi công
>
> **Bản 2 sửa gì**
> · Đo vẽ **cũng phải có node Bàn giao** mới đóng được — trước đó tôi hiểu sai (§2.2, §6.8)
> · **Bỏ K07** và **tách 2 bảng** chuyển từ "đề xuất" sang **đã chốt** (§6.2, §6.6)
> · Kế hoạch chia thành các bước độc lập, xếp theo mức nguy hiểm và thứ tự phụ thuộc (§4)

---

## 1. Vấn đề hiện tại (có bằng chứng, không phải phỏng đoán)

### 1.1. Trạng thái đo vẽ sai — quy trình xong mà vẫn "Đang thực hiện"

Dữ liệu thật trong DB:

| Hồ sơ | Node | `accepted_at` | Trạng thái đang lưu |
|---|---|---|---|
| beoauibf | **accepted** | 12/08 04:32 | ❌ "Đang thực hiện" |
| Lê hữu trí | **accepted** | 12/08 03:42 | ❌ "Đang thực hiện" |

**Nguyên nhân gốc:** cột `survey_records.status` là **giá trị lưu cứng**, mặc định "Đang thực hiện", và **không có bất kỳ đoạn code nào cập nhật nó** khi node được nghiệm thu. Trong khi cột "Cảnh báo" lại **tính sống** từ `accepted_at` → hiện "Xong".

→ Hai nguồn sự thật trên cùng một dòng, chọi nhau. Đây là thiếu sót khi tôi dựng bảng: tạo cột nhưng không nối vào vòng đời node.

### 1.2. Định nghĩa "đã kết thúc" lệch nhau giữa 2 phân hệ

```
Đo vẽ   coi là xong: Hoàn thành · Nộp thành công    (Huỷ thì KHÔNG)
Pháp lý coi là xong: Hoàn thành                      (Rút hồ sơ, Trả công văn thì KHÔNG)
```

Backend cả hai lại dùng **chung một danh sách** `('Hoàn thành','Nộp thành công')` — mà "Nộp thành công" **không tồn tại** trong bộ trạng thái pháp lý → điều kiện thừa, vô nghĩa.

### 1.3. Bấm "Sửa" bị giật

Đo được: chế độ Xem mỗi trường cao **~18px**, đổi sang ô nhập cao **44px**. Với ~10 trường, hộp thoại **nhảy thêm ~250px** đột ngột.

### 1.4. Thiếu hạ tầng cho KPI

`legal_submissions` **không có bảng lịch sử** nào (chỉ có `created_at`/`updated_at`) → **không thể** tính giờ xử lý có đóng băng. Node thì đã có `task_node_events`, hồ sơ pháp lý thì chưa có gì.

---

## 2. Mô hình trạng thái đích

### 2.1. Pháp lý — theo đúng đặc tả đã chốt

```
        ┌─────────────────────────────────────────────┐
        │                                             │
   ASSIGNED ──accept──▶ PROCESSING ──close──▶ CLOSED  │
  (chờ nhận)            │      ▲              ├ DONE
   ⏱ KPI chưa chạy      │      │              └ REJECTED
                   pause│      │resume         = KẾT THÚC THẬT
                        ▼      │
                      PENDING ─┘
                      ⏸ ĐÓNG BĂNG KPI
                      ├ AGENCY   (nhà nước thẩm định / đòi bổ sung / thông báo thuế)
                      ├ SURVEYOR (bản vẽ sai ranh → đẩy ngược về đo vẽ)
                      └ INTERNAL (chờ sếp ký / chờ sale hối khách đóng thuế)
```

**Nguyên tắc bất di bất dịch:** *quy trình chỉ hoàn thành khi **chính nhân viên pháp lý** bấm **CLOSE***. Đo vẽ xong **không phải** là kết thúc.

Bộ 4 giá trị cũ lấy từ sheet của khách (*Đang chi nhánh · Hoàn thành · Rút hồ sơ · Trả công văn*) **bị thay thế** — đã chốt: không thể hiện đủ chi tiết.

### 2.2. Đo vẽ — chuẩn hoá lại

| Trạng thái | Khi nào | Ai quyết |
|---|---|---|
| **Đang thực hiện** | Node đo vẽ chưa nghiệm thu | Hệ thống |
| **Đã bàn giao** | Node đo vẽ nghiệm thu **và** hạng mục có kèm pháp lý | Hệ thống |
| **Hoàn thành** | **Node BÀN GIAO của chính Hạng mục đó được nghiệm thu** | Hệ thống |
| **Nộp thành công** | Gói đo vẽ có hỗ trợ nộp, nhân viên đo vẽ tự đi nộp (không theo dõi vòng đời) | Người dùng |
| **Huỷ** | Không làm nữa | Người dùng |

> ### ⚠️ Đính chính: Hạng mục ĐO VẼ cũng phải có node Bàn giao mới đóng được
>
> Trước đó tôi hiểu sai rằng đo vẽ không kèm pháp lý thì nghiệm thu xong là hết.
> **Không đúng.** Mô tả K08 ghi rõ: *"Tất cả gói **có đầu ra bàn giao**"* — kể cả gói Đo Vẽ thuần cũng phải giao bản vẽ cho khách, thu tiền, rồi mới đóng.
>
> ```
> Hạng mục ĐO VẼ thuần:      K01 → K02 → … → K08 Bàn giao → ✅ xong
> Hạng mục ĐO VẼ (có pháp lý): K01 → K02 → … → K08 Bàn giao → ✅ xong phần đo vẽ
> Hạng mục PHÁP LÝ:            K05 → K06 Nộp → K08 Bàn giao → ✅ xong
> ```
>
> Mỗi Hạng mục là **một quy trình riêng**, nên **mỗi bên có node Bàn giao của riêng mình**.
> → **Cổng công nợ ở K08 áp dụng cho cả hai phân hệ**, không riêng pháp lý.

---

## 3. Quyết định kiến trúc quan trọng

**Gốc của lỗi 1.1 là: lưu trạng thái nhưng quên cập nhật.** Nếu chỉ "vá thêm một chỗ ghi" thì sau này thêm đường đi mới lại quên tiếp — lỗi sẽ tái diễn.

Đề xuất **tách đôi**:

- **Phần tự động** (Đang thực hiện / Đã bàn giao / Hoàn thành) → **TÍNH SỐNG** lúc đọc, từ: trạng thái node + hạng mục có pháp lý không + trạng thái hồ sơ pháp lý.
  → **Không bao giờ lệch được**, vì không có gì để lệch.
- **Phần thủ công** (Nộp thành công / Huỷ) → lưu ở cột riêng `manual_status`, người dùng chọn.
- **Hiển thị** = `manual_status` nếu có, ngược lại lấy giá trị tính sống.

Lợi ích: xoá sổ hẳn nhóm lỗi "hai nguồn sự thật", đúng nguyên tắc đã áp dụng cho cột *Cảnh báo* và cột *Pháp lý* (đều tính sống, chưa lần nào sai).

---

## 4. Kế hoạch thi công — 4 đợt, tối thiểu số lần hỏi lại

### 4.0. Vì sao gộp từ 8 bước xuống 4 đợt

Bản trước chia 8 bước cho *dễ hiểu*. Nhưng chia nhỏ mà mỗi bước lại phải dừng để hỏi thì **tổng thời gian dài hơn**, không ngắn hơn. Bản này gộp lại theo tiêu chí khác: **mỗi đợt là một khối làm trọn được mà không cần hỏi giữa chừng.**

Nhìn lại những gì đã làm tốn lượt nhất từ đầu dự án:

| Thứ làm tốn lượt | Lần này xử lý thế nào |
|---|---|
| Câu hỏi treo giữa chừng | **Chốt sẵn toàn bộ** ở §4.1 — không còn câu nào phải hỏi |
| Sửa giao diện qua lại theo ảnh chụp | **Tự mở trình duyệt kiểm tra** (Playwright), đo toạ độ, chụp ảnh — báo cáo kết quả chứ không hỏi "nhìn ổn chưa" |
| Nhiều lần đổi cấu trúc dữ liệu | **Gộp thành 1 migration duy nhất** cho cả 4 đợt |
| Không có tài khoản/dữ liệu để thử | **Tạo trước** tài khoản Kế toán + bộ dữ liệu mẫu ngay đầu Đợt 1 |
| Container không nhận file mới, uvicorn treo | **Khởi động lại chủ động** sau mỗi lần thêm file, coi như thao tác bắt buộc |
| Khoảng cách/bo góc lệch với tab Hợp đồng | **Dùng lại đúng token và class có sẵn** trong `contracts.css`, không tự chế giá trị mới |

---

### 4.1. Chốt sẵn 6 câu treo — không hỏi nữa

Tôi quyết theo mặc định dưới đây và **làm luôn**. Bạn thấy chỗ nào sai thì nói, tôi đổi — nhưng không chờ trả lời mới bắt đầu.

| # | Câu | **Quyết** | Lý do |
|---|---|---|---|
| B | Đo vẽ có cần K06 không | Có node nộp, nhưng **không gắn cờ** `requires_gov_submission` | Chính cờ đó mới sinh vòng đời hồ sơ. Không cờ = đi nộp, lấy biên nhận, xong — đúng ý "không theo dõi vòng đời" |
| C | Nút thao tác pháp lý đặt đâu | **Cả hai chỗ**, dùng chung một component + một API | Viết 2 bản là 2 chỗ để lệch |
| D | Nút "Thêm Hạng mục" | **Không làm trong 4 đợt này** | Việc khác hẳn, gộp vào sẽ kéo dài đợt |
| E | Khách xù nợ hẳn | **Huỷ quy trình** bằng cơ chế đã có — nợ giữ nguyên trong sổ | Không dựng thêm trạng thái nào; thêm đường tắt là thêm chỗ để nợ biến mất |
| F | Kế toán có được duyệt phiếu thu | **Không** — chỉ giám đốc | Giữ tách bạch người nhập ↔ người duyệt. Chưa làm thành thiết lập, để sau |
| G | Node đặc biệt nhận diện bằng gì | **Cờ**, không bao giờ bằng mã | Đã chốt §6.10 |

---

### ✅ ĐỢT 1 — Nền móng: tiền, danh mục node, toàn bộ schema — **ĐÃ XONG 13/08/2026**

> **Không đụng giao diện người dùng.** Kiểm chứng hoàn toàn bằng SQL và gọi API — không cần bạn nhìn màn hình.

| # | Việc | Trạng thái | Bằng chứng |
|---|---|:---:|---|
| 1.1 | **Chỉ trừ công nợ khi phiếu thu ĐÃ DUYỆT**; từ chối/huỷ thì **hoàn lại** | ✅ | `counts_toward_receivable()` chặn **cả 5/5** chỗ gọi `_sync_receivables` |
| 1.2 | Rà toàn bộ phiếu cũ, **in bảng đối soát trước/sau** rồi mới vá | ✅ | 17 phiếu chờ duyệt **đều không gắn hợp đồng** → **không phải vá gì** |
| 1.3 | **Một migration duy nhất** | ✅ | `legal_dossiers` · `legal_dossier_events` · `dossier_id`/`submit_seq`/`submit_reason` · `legacy_gov_status` · `manual_status` · `approved_at` · quyền Kế toán |
| 1.4 | Chuẩn hoá **7 node**, vô hiệu hoá K04·K07 | ✅ | K01·K02·K03·K05·K06·K08·K09 hoạt động; K04·K07 `is_active=false` |
| 1.5 | Cập nhật **4 quy trình mẫu**, thêm K08 vào mẫu Đo vẽ thuần | ✅ | Chuỗi node đã kiểm bằng SQL *(bảng dưới)* |
| 1.6 | **Bỏ mã viết cứng** → đọc cờ | ✅ | `_timeline_node_type` không còn mã K0x nào |
| 1.7 | Ô chọn cờ `is_handover` trong Workflow Designer | ✅ | 6 chỗ: 3 tuần tự hoá + ô chọn + giá trị mặc định |
| 1.8 | Tạo **tài khoản Kế toán** | ✅ | `ketoan` / `123456` → vai trò `accountant` |
| 1.9 | Khử giật khi bấm Sửa | ✅ | `min-height: 44px` ở cả 2 file CSS |
| **+** | 🔴 **Thêm endpoint duyệt/từ chối** *(ngoài kế hoạch — bắt buộc)* | ✅ | Trước đây **không có**, phiếu vào "Chờ duyệt" là kẹt vĩnh viễn |
| **+** | 🔴 **Sửa khoá ngoại ma `projects_tasks`** *(lỗi có sẵn)* | ✅ | Bảng không tồn tại → **mọi lần tạo phiếu đều lỗi 500** |

**Chuỗi node 4 quy trình mẫu sau chuẩn hoá — đã đọc từ CSDL:**

```
WF_DOVE          K01 → K02 → K03 → K08 → K09              ← thêm K08, trước đây KHÔNG có cổng công nợ
WF_DOVE_NOP      K01 → K02 → K03 → K06 → K08 → K09        ← K06 không gắn cờ, không sinh vòng đời hồ sơ
WF_PHAPLY_HS     K01 → K05 → K06 → K08 → K09              ← từ 7 node xuống 5
WF_PHAPLY_KOHS   K01 → K02 → K03 → K05 → K06 → K08 → K09
```

**Kết quả tự kiểm:**

| Hạng mục | Kết quả |
|---|---|
| Test đơn vị nghiệp vụ `test_cong_no_duyet_phieu.py` | ✅ **14/14** |
| Kịch bản nghiệp vụ trên dữ liệu thật *(hợp đồng thử, đã xoá sạch)* | ✅ **8/8** |
| Test frontend | ✅ **4/4** |
| Bảng mới · cột mới · cột cũ đã đổi tên | ✅ khớp hết |
| Quyền Kế toán | ✅ 9 nhóm quyền, **không có** `can_approve` |
| ⚠️ Kiểm chứng bằng trình duyệt thật | ❌ **chưa làm được** — Playwright MCP không nạp được ở phiên này |

**Kịch bản nghiệp vụ 8 bước — chạy thật, không mô phỏng:**

| | Bước | Công nợ còn lại |
|:---:|---|---:|
| ✅ | Hợp đồng thử 24.000.000₫ | 24.000.000₫ |
| ✅ | Nhân viên gõ phiếu 18tr — **chờ duyệt** | **24.000.000₫** *(không đổi)* |
| ✅ | Giám đốc duyệt | 6.000.000₫ |
| ✅ | Gõ tiếp 6tr — chờ duyệt | 6.000.000₫ |
| ✅ | Giám đốc **từ chối** | 6.000.000₫ |
| ✅ | Gõ lại + duyệt | **0₫** → cổng bàn giao mở |
| ✅ | Huỷ phiếu **đã duyệt** | 6.000.000₫ *(hoàn lại)* |
| ✅ | Huỷ phiếu **chưa duyệt** | 6.000.000₫ *(không thổi phồng)* |

**⇒ Lỗ hổng tiền đã bịt, danh mục node đã chuẩn, 3 đợt sau không phải đụng schema nữa.**

---

### ✅ ĐỢT 2 — Hết lỗi bạn đang báo — **ĐÃ XONG 13/08/2026**

| # | Việc | | Bằng chứng |
|---|---|:---:|---|
| 2.1 | Trạng thái đo vẽ **tính sống** (§3) | ✅ | `SURVEY_STATUS_LATERAL` trong `dossiers/lifecycle.py` |
| 2.2 | **Một hàm khoá duy nhất**; API trả cờ `is_locked` | ✅ | `is_dossier_locked()` — một danh sách cho cả 2 phân hệ |
| 2.3 | Hai trang đọc `is_locked` | ✅ | `isDossierLocked(record)` thay cho 2 hàm riêng |
| 2.4 | Cột **Cảnh báo** khớp trạng thái mới | ✅ | Thêm *"Chờ pháp lý"*; dùng cờ khoá thay vì so chuỗi |
| 2.5 | Hồ sơ đã kết thúc → **ẩn nút Sửa** | ✅ | Đọc `is_locked` do backend quyết |
| **+** | 🔴 Trạng thái tính sống **không cho gõ tay** | ✅ | Ô chọn chỉ còn *Nộp thành công* / *Huỷ* |
| **+** | 🔴 **`Huỷ` giờ mới khoá sửa** | ✅ | Trước đây bên đo vẽ bỏ sót giá trị này |

**Lỗi "hai nguồn sự thật" tìm thấy trong `lib/dossierStatus.js`:**

```
Đo vẽ  : { 'Hoàn thành', 'Nộp thành công' }   ← thiếu 'Huỷ'
Pháp lý: { 'Hoàn thành' }                     ← thiếu 2 giá trị
```

Hai danh sách khác nhau trong **cùng một file** — đúng chỗ khách báo *"đo vẽ thì một kiểu, pháp lý lại là kiểu khác"*.
Giờ chỉ còn một hàm đọc cờ `is_locked` do backend tính.

**Kịch bản nghiệp vụ 8/8 — chạy thật trên quy trình K03 → K08 → K09:**

| | Bước | Trạng thái | Khoá? |
|:---:|---|---|:---:|
| ✅ | Chưa node nào xong | Đang thực hiện | mở |
| ✅ | Nghiệm thu K03 Chuẩn hoá tài liệu | Đang thực hiện *(còn bàn giao)* | mở |
| ✅ | Nghiệm thu nốt K08 + K09 | **Hoàn thành** ⭐ | **khoá** |
| ✅ | Sửa hồ sơ đã khoá | bị chặn 409 | |
| ✅ | Gõ tay 'Hoàn thành' | bị chặn — chỉ hệ thống tính | |

**Kết quả trên 2 hồ sơ thật của bạn:**

```
Lê hữu trí   status=Hoàn thành  is_locked=True  has_legal=True
beoauibf     status=Hoàn thành  is_locked=True  has_legal=False
```

**Kiểm chứng:** ✅ 39/39 test backend · ✅ 26/26 test frontend

**Tự kiểm bằng trình duyệt thật:**
- Mở đúng 2 hồ sơ đang lệch → phải hiện **Hoàn thành**, không cần chạy lệnh vá nào
- Bấm Sửa trên hồ sơ đã đóng → nút không có ở đó
- Chụp màn hình 2 trang Đo vẽ / Pháp lý **cạnh nhau** để chắc chắn khoảng cách và bo góc giống tab Hợp đồng

**Xong đợt = ba lỗi trong tin nhắn của bạn đều hết** *(giật khi Sửa · khoá không đồng bộ · xong rồi vẫn "Đang thực hiện")*.

---

### ✅ ĐỢT 3 — Vòng đời hồ sơ pháp lý (node K06) — **ĐÃ XONG 13/08/2026**

| # | Việc | | Bằng chứng |
|---|---|:---:|---|
| 3.1 | 4 hành động: Tiếp nhận · Tạm dừng · Tiếp tục · Đóng hồ sơ | ✅ | `dossiers/legal_lifecycle.py` |
| 3.2 | Chặn bước nhảy sai; mỗi lần chuyển **ghi 1 dòng nhật ký** | ✅ | Bảng `_TRANSITIONS` + `legal_dossier_events` |
| 3.3 | **Thêm lần nộp mới** *(thay vai trò K07 cũ)* | ✅ | `POST /api/legal-dossiers/{id}/submissions` |
| 3.4 | Chuông *"Có hồ sơ mới từ bộ phận đo vẽ"* | ✅ | `_EMPLOYEE_LEGAL_DOSSIER_QUERY` — tính sống, không cần bảng |
| 3.5 | Bộ nút **dùng chung** | ✅ | `LegalDossierActions.jsx` — một component, hai chỗ gắn |
| 3.6 | **Vòng lặp ngược** khi bản vẽ sai ranh | ✅ | `reopen_survey_work()` → node đo vẽ về `rework_required` |
| **+** | 🔴 Sửa `now()` → `clock_timestamp()` | ✅ | `now()` đứng yên suốt giao dịch → KPI luôn bằng 0 |
| **+** | 🔴 Ô ngày để trống làm lưu hồ sơ lỗi 500 | ✅ | Chuỗi rỗng không ép được sang kiểu `date` |

**Kịch bản nghiệp vụ 16/16 — chạy trọn vòng đời:**

```
ASSIGNED ──Tiếp nhận──▶ PROCESSING ──Tạm dừng(Chờ đo vẽ)──▶ PENDING
                            ▲                                   │
                            └────────────Tiếp tục───────────────┘
                            │
                        Đóng hồ sơ
                            ▼
                         CLOSED
```

| | Kiểm | Kết quả |
|:---:|---|---|
| ✅ | Đóng hồ sơ khi chưa tiếp nhận | chặn 409 kèm gợi ý nút bấm được |
| ✅ | Tạm dừng không chọn lý do | chặn 400 |
| ✅ | Tạm dừng vì *bản vẽ sai ranh* | **đẩy ngược việc về đo vẽ** ⭐ |
| ✅ | Node đo vẽ chuyển *Cần làm lại* | nhân viên đo vẽ nhận chuông ngay |
| ✅ | Tiếp tục | giờ tạm dừng **được cộng dồn, trừ khỏi KPI** |
| ✅ | Nộp lại lần 2 | **2 dòng nộp, vẫn chỉ 1 hồ sơ** ⭐ |
| ✅ | Đóng hồ sơ không chọn kết quả | chặn 400 |
| ✅ | Nhật ký | ghi đủ 4 lần chuyển |

**Kiểm chứng:** ✅ 39/39 test backend · ✅ 26/26 test frontend · ✅ 16/16 bước kịch bản trên dữ liệu thật *(đã xoá sạch)*

**Tự kiểm:** chạy trọn kịch bản bằng trình duyệt với tài khoản pháp lý thật —
`ASSIGNED → PROCESSING → PENDING(Chờ đo vẽ) → đo vẽ sửa → PROCESSING → CLOSED`,
rồi đối chiếu bảng nhật ký ghi đủ 5 lần chuyển.

---

### ✅ ĐỢT 4 — Node bàn giao K08, 2 làn + Kế toán — **ĐÃ XONG 13/08/2026**

| # | Việc | | Bằng chứng |
|---|---|:---:|---|
| 4.1 | K08 **khoá** cho tới khi node Nộp đã đóng | ✅ | `submission_gate()` — *"Chờ đóng hồ sơ nộp cơ quan"* |
| 4.2 | Chia **2 làn**: A·Hiện vật · B·Tiền | ✅ | Làn A ở `execution_data`, làn B **tính sống** từ công nợ |
| 4.3 | Khối công nợ + danh sách đợt | ✅ | **Số đang chờ duyệt hiện riêng**, khỏi tưởng đã thu |
| 4.4 | Ghi nhận thanh toán, **ảnh bill bắt buộc** | ✅ | Không bill → chặn 400; phiếu vào *Chờ duyệt* |
| 4.5 | Hộp thoại **"Vẫn giao tài liệu?"** | ✅ | Không chặn — **ghi nhật ký ai bấm, còn thiếu bao nhiêu** |
| 4.6 | *"Thu đủ công nợ"* **tính sống** | ✅ | Chỉ đếm phiếu **đã duyệt** — phiếu khống không mở được cổng |
| 4.7 | Xong làn A → **mở khoá K09** ngay | ✅ | Việc lưu trữ không bị công nợ cầm chân |
| 4.8 | Màn hình Kế toán **"Đã giao — chưa thu đủ"** | ✅ | `GET /api/handover/outstanding` — tự sinh từ hồ sơ treo |
| ~~4.9~~ | ~~Giám đốc đóng hồ sơ "nợ xấu"~~ | ❌ | **BỎ HẲN** — nợ là nợ, không có cơ chế nào cho nó biến mất *(§4.2)* |
| **+** | Khung node đặc biệt trong sơ đồ | ✅ | K06 hiện vòng đời, K08 hiện cổng công nợ — nhận diện bằng **cờ** |
| **+** | 🔴 **Vá dữ liệu cũ cho khớp logic mới** | ✅ | 2 hồ sơ thiếu `legal_dossiers`, 1 cờ nộp nằm sai node |

**Kịch bản nghiệp vụ 26/26 — chạy trọn cổng công nợ trên dữ liệu thật:**

| | Bước | Kết quả |
|:---:|---|---|
| ✅ | Bàn giao khi hồ sơ nộp chưa đóng | chặn 409 |
| ✅ | Ghi nhận thu tiền **không ảnh bill** | chặn 400 |
| ✅ | Ghi nhận 18tr có bill | phiếu *Chờ duyệt*, **công nợ chưa đổi** ⭐ |
| ✅ | Bàn giao khi còn nợ, chưa xác nhận | chặn 409 |
| ✅ | Bấm *"Vẫn giao tài liệu"* | giao được → **mở khoá K09 ngay** ⭐ |
| ✅ | Làn A xong, làn B chưa | node **chưa đóng được** |
| ✅ | Hồ sơ vào **danh sách đòi nợ** | tự sinh, không phải dựng riêng |
| ✅ | Ghi nhận vượt quá công nợ | chặn 400 |
| ✅ | Thu nốt + sếp duyệt | làn B **tự xong**, node **đóng được** ⭐ |
| ✅ | Hết nợ | **biến khỏi** danh sách đòi nợ |

#### ❌ Vì sao bỏ hẳn mục "nợ xấu"

Tôi từng đề xuất cho giám đốc đóng hồ sơ kèm ghi chú *"nợ xấu"* làm lối thoát khi
khách xù nợ. **Đề xuất đó sai và đã bỏ.**

Nợ là nợ. Thêm một trạng thái để đóng hồ sơ mà chưa thu tiền chính là thêm một
đường tắt — làm vài lần thành thói quen, rồi công nợ biến mất khỏi tầm mắt. Đúng
cái bệnh mà cả 4 đợt này đang chữa.

**Khách bỏ hẳn thì dùng cơ chế đã có: huỷ quy trình.** Đã kiểm chứng:

```
Trước khi huỷ: còn nợ 15.000.000₫
Sau khi huỷ:   còn nợ 15.000.000₫   ·  quy trình = cancelled
⇒ Huỷ quy trình KHÔNG làm mất công nợ — nợ vẫn nguyên trong sổ
```

`cancel_workflow()` bắt buộc chọn nhóm lý do + ghi lý do tối thiểu 5 ký tự, giữ
nguyên minh chứng và tiền khoán đã kiếm được, và **không chạm vào bảng công nợ
một lần nào**. Đúng thứ cần, không phải dựng thêm gì.

> **Một hệ quả cần biết:** hồ sơ chưa thu đủ mà chưa huỷ thì **treo vô thời hạn** ở
> node bàn giao. Đó là chủ ý — danh sách treo chính là danh sách đòi nợ của kế toán.

**Tự kiểm — kịch bản đầy đủ, 3 tài khoản:**
1. NV bàn giao khi còn thiếu 6 triệu → hộp thoại hiện đúng số tiền
2. Bấm *Vẫn giao* → K09 **mở**, K08 **đỏ**, quy trình *Chưa hoàn thành*
3. Tiền khoán của NV **đã vào bảng lương** dù còn nợ
4. Kế toán nhập nốt 6 triệu + ảnh bill → phiếu *Chờ duyệt*, công nợ **chưa đổi**
5. Giám đốc duyệt → công nợ về 0 → K08 **tự xanh** → quy trình **Hoàn thành**, không ai bấm gì thêm

---

### Thứ tự và thời điểm bạn cần nhìn

```
ĐỢT 1 ──▶ ĐỢT 2 ──▶ ĐỢT 3 ──▶ ĐỢT 4
 nền móng   hết lỗi   vòng đời   bàn giao
 (SQL)      (UI)      hồ sơ      + kế toán
   │          │          │          │
   ▼          ▼          ▼          ▼
 tôi tự     bạn xem    bạn xem    bạn xem
 kiểm hết   1 lần      1 lần      1 lần
```

**Mỗi đợt tôi làm trọn rồi báo cáo kết quả đã tự kiểm** — bạn chỉ cần xem lại ở cuối đợt, không phải theo dõi giữa chừng.

### Việc gì tôi sẽ KHÔNG tự quyết

Vẫn hỏi bạn trước, dù có làm chậm:

- Xoá bất kỳ dữ liệu thật nào *(đã có tiền lệ xoá nhầm tài khoản thử của bạn)*
- Vá số liệu công nợ sau khi đối soát — in bảng cho bạn duyệt trước
- Đẩy code lên GitHub
- Bất cứ thứ gì hoá ra đắt hơn nhiều so với ước tính — báo ngay chứ không tự cắt bớt

## 5. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Đổi tên cột `gov_status` làm hỏng code đang chạy | Sửa đồng thời route + giao diện trong cùng một lượt; đã rà chỉ 1 route dùng cột này |
| Đổi mô hình trạng thái làm sai dữ liệu cũ | Chỉ có ít dòng thật; giữ nguyên `legacy_gov_status` để đối chiếu, không xoá |
| Tính sống làm chậm truy vấn | Chỉ thêm 1 phép kiểm tra trên bảng đã đánh index; danh sách phân trang 20 dòng |
| **Sửa thời điểm trừ công nợ (Đợt 1) làm lệch số liệu đang có** | Rà lại toàn bộ phiếu thu hiện tại: phiếu nào **chưa duyệt** mà đã trừ thì cộng hoàn lại. Chạy đối soát `receivables` trước/sau, in ra để bạn xem trước khi chốt |
| Dừng giữa chừng ở Đợt 1 (đã tạo bảng mới, chưa dùng) | Bảng mới **chạy song song**, cột cũ giữ nguyên → dừng lúc nào hệ thống vẫn chạy như cũ |

---

## 6. Logic thao tác giữa các node K05 → K09

### 6.1. Hai tầng khác nhau — đừng trộn vào nhau

| | Tầng **NODE** (đã có) | Tầng **HỒ SƠ** (đang xây) |
|---|---|---|
| Trả lời câu hỏi | *Ai đang làm khâu nào, khoán bao nhiêu?* | *Hồ sơ đang ở đâu với cơ quan nhà nước?* |
| Đơn vị | K05, K06, K07, K08, K09 | 1 hồ sơ chạy xuyên suốt cả 5 node |
| Chuyển bằng | Nghiệm thu (nhân viên nộp → quản lý duyệt) | Nhân viên pháp lý bấm nút |

**Vì sao phải có cả hai:** node **không diễn tả được** tình trạng tắc — trong cùng một node K06, hồ sơ có thể *đang đi nộp* hoặc *đang nằm chờ cơ quan cả tháng*. Ngược lại, trạng thái hồ sơ **không diễn tả được** ai làm và khoán bao nhiêu. Bỏ một trong hai đều mất thông tin.

### 6.2. ✅ ĐÃ CHỐT — Tách 2 bảng *(bạn đã duyệt: "tách bản")*

Mô tả K06 ghi rõ: *"**Mỗi lần nộp là một bản ghi riêng; không tạo hồ sơ mới**"*.

Đã kiểm tra DB: `legal_submissions` **không có ràng buộc duy nhất** theo node → đúng là đang cho phép nhiều lần nộp (khác `survey_records` có `UNIQUE(task_node_id)`).

Nhưng nếu gắn trạng thái máy (ASSIGNED…CLOSED) vào chính bảng đó thì **mỗi lần nộp lại mang một trạng thái riêng** — trong khi trạng thái là của **cả hồ sơ**. Nộp lần 3 mà lần 1 vẫn "PROCESSING" thì không ai đọc nổi.

**Đề xuất tách 2 bảng:**

```
legal_dossiers          1 dòng / 1 Hạng mục pháp lý
  ├─ trạng thái máy (ASSIGNED → PROCESSING ⇄ PENDING → CLOSED)
  ├─ người phụ trách, mốc thời gian KPI
  └─ legal_submissions   n dòng / 1 hồ sơ   ← đúng tinh thần K06
        số biên nhận · ngày nộp · ngày hẹn trả · kết quả lần đó · lý do nộp lại
```

Bảng `legal_submissions` hiện có **rất ít dòng thật**, nên tách bây giờ rẻ; để lâu, khi đã có hàng trăm lần nộp, việc tách sẽ đắt và rủi ro.

→ Thực hiện ở **Đợt 1** (mục 1.3).

### 6.3. Ánh xạ node ↔ trạng thái hồ sơ

> **Đính chính quan trọng:** "Đóng hồ sơ nộp" **không phải** là điểm kết thúc quy trình.
> Nó là **cửa khoá**: phải đóng xong hồ sơ ở cơ quan thì node **Bàn giao & lưu trữ** mới mở ra.
> Quy trình chỉ thật sự xong khi **K08/K09 được nghiệm thu**.

| Node | Tình huống | Trạng thái hồ sơ nộp |
|---|---|---|
| — | Đo vẽ xong, bàn giao, chưa ai nhận | **ASSIGNED** |
| **K05** Soạn bộ hồ sơ | Đang làm nội bộ | **PROCESSING** |
| **K06** Nộp & theo dõi | Vừa nộp, chờ cơ quan xử lý | **PENDING – Agency** |
| **K06** Bị đòi bổ sung giấy tờ | (bỏ K07 — xem §6.6) | **PENDING – Agency** |
| **K06** Trả vì **bản vẽ sai ranh** | | **PENDING – Surveyor** → đẩy ngược đo vẽ |
| **K06** Đã có kết quả từ cơ quan | Pháp lý bấm **Đóng hồ sơ nộp** | **CLOSED – Done / Rejected** |
| ⬇ | **← Đóng xong mới mở được node kế** | |
| **K08** Nhận kết quả & bàn giao | Đi nhận, bàn giao khách, cập nhật công nợ | — |
| **K09** Lưu trữ & đóng | Chuẩn hoá file, lưu trữ | — |
| ✅ | **K08/K09 nghiệm thu → QUY TRÌNH XONG** | |

### 6.4. Ai điều khiển cái gì

- **Node** chuyển bằng cơ chế nghiệm thu **đã có sẵn** — không đụng vào.
- **Pause / Resume** do nhân viên pháp lý bấm, vì node không biết hồ sơ đang tắc.
- **Đóng hồ sơ nộp** do pháp lý bấm ở **K06**, khi đã có kết quả từ cơ quan (lấy được, hoặc bị bác).
  → Đây là **điều kiện mở khoá** node Bàn giao. Chưa đóng thì K08 **không được phép bắt đầu**.
- **Kết thúc quy trình** = node cuối (**K09**, hoặc **K08** nếu quy trình không có K09 — mô tả K09 ghi *"thường gộp trong K08"*) được nghiệm thu.

**Hai khái niệm "đóng" khác nhau, tuyệt đối không trộn:**

| | Đóng hồ sơ nộp | Kết thúc quy trình |
|---|---|---|
| Ai bấm | Nhân viên pháp lý | Giám đốc (duyệt nghiệm thu node cuối) |
| Ở đâu | K06 | K08 / K09 |
| Nghĩa là | Xong việc với **cơ quan nhà nước** | Xong việc với **khách hàng** |
| Kéo theo | Mở khoá node Bàn giao | Hồ sơ Đo vẽ → *Hoàn thành*; khoá sửa toàn bộ |

### 6.5. Ba quy tắc rút thẳng từ mô tả node — phải cài vào hệ thống

1. **K06 — nộp lại không tạo hồ sơ mới.** Nút "Nộp lại" thêm một dòng lần nộp, **giữ nguyên** hồ sơ và mọi lịch sử. (Thiết kế hiện tại đã có sẵn `is_first_submission` và `previous_submission_id` cho việc này.)

2. **K07 — nộp lại do lỗi nội bộ thì KHÔNG tính thêm khoán.** Cần bắt buộc chọn nguyên nhân khi nộp lại:
   - *Do khách / cơ quan thay đổi* → được tính phụ trội
   - *Do lỗi nội bộ* → **không** sinh khoán, và bắt buộc ghi nguyên nhân

   Đây là ràng buộc **về tiền** — nếu bỏ qua, công ty trả khoán cho chính lỗi của mình.

3. **K08 — không cho đóng hồ sơ khi chưa đủ điều kiện.** Mô tả ghi: *"chỉ hoàn thành khi đủ file, bàn giao và đạt điều kiện công nợ"*. Vậy nút **Close – Done** phải bị chặn nếu thiếu một trong ba: file kết quả · xác nhận bàn giao · công nợ đạt ngưỡng.
   → **Cần bạn chốt ngưỡng công nợ**: phải thu đủ 100% mới cho đóng, hay cho đóng khi còn nợ nhưng có cảnh báo?

### 6.6. ✅ ĐÃ CHỐT — Bỏ K07 *(bạn đã duyệt: "bỏ k07")*

Đối chiếu kỹ, **K07 diễn tả lại đúng thứ mà hai cơ chế khác đã diễn tả rồi**:

| Tình huống "bị trả, bổ sung, nộp lại" đang được thể hiện ở | |
|---|---|
| **Trạng thái hồ sơ** | `PENDING – Agency` (cơ quan đòi bổ sung) → `Resume` → `PROCESSING` |
| **Bảng lần nộp** | K06 đã ghi: *"mỗi lần nộp là một bản ghi riêng; không tạo hồ sơ mới"* |
| **Node K07** | ...lại diễn tả **cùng chuyện đó** lần thứ ba |

Việc làm của K07 — *phân tích yêu cầu, chỉnh hồ sơ, nộp lại, lưu biên nhận mới* — thực chất là **làm lại K05 + K06**, không phải một khâu mới.

**Vì sao đây là vấn đề thật, không phải bắt bẻ:** để hai nơi cùng mô tả một sự thật chính là **nguyên nhân của lỗi đang gặp** (§1.1 — trạng thái lưu một đằng, cảnh báo tính một nẻo). Nếu giữ K07, hệ thống sẽ có hai câu trả lời cho câu hỏi *"hồ sơ có đang bổ sung không?"*: node đang ở K07, và trạng thái đang `PENDING – Agency`. Hai cái này **chắc chắn sẽ lệch nhau**, chỉ là sớm hay muộn.

**Nhưng K07 có một lý do tồn tại chính đáng: tiền khoán.** Trong hệ thống này, khoán gắn vào **checklist của node**. Bỏ K07 thì khoản *phụ trội khi bổ sung do khách/cơ quan* không còn chỗ tự nhiên để bám vào.

**Đề xuất: bỏ K07 khỏi quy trình, chuyển 3 việc của nó về đúng chỗ**

| Việc của K07 | Chuyển về |
|---|---|
| Đánh dấu "đang bổ sung" | Trạng thái `PENDING – Agency` / `PENDING – Surveyor` (đã có) |
| Ghi lần nộp mới + biên nhận mới | Thêm 1 dòng `legal_submissions` (đúng tinh thần K06) |
| Khoán phụ trội khi đủ điều kiện | `employee_pay_adjustments` — có lý do, có người duyệt, có dấu vết |

Cách này còn xử lý gọn hơn chính quy tắc của K07: *"nộp lại do lỗi nội bộ không tính thêm khoán"*. Một node mà **lúc sinh tiền lúc không** là thiết kế khó kiểm soát; còn một khoản điều chỉnh **chỉ được tạo khi có người duyệt** thì mặc định đã an toàn — không ai duyệt thì không có tiền.

→ Thực hiện: **Đợt 3** (mục 3.3 — thêm lần nộp mới) thay thế hoàn toàn vai trò của K07.
→ **Không xoá node K07 khỏi thư viện mẫu**: chỉ bỏ khỏi các quy trình mẫu mới. Quy trình cũ đang chạy có K07 vẫn hoạt động bình thường, không phá dữ liệu.

### 6.7. K06 là node ĐẶC BIỆT — khác cả dữ liệu lẫn giao diện

**Mọi node khác đều một chiều:** bắt đầu → làm → nộp nghiệm thu → duyệt. Một lượt là xong.

**K06 thì không:** nộp → chờ cơ quan hàng tuần/hàng tháng → có thể bị trả → nộp lại (nhiều lần) → mới đóng được. Nó mang theo những thứ không node nào khác có:

| | Node thường | Node "nộp cơ quan" |
|---|---|---|
| Vòng đời | 1 chiều | Có **vòng lặp** (nộp lại nhiều lần) |
| Thời gian chờ | Ngắn, do mình chủ động | Dài, **do bên ngoài quyết định** |
| Bản ghi con | Không | **n lần nộp** — mỗi lần 1 biên nhận, 1 ngày hẹn trả |
| Trạng thái | Theo node (sẵn sàng/đang làm/…) | Thêm **trạng thái riêng** (đang chờ cơ quan / chờ đo vẽ / chờ nội bộ) |
| KPI | Đếm thẳng | **Đóng băng** khi tắc do bên ngoài |
| Ảnh hưởng node sau | Nghiệm thu là mở | **Phải đóng hồ sơ** thì node sau mới mở |

#### Nguyên tắc: đánh dấu bằng CỜ, không viết cứng "K06"

Hệ thống **không được** dò theo mã `K06`. Lý do: công ty có thể đổi tên bước, hoặc có **nhiều bước nộp** trong cùng quy trình (nộp hồ sơ, nộp thuế, nộp bổ sung ở cơ quan khác).

→ Dùng đúng **cờ `requires_gov_submission`** đã có sẵn trong thiết kế node. Node nào bật cờ thì tự động trở thành node đặc biệt. Giám đốc tự quyết bước nào là bước nộp, không phụ thuộc mã.

#### Khác về dữ liệu

```
service_line (Hạng mục pháp lý)
   └─ legal_dossiers          1 dòng — trạng thái máy chạy xuyên K05→K06
        ├─ ASSIGNED → PROCESSING ⇄ PENDING → CLOSED
        └─ legal_submissions   n dòng — GẮN VÀO NODE CÓ CỜ
             số biên nhận · ngày nộp · ngày hẹn trả · kết quả · lý do nộp lại
```

- **Trạng thái hồ sơ** thuộc về **Hạng mục** — vì nó bắt đầu từ lúc đo vẽ bàn giao (trước cả K05).
- **Các lần nộp** thuộc về **node có cờ** — vì biên nhận chỉ sinh ra ở bước nộp.
- **Cửa khoá**: node kế sau node-có-cờ chỉ mở khi hồ sơ đã `CLOSED`.

#### Khác về giao diện — 3 chỗ

**① Trên sơ đồ quy trình (giám đốc nhìn)**
Node có cờ hiện khác hẳn: viền/nhãn riêng + trạng thái sống ngay trên thẻ node.
```
┌────────────────────────┐      ┌────────────────────────┐
│ K05  Soạn hồ sơ        │      │ K06  Nộp hồ sơ    🏛    │
│ ● Đang làm             │      │ ⏸ Chờ cơ quan · 12 ngày│
│ 1 mục · 1 người        │      │ Biên nhận: H29.147-…   │
└────────────────────────┘      │ Hẹn trả: 25/08         │
        node thường             └────────────────────────┘
                                   node đặc biệt
```

**② Khung bên phải khi chọn node (giám đốc)**
Node có cờ được thêm một thẻ nữa: **"Hồ sơ nộp"** — trạng thái hiện tại, lịch sử các lần nộp, ai đang giữ, tắc bao lâu.

**③ Trong lịch làm việc (nhân viên pháp lý bấm)**
Bộ nút **hoàn toàn khác** node thường:

| Node thường | Node có cờ |
|---|---|
| `[Bắt đầu làm]` | `[Tiếp nhận]` |
| `[Nộp nghiệm thu]` | `[Nhập biên nhận]` · `[Tạm dừng ▾]` · `[Tiếp tục]` · `[Đóng hồ sơ nộp]` |
| | rồi mới tới `[Nộp nghiệm thu]` |

Kèm hiển thị: đang tắc vì lý do gì, bao lâu rồi, ngày hẹn trả sắp tớ
danh sách các lần đã nộp.

**④ Node kế bị khoá**
Node Bàn giao hiện rõ trạng thái *"Chờ đóng hồ sơ nộp"* kèm biểu tượng khoá, không cho bấm Bắt đầu — thay vì im lặng không làm gì khiến nhân viên tưởng hỏng.

### 6.8. K08 cũng là node ĐẶC BIỆT — nhưng đặc biệt kiểu khác

K06 đặc biệt vì **thời gian** (chờ bên ngoài). K08 đặc biệt vì **tiền** — nó là **cổng tài chính** cuối cùng trước khi giao kết quả cho khách.

> **Phạm vi áp dụng: CẢ HAI phân hệ.** Không riêng pháp lý.
> Hạng mục **đo vẽ thuần** (không kèm pháp lý) cũng phải qua K08 mới đóng được — vì vẫn có sản phẩm giao cho khách và vẫn có công nợ phải thu.
> Khác nhau duy nhất: hạng mục đo vẽ **không có khoản chi hộ nhà nước** (điều kiện ② bên dưới bỏ trống), còn cổng công nợ và ảnh bill thì **giống hệt**.

| Loại hạng mục | Đường đi tới lúc đóng |
|---|---|
| Đo vẽ thuần | K01 → … → **K08 Bàn giao** → ✅ |
| Đo vẽ có kèm pháp lý | K01 → … → **K08 Bàn giao** → ✅ *(xong phần đo vẽ)* |
| Pháp lý | K05 → **K06 Nộp** *(phải đóng)* → **K08 Bàn giao** → ✅ |

**Ba điều kiện phải đủ thì mới được bàn giao:**

| # | Điều kiện | Ý nghĩa |
|---|---|---|
| 1 | Đủ **file kết quả** + xác nhận bàn giao | Có sổ/giấy phép/bản vẽ, đã scan lưu, khách ký nhận |
| 2 | Kê khai **tiền đã đóng cho nhà nước** + **minh chứng** | Lệ phí, thuế nhân viên đã chi hộ — phải có biên lai *(chỉ pháp lý; đo vẽ thuần bỏ qua)* |
| 3 | Khách đã thanh toán **100%** giá trị hợp đồng | Chưa đủ thì cảnh báo; giám đốc **được châm chước** kèm lý do — **áp cho cả 2 phân hệ** |

Sau đó **sếp duyệt** nghiệm thu thì node mới đóng.

#### ✅ Tin tốt: cơ chế này **đã được xây sẵn**, không cần dựng mới

Đã rà code và DB. Bảng `cashflow_transactions` **đã có đủ mọi thứ** cần cho việc *"ghi số tiền khách đưa + chụp bill + sếp duyệt + tự trừ công nợ"*:

| Việc cần | Đã có sẵn |
|---|---|
| Số tiền khách đưa | `amount` |
| **Ảnh bill / biên lai** | `receipt_attachment_url` |
| Ai đưa, hình thức nào | `payer_payee_name`, `payment_method` |
| Ngày thu | `transaction_date` |
| Ai nhập · **ai duyệt** · trạng thái duyệt | `created_by_user_id`, `approved_by_user_id`, `status` |
| Tiền **chi hộ** nhà nước | `is_pass_through_fee` |
| Gắn hợp đồng | `contract_id` |

Và **tự động trừ công nợ cũng đã chạy** (`finance/services.py`):
- Ghi nhận thu tiền → cộng `receivables.paid_amount`, trừ `remaining_amount`
- Có sẵn **chặn nhập vượt quá công nợ còn lại**

→ **Thu nhiều đợt** cũng đã hỗ trợ sẵn: mỗi đợt là một giao dịch, cộng dồn dần cho tới khi hết nợ. Lịch sử các đợt chính là danh sách giao dịch của hợp đồng.

#### Vậy chỉ còn phải làm: NỐI vào node, không dựng lại

1. **Nút "Ghi nhận thanh toán"** ngay tại node bàn giao → mở form nhỏ: số tiền · ảnh bill · hình thức · ghi chú → ghi thẳng vào bảng thu chi đã có.
2. **Khối tóm tắt công nợ** hiện ngay trên node: giá trị HĐ · đã thu · còn thiếu · các đợt đã thu.
3. **Cảnh báo khi chưa đủ** — không khoá cứng:

```
┌─ Công nợ hợp đồng ─────────────────────────────────────┐
│  Giá trị 24.000.000₫ · Đã thu 18.000.000₫ (75%)        │
│  ⚠️ Còn thiếu 6.000.000₫                                │
│  Đợt đã thu:  05/08  10.000.000₫ 📎   ·  11/08  8.000.000₫ 📎
│  [ ➕ Ghi nhận thanh toán ]                             │
└────────────────────────────────────────────────────────┘
```

4. **Giám đốc châm chước được** — vẫn duyệt nghiệm thu khi chưa đủ 100%, nhưng:
   - Phải **ghi lý do** châm chước
   - Hồ sơ **giữ cảnh báo nợ** cho tới khi thu đủ (không tự xoá khi đóng hồ sơ)

> Đây là điểm khác so với bản nháp trước của tôi: **không chặn cứng**. Thực tế có ca khách thiếu vài trăm nghìn mà hồ sơ phải giao gấp — chặn cứng sẽ khiến nhân viên tìm đường lách, còn tệ hơn.

#### Tóm lại: hai node đặc biệt, hai lý do khác nhau

| | **K06** Nộp & theo dõi | **K08** Nhận kết quả & bàn giao |
|---|---|---|
| Đặc biệt vì | **Thời gian** — chờ bên ngoài, không kiểm soát được | **Tiền** — cổng chặn tài chính |
| Dữ liệu thêm | n lần nộp · biên nhận · ngày hẹn trả | khoản chi hộ · biên lai · đối soát công nợ |
| Chặn gì | Chưa đóng hồ sơ → node sau không mở | Chưa thu đủ 100% → không cho nghiệm thu |
| Nút riêng | Tiếp nhận · Tạm dừng · Tiếp tục · Đóng | Thêm khoản chi hộ · Xác nhận bàn giao |

Cả hai đều nhận diện bằng **cờ trên node**, không viết cứng mã — vì công ty có thể đổi tên bước hoặc có nhiều bước nộp/bàn giao.

### 6.9. Đặc tả trạng thái đầy đủ cho 2 node khó

#### A. Node NỘP CƠ QUAN (K06) — có máy trạng thái riêng

| Trạng thái | Hiện trên màn hình | Nút nhân viên pháp lý thấy | KPI |
|---|---|---|---|
| `ASSIGNED` | Chờ tiếp nhận | **Tiếp nhận** | ⏸ chưa chạy |
| `PROCESSING` | Đang xử lý | Nhập biên nhận · **Tạm dừng ▾** · **Đóng hồ sơ** | ▶ chạy |
| `PENDING_AGENCY` | Chờ cơ quan · *n* ngày | **Tiếp tục** | ⏸ đóng băng |
| `PENDING_SURVEYOR` | Chờ đo vẽ sửa bản vẽ | **Tiếp tục** *(mở khi đo vẽ báo xong)* | ⏸ đóng băng |
| `PENDING_INTERNAL` | Chờ nội bộ | **Tiếp tục** | ⏸ đóng băng |
| `CLOSED_DONE` | Đã có kết quả | — *(chỉ xem)* | ⏹ dừng |
| `CLOSED_REJECTED` | Bị bác | — *(chỉ xem)* | ⏹ dừng |

**Bảng chuyển trạng thái**

| Từ | Bấm | Sang | Điều kiện bắt buộc | Hệ quả |
|---|---|---|---|---|
| `ASSIGNED` | Tiếp nhận | `PROCESSING` | — | Bắt đầu đếm KPI · ghi nhật ký |
| `PROCESSING` | Tạm dừng | `PENDING_*` | **Phải chọn 1 lý do** | Đóng băng KPI · nếu là *Surveyor* → mở lại việc cho đo vẽ + bắn chuông |
| `PENDING_*` | Tiếp tục | `PROCESSING` | — | Chạy lại KPI |
| `PROCESSING` | Đóng hồ sơ | `CLOSED_*` | **Phải có ≥1 lần nộp** (có biên nhận) · chọn kết quả · nếu *Bị bác* phải ghi lý do | **Mở khoá node Bàn giao** · khoá sửa hồ sơ |
| bất kỳ | (không có) | quay ngược | — | **Không cho quay lại** sau khi đã đóng |

**Việc riêng ở trạng thái `PROCESSING`:** thêm **lần nộp mới** (mỗi lần = 1 biên nhận + ngày hẹn trả). Nộp lại **không** tạo hồ sơ mới, chỉ thêm một dòng — và **bắt buộc chọn nguyên nhân**: *do khách/cơ quan* (được tính phụ trội) hay *do lỗi nội bộ* (không tính thêm khoán).

---

#### B. Node BÀN GIAO (K08) — dùng lại trạng thái node có sẵn, chỉ thêm 2 thứ

> **Điểm nhẹ nhõm:** K08 **không cần máy trạng thái riêng**. Nó chạy đúng vòng đời node đã có (Sẵn sàng → Đang làm → Chờ duyệt → Hoàn thành). Chỉ thêm **1 điều kiện khoá** và **1 khối tiền**.

| Trạng thái | Khi nào | Nút thấy được |
|---|---|---|
| 🔒 **Chờ mở khoá** | Node nộp **chưa đóng** | Không bấm được — hiện *"Chờ đóng hồ sơ nộp"* |
| **Sẵn sàng** | Node nộp **đã đóng** | Bắt đầu làm |
| **Đang làm** | Đã bắt đầu | **Ghi nhận đợt thanh toán** (số tiền + ảnh bill) · Tải file kết quả · Xác nhận bàn giao · **Nộp nghiệm thu** |
| **Chờ duyệt** | Đã nộp nghiệm thu | — *(chờ giám đốc)* |
| **Hoàn thành** | Giám đốc duyệt | — → ✅ **QUY TRÌNH XONG** |

**Hai thứ thêm vào:**

**① Điều kiện khoá** — node chỉ mở khi node nộp đã `CLOSED_DONE` hoặc `CLOSED_REJECTED`.
*(Bị bác vẫn phải bàn giao — trả lại giấy tờ gốc và thông báo khách.)*

**② Khối công nợ — nhân viên nhập ngay trong node, từng đợt, gửi sếp duyệt**

Nhân viên **tự tay ghi số tiền** khách đưa + **đính ảnh bill**, ngay tại node bàn giao. Mỗi đợt là một phiếu thu gửi sếp duyệt.

```
┌─ Công nợ hợp đồng ─────────────────────────────────────┐
│  Giá trị 24.000.000₫ · Đã thu 18.000.000₫ (75%)        │
│  ⚠️ Còn thiếu 6.000.000₫                                │
│ ───────────────────────────────────────────────────────│
│  Các đợt đã ghi nhận                                    │
│   05/08   10.000.000₫  📎 bill   ✅ Sếp đã duyệt        │
│   11/08    8.000.000₫  📎 bill   ✅ Sếp đã duyệt        │
│   12/08    6.000.000₫  📎 bill   ⏳ Chờ sếp duyệt       │
│ ───────────────────────────────────────────────────────│
│  [ ➕ Ghi nhận đợt thanh toán ]                          │
└────────────────────────────────────────────────────────┘
```

**Form ghi nhận một đợt:** số tiền · **ảnh bill (bắt buộc)** · ngày thu · hình thức (tiền mặt / chuyển khoản) · ghi chú
→ Tạo phiếu thu trạng thái **"Chờ duyệt"** → sếp duyệt → **lúc đó mới trừ công nợ**.

> ### 🔴 Lỗi phát hiện khi rà: công nợ đang bị trừ SAI THỜI ĐIỂM
>
> Trong `finance/services.py`, khi tạo phiếu **Thu**, hệ thống gọi trừ công nợ **ngay lập tức** — **không kiểm tra phiếu đã được duyệt hay chưa**:
>
> ```python
> tx_status = "Chờ duyệt" if creator != approver else "Hoàn thành"
> ...
> if payload.type == "Thu" and contract_id:
>     FinanceService._sync_receivables(db, contract_id, payload.amount)   # ← không xét trạng thái
> ```
>
> **Hậu quả:** nhân viên gõ 10 triệu là công nợ **giảm ngay 10 triệu**, dù sếp chưa duyệt. Nghĩa là có thể **xoá sạch công nợ trên hệ thống mà không cần ai phê duyệt** — rồi node bàn giao hết cảnh báo, hồ sơ được giao đi trong khi tiền chưa thực sự về.
>
> **Bắt buộc sửa cùng đợt này:** chỉ trừ công nợ khi phiếu chuyển sang **đã duyệt**; phiếu bị từ chối hoặc huỷ thì hoàn lại. Nếu không, toàn bộ cơ chế "sếp duyệt" chỉ là hình thức.

**Cảnh báo, không chặn:** còn nợ thì hiện cảnh báo đỏ; giám đốc vẫn duyệt nghiệm thu được nhưng **phải ghi lý do châm chước**, và cảnh báo nợ **vẫn giữ** sau khi đóng cho tới khi thu đủ.

---

#### C. Hai node ảnh hưởng nhau thế nào

```
NODE NỘP (K06)                          NODE BÀN GIAO (K08)
─────────────────                       ───────────────────
ASSIGNED
   ↓ Tiếp nhận
PROCESSING ⇄ PENDING(3 lý do)           🔒 Chờ mở khoá
   ↓ Đóng hồ sơ ──────────────────────▶ Sẵn sàng
CLOSED                                     ↓ Bắt đầu làm
                                        Đang làm
                                           ↓ đủ file + bàn giao (+ cảnh báo nợ nếu thiếu)
                                        Chờ duyệt
                                           ↓ Giám đốc duyệt
                                        ✅ QUY TRÌNH XONG
                                           → Hồ sơ Đo vẽ: "Hoàn thành"
                                           → Khoá sửa cả 2 phân hệ
```

**Trường hợp `PENDING_SURVEYOR` — vòng lặp ngược duy nhất:**

```
Node nộp: PROCESSING ──Tạm dừng (bản vẽ sai ranh)──▶ PENDING_SURVEYOR
                                                          │
                          ┌───────────────────────────────┘
                          ▼
   Việc đo vẽ mở lại (Cần làm lại) + chuông cho NV đo vẽ
                          │ đo lại, nộp minh chứng mới, nộp nghiệm thu
                          ▼
   Giám đốc duyệt ──▶ chuông cho NV pháp lý ──▶ bấm Tiếp tục ──▶ PROCESSING
```

Đây là **cơ chế vòng lặp duy nhất** trong hệ thống — lý do đã bỏ K07 (§6.6): có hai vòng lặp song song thì chắc chắn lệch nhau.

---

### 6.10. 🚨 Chuẩn hoá danh mục node — phát hiện nghiêm trọng

#### Vấn đề: đang tồn tại HAI danh mục node khác nhau, dùng CHUNG một bộ mã

Đã đối chiếu bảng `workflow_nodes` trong CSDL với danh mục bạn đưa. **Cùng mã, khác nghĩa:**

| Mã | Trong CSDL *(đang chạy)* | Trong đặc tả *(bạn đưa)* | |
|---|---|---|---|
| K01 | Tiếp nhận hồ sơ | Tiếp nhận & kiểm tra đầu vào | ~ giống |
| K02 | Khảo sát & đo hiện trường | Khảo sát & đo hiện trường | ✅ khớp |
| K03 | Xử lý nội nghiệp | Xử lý số liệu & bản vẽ | ~ giống |
| **K04** | **Kiểm tra pháp lý** | **Thiết kế/kiểm định chuyên môn** | ❌ **khác hẳn** |
| K05 | Hoàn thiện hồ sơ | Soạn bộ hồ sơ pháp lý | ~ giống |
| K06 | Nộp hồ sơ | Nộp **& theo dõi** hồ sơ | ❌ lệch phạm vi |
| **K07** | **Theo dõi hồ sơ** | **Bổ sung, chỉnh sửa & nộp lại** | ❌ **khác hẳn** |
| **K08** | **Nhận kết quả** | **Nhận kết quả & bàn giao** | ❌ lệch phạm vi |
| **K09** | **Bàn giao & lưu trữ** | **Lưu trữ & đóng hồ sơ** | ❌ lệch phạm vi |

**Hậu quả cụ thể, không phải lý thuyết:** cả plan này lẫn các mô tả trước đều nói *"K08 là node bàn giao, là cổng công nợ"*.
Nhưng trong CSDL, **node bàn giao là K09**, còn **K08 chỉ là "nhận kết quả"**.
Nếu cứ thế mà code, cổng công nợ sẽ được gắn vào **một node mà không quy trình nào đang dùng** — hệ thống chạy êm ru mà cổng chặn không bao giờ kích hoạt. Đây là loại lỗi im lặng, khó phát hiện nhất.

#### Tin tốt: sửa bây giờ gần như miễn phí

Đếm số node đã thực sự sinh ra trong công việc thật (`task_nodes`):

| Mã | Số node thật | Đã chạy |
|---|---|---|
| K01 | 6 | 6 |
| K02 | 6 | 6 |
| K06 | 1 | 1 |
| K09 | 6 | 6 |
| **K03, K04, K05, K07, K08** | **0** | **0** |

→ **5 mã bạn muốn đụng tới chưa từng phát sinh dữ liệu nào.** Bỏ hay đổi tên lúc này không mất gì. Để lâu, mỗi mã sẽ kéo theo hàng trăm node thật.

#### Danh mục chuẩn — 7 node

Bỏ K04, bỏ K07, giữa K02 và K05 chỉ còn **một** node chuẩn hoá tài liệu kỹ thuật:

| Mã | Tên chuẩn | Phân hệ | Vai trò |
|---|---|---|---|
| **K01** | Tiếp nhận & kiểm tra đầu vào | Chung | Nhận yêu cầu, kiểm giấy tờ |
| **K02** | Khảo sát & đo hiện trường | Đo vẽ | Ra hiện trường |
| **K03** | **Chuẩn hoá tài liệu kỹ thuật** | Đo vẽ | ⭐ **Mốc bàn giao đo vẽ → pháp lý** |
| **K05** | Soạn bộ hồ sơ pháp lý | Pháp lý | Gom giấy tờ, soạn đơn |
| **K06** | Nộp & theo dõi hồ sơ | Pháp lý | ⭐ **Node đặc biệt: máy trạng thái** |
| **K08** | Nhận kết quả & bàn giao | Pháp lý **+ Kế toán** | ⭐ **Node đặc biệt: cổng công nợ, 2 làn** |
| **K09** | Lưu trữ & đóng hồ sơ | Chung | Chuẩn hoá tên file, lưu Drive |

**Bỏ hẳn: K04 · K07.**

> **Vì sao K03 gộp cả "xử lý số liệu" lẫn "kiểm định"?**
> Đây chính là **điểm giao giữa hai phòng ban**: đo vẽ biến số liệu thô thành sản phẩm kỹ thuật đúng chuẩn, rồi pháp lý mới nhặt lên dùng.
> Trong hệ thống, thời điểm **nghiệm thu K03** chính là lúc hồ sơ đo vẽ chuyển sang *"Đã bàn giao"* (§2.2). Một mốc, một node, một sự thật.

> **Vì sao K08 và K09 KHÔNG gộp?** *(đảo lại đề xuất trước của tôi — xem §6.11)*
> Vì hai node **phục vụ hai chủ khác nhau**: K08 là nơi **tiền** về, K09 là nơi **file** về.
> Tiền có thể về trễ, nhưng file thì không nên chờ tiền. Gộp lại thì công nợ chưa đủ sẽ **khoá luôn việc lưu trữ** — chặn một việc nội bộ vô can.

> **Vì sao lỗ hổng K04/K07 để trống?**
> Mã là *định danh*, không phải *số thứ tự*. Để trống vĩnh viễn chính là lời nhắc "2 mã này đã bỏ, đừng tái sử dụng cho việc khác" — tái dùng mã cũ là cách chắc chắn nhất để lẫn dữ liệu cũ với mới.
> Riêng **K09 giữ nguyên mã** vì đang có 6 node thật + cả 4 quy trình mẫu trỏ vào → **không phải di trú dữ liệu nào**. Chỉ đổi tên từ *"Bàn giao & lưu trữ"* thành *"Lưu trữ & đóng hồ sơ"*, và phần bàn giao tách ra K08.

#### Ảnh hưởng tới 4 quy trình mẫu

| Quy trình mẫu | Hiện tại | Sau chuẩn hoá |
|---|---|---|
| Đo vẽ nhà (không nộp) | K01 → K02 → K03 → K09 | K01→K02→K03→**K08**→K09 |
| Đo vẽ có hỗ trợ nộp | K01→K02→K03→K05→K06→**K07**→K08→K09 | K01→K02→K03→K05→K06→K08→K09 |
| Pháp lý có hồ sơ | K01→**K04**→K05→K06→**K07**→K08→K09 | K01→K05→K06→K08→K09 |
| Pháp lý không hồ sơ | K01→K02→K03→**K04**→K05→K06→**K07**→K08→K09 | K01→K02→K03→K05→K06→K08→K09 |

**Không mẫu nào mất bước nghiệp vụ** — việc của K04/K07 đã có chỗ mới:

| Việc cũ | Chuyển về |
|---|---|
| K04 Kiểm tra pháp lý / kiểm định | Checklist của **K03** (đo vẽ tự kiểm) + **K05** (pháp lý rà quy hoạch) |
| K07 Theo dõi hồ sơ | Trạng thái `PROCESSING`/`PENDING` **bên trong K06** (§6.7) |

> ⚠️ *Đo vẽ nhà (không nộp)* là mẫu duy nhất **thêm** node — hiện đang thiếu bước bàn giao, tức là **đang không có cổng công nợ nào cả**. Đây chính là lỗ hổng §2.2 đã nêu.

#### ⚠️ Bắt buộc kèm theo: bỏ nhận diện node bằng mã viết cứng

Hiện trong `routes_contracts.py:117` đang viết cứng:

```python
if definition.get("requires_gov_submission") or node_code in {"K04","K05","K06","K07","K08"}:
    return "legal"
if definition.get("creates_survey_record") or node_code in {"K02","K03"}:
    return "survey"
```

Chuẩn hoá danh mục xong mà để nguyên đoạn này thì hệ thống lại có **hai nguồn sự thật** — đúng cái bệnh đang chữa. Phải thay bằng **cờ trên node**:

| Cờ | Nghĩa | Trạng thái |
|---|---|---|
| `creates_survey_record` | Node đo vẽ → sinh hồ sơ Đo vẽ | ✅ đã có |
| `requires_gov_submission` | Node nộp cơ quan → máy trạng thái | ✅ đã có |
| `is_handover` | **Node bàn giao → cổng công nợ** | ❌ **cần thêm** |

Có cờ rồi thì công ty đổi tên bước, thêm bước, đổi mã — hệ thống vẫn nhận đúng.

---

### 6.11. Node K08 — "giao trước, đóng sau", chia 2 làn cho Pháp lý và Kế toán

#### Thay đổi so với bản trước

| | Bản 3 *(cũ)* | Bản 4 *(mới — theo ý bạn)* |
|---|---|---|
| Chưa thu đủ tiền | **Chặn** nghiệm thu; giám đốc châm chước kèm lý do | **Không chặn** — hỏi xác nhận rồi cho giao |
| Ai gánh quyết định | Giám đốc phải "tha" từng ca | **Không ai phải tha** — nợ tự treo cho tới khi thu đủ |
| Việc lưu trữ | Bị khoá theo công nợ | **Vẫn chạy bình thường** |
| Node bàn giao | Gộp chung K09 | **Tách riêng K08** |

**Vì sao bản mới tốt hơn:** cơ chế châm chước bắt giám đốc phải ra một *quyết định miễn trừ* cho từng ca — làm nhiều lần thì thành thói quen bấm cho xong, và công nợ biến mất khỏi tầm mắt. Còn cách này **không cần ai miễn trừ gì cả**: hồ sơ cứ treo ở "chưa hoàn thành" cho tới khi tiền về đủ, rồi **tự đóng**. Không có đường tắt nào để làm nó biến mất.

#### Luồng khi nhân viên bấm "Bàn giao cho khách"

```
┌─ ⚠️ Xác nhận bàn giao ────────────────────────────────┐
│                                                       │
│  Hợp đồng HĐ-2026-014 · Nguyễn Văn B                  │
│                                                       │
│  Giá trị       24.000.000 ₫                           │
│  Đã thu        18.000.000 ₫  (75%)                    │
│  ❗ Còn thiếu    6.000.000 ₫                           │
│                                                       │
│  Bạn có chắc giao tài liệu cho khách khi CHƯA thu     │
│  đủ tiền không?                                       │
│                                                       │
│  Hồ sơ sẽ ở trạng thái "Chưa hoàn thành" cho tới      │
│  khi thu đủ công nợ.                                  │
│                                                       │
│              [ Huỷ ]   [ Vẫn giao tài liệu ]          │
└───────────────────────────────────────────────────────┘
```

Bấm *Vẫn giao* → tài liệu giao thật, **node K09 Lưu trữ mở khoá ngay**, nhưng:

```
┌─ K08 · Nhận kết quả & bàn giao ───────── 🔴 CÒN NỢ ──┐
│  ✅ Nhận kết quả từ cơ quan        NV pháp lý         │
│  ✅ Bàn giao tài liệu, khách ký    NV pháp lý         │
│  ⏳ Thu đủ công nợ  — thiếu 6.000.000₫   Kế toán      │
│                                                       │
│  Đợt đã thu: 05/08  10.000.000₫ 📎 · 11/08 8.000.000₫ 📎
│  [ ➕ Ghi nhận thanh toán ]                            │
└───────────────────────────────────────────────────────┘
```

Node K08 **không đóng được**, nên quy trình vẫn là *Chưa hoàn thành* — dù bên ngoài khách đã cầm giấy tờ về.

#### Chia K08 cho 2 người — 2 làn song song

| Làn | Ai | Việc | Xong thì |
|---|---|---|---|
| **A · Hiện vật** | NV phụ trách hạng mục | Nhận kết quả · bàn giao · lấy chữ ký khách | **Mở khoá K09** + **giải phóng tiền khoán** |
| **B · Tiền** | Kế toán | Ghi nhận từng đợt thu · đối chiếu công nợ | **Đóng K08** → quy trình hoàn thành |

**K08 chỉ đóng khi cả 2 làn xong.** Nhưng **K09 chỉ chờ làn A** — nên việc lưu trữ không bị công nợ cầm chân.

> **Tiền khoán của nhân viên bám vào làn A, không bám vào công nợ.**
> Họ đã làm xong phần việc của họ; khách chậm trả không phải lỗi của họ. Treo lương theo công nợ là phạt nhầm người, và chắc chắn sẽ bị phản ứng.

#### K08 dùng CHUNG MỘT KHUÔN cho cả Đo vẽ lẫn Pháp lý

Cả hai phân hệ đều đi đúng ba nhịp **nhận kết quả → bàn giao khách ký → thu đủ tiền**. Chỉ khác nội dung checklist, **không khác cơ chế**:

| | Hạng mục **ĐO VẼ** | Hạng mục **PHÁP LÝ** |
|---|---|---|
| Làn A do ai làm | **NV đo vẽ** | **NV pháp lý** |
| "Nhận kết quả" nghĩa là | Nhận bộ sản phẩm kỹ thuật đã chuẩn hoá ở **K03** | Nhận sổ/giấy phép từ **cơ quan nhà nước** |
| Bàn giao khách + lấy ký | ✅ giống hệt | ✅ giống hệt |
| Kê khai **tiền chi hộ** nhà nước | ❌ không có | ✅ lệ phí, thuế — kèm biên lai |
| Làn B · thu đủ công nợ | ✅ **giống hệt** | ✅ **giống hệt** |
| Hỏi xác nhận khi còn nợ | ✅ **giống hệt** | ✅ **giống hệt** |
| Mở khoá K09 khi xong làn A | ✅ **giống hệt** | ✅ **giống hệt** |

→ **Một bộ mã dùng chung**, khác biệt duy nhất nằm ở **danh sách checklist** cấu hình trong Workflow Designer. Không viết hai nhánh xử lý riêng — hai nhánh là hai chỗ để lệch nhau.

> **Đây là lý do gói Đo vẽ thuần bắt buộc phải thêm K08.** Mẫu hiện tại `K01→K02→K03→K09` đi thẳng từ chuẩn hoá tài liệu sang lưu trữ — **không có bước nào thu tiền cả**. Hợp đồng đo vẽ vẫn có công nợ như hợp đồng pháp lý, nên đang là một lỗ hổng thật.

#### ✅ Hệ thống đã đỡ được — không phải dựng mới

Đã rà schema. Việc chia một node cho nhiều người, mỗi người một đầu việc, **đã có sẵn**:

| Cần | Bảng | Cột |
|---|---|---|
| Nhiều người trên 1 node, có vai trò | `task_node_assignments` | `role_code`, `is_primary` |
| **Giao từng mục checklist cho từng người** | `task_node_checklist_assignments` | `employee_id`, `role_code` |
| Mục checklist bắt buộc / cần minh chứng | `task_node_checklist_results` | `is_required`, `require_evidence` |
| Mục checklist do hệ thống tự kết luận | `task_node_checklist_results` | `condition_result` (jsonb) |
| Chia tiền khoán theo tỉ lệ | `task_node_checklist_assignments` | `share_percent`, `pay_slot` |

→ Chỉ cần **nối vào**, không phải thêm bảng nào.

#### Mục "Thu đủ công nợ" phải TÍNH SỐNG, không ai tick tay

Đây là điểm dễ hỏng nhất. Nếu để kế toán tự tick "đã thu đủ" thì cổng công nợ chỉ là hình thức — tick nhầm hoặc tick nể là xong.

**Đúng cách:** mục này đọc thẳng `receivables.remaining_amount`:

```
remaining_amount = 0  →  ✅ tự đạt
remaining_amount > 0  →  ⏳ chưa đạt, hiện số còn thiếu
```

Kế toán **không tick mục này** — họ chỉ **ghi nhận các đợt thu**. Thu đủ thì mục tự xanh. Không ai bấm tắt được cảnh báo, kể cả giám đốc.

> Đây đúng nguyên tắc đã dùng cho cột *Cảnh báo* và cột *Pháp lý* bên đo vẽ (§3): cái gì suy ra được thì **tính sống**, đừng lưu.
> Và nó phụ thuộc **Đợt 1** — hiện công nợ bị trừ ngay khi nhập, chưa cần duyệt. Chưa sửa Đợt 1 thì cổng này vô nghĩa: nhân viên gõ một phiếu khống là mục tự xanh.

#### Kế toán cần thêm quyền gì

Kiểm tra vai trò `accountant` trong CSDL:

| Quyền hiện có | Đọc | Tạo | Sửa | Duyệt |
|---|---|---|---|---|
| `contract` | ✅ | | | |
| `finance` | ✅ | ✅ | ✅ | ❌ |
| `hr` · `payroll` · `service_line` | ✅ | một phần | | ❌ |

**Thiếu hẳn: `workflow`, `task_node`, `checklist`, `evidence`** → hiện kế toán **không nhìn thấy quy trình nào cả**. Muốn "theo dõi quy trình" như bạn nói thì phải cấp thêm:

| Quyền | Mức | Để làm gì |
|---|---|---|
| `workflow` | **chỉ đọc** | Xem sơ đồ quy trình, biết hồ sơ đang ở đâu |
| `task_node` | **chỉ đọc** | Mở node xem chi tiết |
| `checklist` | đọc + **sửa** | Tick phần việc của mình trong K08 |
| `evidence` | đọc + **tạo** | Đính ảnh bill |

> **Cố ý không cấp `can_approve`:** kế toán **ghi nhận** tiền, giám đốc **duyệt** phiếu. Giữ nguyên tách bạch người nhập ↔ người duyệt — nếu kế toán vừa nhập vừa duyệt thì cơ chế duyệt mất hết ý nghĩa.
> Nếu công ty muốn kế toán được duyệt phiếu thu, để đó thành **một thiết lập** trong Cài đặt, đừng viết cứng.

> ⚠️ Hiện **chưa có người dùng nào mang vai trò Kế toán** (`so_nguoi = 0`). Cần tạo tài khoản thật rồi mới kiểm thử được luồng này.

#### Danh sách mới sinh ra: "Đã giao — chưa thu đủ"

Cách làm này tự đẻ ra một thứ có giá trị: mọi hồ sơ đang treo ở K08 chính là **danh sách đòi nợ**, có sẵn tên khách, số tiền thiếu, ngày đã giao, ai giao.

Đây là màn hình chính của kế toán, và cũng là câu trả lời cho *"vì sao quy trình này chưa hoàn thành"*.

#### Rủi ro phải nói trước

| Rủi ro | Cách xử lý |
|---|---|
| Hồ sơ treo "chưa hoàn thành" vĩnh viễn nếu khách xù nợ | **Đây là chủ ý** — danh sách treo chính là danh sách đòi nợ. Khách bỏ hẳn thì **huỷ quy trình** (`cancel_workflow`), công nợ vẫn nguyên trong sổ |
| Số hồ sơ treo phình to, nhìn như hệ thống hỏng | Trạng thái hiển thị phải nói rõ *"Đã giao — chờ thu 6.000.000₫"*, **không phải** *"Đang thực hiện"* chung chung |
| Nhân viên bấm "Vẫn giao" quá dễ dãi | Ghi nhật ký ai bấm, lúc nào, còn thiếu bao nhiêu — và cho hiện trong báo cáo của giám đốc |

---

## 7. Sổ quyết định

### ✅ Đã chốt

| # | Việc | Chốt thế nào | Làm ở |
|---|---|---|---|
| 1 | **Đo vẽ cũng phải có node Bàn giao mới đóng** | Nghiệm thu đo vẽ **chưa phải** hết | Đợt 4 |
| 2 | **Tách bảng** `legal_dossiers` / `legal_submissions` | Trạng thái thuộc **hồ sơ**, mỗi lần nộp là **một dòng riêng** | ✅ Đợt 1 |
| 3 | **Bỏ node K07** | Việc của nó chia về: trạng thái `PENDING` · thêm dòng lần nộp · `employee_pay_adjustments` | ✅ Đợt 1 + 3 |
| 4 | **Bỏ node K04** | Việc của nó về checklist **K03** (đo vẽ tự kiểm) và **K05** (pháp lý rà quy hoạch) | ✅ Đợt 1 |
| 5 | **K03 = "Chuẩn hoá tài liệu kỹ thuật"** — node duy nhất giữa K02 và K05 | Chính là **mốc bàn giao đo vẽ → pháp lý** | ✅ Đợt 1 |
| 6 | **Giữ K08 và K09 riêng** *(đảo lại đề xuất gộp của tôi)* | K08 là nơi **tiền** về, K09 là nơi **file** về — file không nên chờ tiền | ✅ Đợt 1 |
| 7 | **Nhận diện node đặc biệt bằng CỜ**, không viết cứng mã | Công ty đổi tên bước vẫn chạy đúng; xoá đoạn viết cứng ở `routes_contracts.py:117` | ✅ Đợt 1 |
| 8 | **Trạng thái đo vẽ tính sống**, bỏ cột trạng thái tự do | Diệt tận gốc lỗi "hai nguồn sự thật" | Đợt 2 |
| 9 | **Node Bàn giao khoá** cho tới khi node Nộp đã đóng | Không im lặng — hiện rõ *"Chờ đóng hồ sơ nộp"* | Đợt 4 |
| 10 | **Cơ chế thu tiền ở K08** | Ghi số tiền + **ảnh bill bắt buộc** → sếp duyệt → **tự trừ công nợ**; thu nhiều đợt | Đợt 1 + 4 |
| 11 | **Chưa thu đủ: hỏi xác nhận, KHÔNG chặn giao** | Giao thật, nhưng quy trình treo *"Chưa hoàn thành"* tới khi thu đủ → **tự đóng**, không ai phải châm chước | Đợt 4 |
| 12 | **K08 chia 2 làn**: NV phụ trách (hiện vật) · Kế toán (tiền) | Xong làn A → mở K09 + trả tiền khoán; xong cả 2 → đóng K08 | Đợt 4 |
| 12b | **K08 dùng chung một khuôn cho Đo vẽ và Pháp lý** | Cùng 3 nhịp nhận kết quả → bàn giao → thu đủ tiền; chỉ khác checklist, **không viết 2 nhánh xử lý** | Đợt 1 + 4 |
| 13 | Mục *"Thu đủ công nợ"* **tính sống**, không ai tick tay | Đọc thẳng `receivables.remaining_amount` — không ai tắt được cảnh báo | Đợt 4 |
| 14 | **Kế toán được theo dõi quy trình** | Cấp `workflow` + `task_node` **chỉ đọc**; **không** cấp quyền duyệt — giữ tách bạch người nhập ↔ người duyệt | Đợt 4 |
| 15 | Lỗi **giật khi bấm Sửa** | Gộp vào Đợt 1 — CSS thuần, làm luôn | ✅ Đợt 1 |

### ✅ Không còn câu nào treo

Toàn bộ 6 câu trước đây đã được quyết ở **§4.1** để khỏi phải dừng lại hỏi giữa chừng:

| # | Câu | Quyết |
|---|---|---|
| ~~A~~ | Node bàn giao lấy mã K08 hay K09 | Giữ **cả hai**, tách vai trò (§6.11) |
| ~~B~~ | Đo vẽ có cần K06 | Có node nộp, **không gắn cờ** `requires_gov_submission` |
| ~~C~~ | Nút thao tác pháp lý đặt đâu | **Cả hai chỗ**, chung component + chung API |
| ~~D~~ | Nút "Thêm Hạng mục" | **Không làm** trong 4 đợt này |
| ~~E~~ | Khách xù nợ hẳn | **Huỷ quy trình** — nợ giữ nguyên. Bỏ hẳn ý tưởng "nợ xấu" |
| ~~F~~ | Kế toán duyệt phiếu thu | **Không** — chỉ giám đốc |

> Đây là các quyết định **mặc định của tôi**, không phải bạn đã duyệt. Chỗ nào sai thì nói, tôi đổi ngay — nhưng tôi **không chờ** trả lời mới bắt đầu.

---

## 8. Bắt đầu từ Đợt 1

| | |
|---|---|
| **Làm gì** | Nền móng: sửa thời điểm trừ công nợ · 1 migration cho toàn bộ schema · chuẩn hoá 7 node · bỏ mã viết cứng · tạo tài khoản Kế toán + dữ liệu mẫu · khử giật nút Sửa |
| **Bạn cần làm gì** | Không gì cả — đợt này kiểm chứng bằng SQL và gọi API, không cần nhìn màn hình |
| **Xong thì được gì** | Lỗ hổng tiền đã bịt · danh mục node đã chuẩn · **3 đợt sau không phải đụng schema nữa** |
| **Tôi sẽ dừng lại hỏi khi** | Cần vá số liệu công nợ *(in bảng đối soát cho bạn duyệt trước)* · cần xoá bất kỳ dữ liệu thật nào · phát hiện việc đắt hơn hẳn ước tính |

---

## 9. Nhật ký thi công

### ✅ ĐỢT 1 — Xong ngày 13/08/2026

| # | Việc | Kết quả |
|---|---|---|
| 1.1 | Chỉ trừ công nợ khi phiếu **đã duyệt** | `finance/services.py` — thêm `counts_toward_receivable()` dùng chung cho cả 3 chỗ |
| 1.2 | Endpoint **duyệt / từ chối** phiếu | `POST /api/finance/cashflow/{id}/approve` · `/reject` — trước đây **không có**, phiếu vào "Chờ duyệt" là kẹt vĩnh viễn |
| 1.3 | Huỷ phiếu chưa duyệt **không cộng ngược** công nợ | `void_cashflow` nhớ trạng thái trước khi ghi đè |
| 1.4 | `remaining_amount` **suy ra** từ giá trị hợp đồng | Hết trôi số sau mỗi lần hoàn tác |
| 1.5 | Migration nền móng | `legal_dossiers` · `legal_dossier_events` · `dossier_id`/`submit_seq` · `legacy_gov_status` · `manual_status` · `approved_at` · quyền Kế toán |
| 1.6 | Chuẩn hoá **7 node**, bỏ K04·K07 | `workflow_nodes` |
| 1.7 | Dựng lại **4 quy trình mẫu** | Thêm K08 vào mẫu Đo vẽ thuần |
| 1.8 | Bỏ mã viết cứng → đọc **cờ** | `routes_contracts.py` `_timeline_node_type` |
| 1.9 | Cờ `is_handover` trong Workflow Designer | 3 chỗ tuần tự hoá + ô chọn |
| 1.10 | Tài khoản Kế toán | `ketoan` / `123456` |
| 1.11 | Khử giật nút Sửa | Ô giá trị khoá 44px, bằng chiều cao ô nhập |

**Phát sinh ngoài kế hoạch — lỗi có sẵn, không phải do đợt này:**
`CashflowTransaction.project_id` khai báo khoá ngoại tới bảng **`projects_tasks` không tồn tại**
(không có trong CSDL, cũng không có model). SQLAlchemy không dựng nổi thứ tự bảng →
**mọi lần tạo phiếu thu/chi đều lỗi 500**. Đã trỏ lại đúng `service_lines.id`; sửa luôn
`ChatRoom.related_task_id` cùng lỗi.

**Đối soát công nợ trước khi sửa:** 17 phiếu Thu đang chờ duyệt, **tất cả đều không gắn hợp đồng**
→ chưa có công nợ nào bị trừ oan → **không phải vá dữ liệu**.

**Kiểm chứng:** 14/14 test đơn vị · 8/8 bước kịch bản nghiệp vụ trên dữ liệu thật (đã xoá sạch) · 4/4 test frontend.
