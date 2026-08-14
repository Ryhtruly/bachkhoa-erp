# PLAN: Luồng thao tác của Giám đốc · Pháp lý · Kế toán · Người phụ trách node

Ngày viết: **13/08/2026**
Trạng thái: **Chờ duyệt — chưa code dòng nào**

Bốn đợt vừa rồi dựng xong **bộ máy** (máy trạng thái, cổng công nợ, 2 làn, nhật ký).
Nhưng **đường đi tới bộ máy đó thì chưa có**. Tài liệu này trả lời đúng một câu:
*mỗi người mở phần mềm ra thì bấm vào đâu, theo thứ tự nào.*

---

## 1. Hiện trạng — kiểm chứng bằng API thật, không phỏng đoán

### 🔴 Lỗ hổng chặn đứng: không có nút duyệt phiếu thu

```
19 phiếu đang "Chờ duyệt"  —  KHÔNG có nút nào trên giao diện để duyệt
```

Đợt 1 đã dựng `POST /api/finance/cashflow/{id}/approve` và `/reject`, nhưng **không màn hình nào gọi tới**. Hậu quả dây chuyền:

```
Kế toán ghi nhận tiền  →  phiếu "Chờ duyệt"  →  ❌ không ai duyệt được
                                                    ↓
                            công nợ KHÔNG BAO GIỜ về 0
                                                    ↓
                            làn B của node bàn giao KHÔNG BAO GIỜ xong
                                                    ↓
                            node K08 KHÔNG BAO GIỜ đóng  →  quy trình treo vĩnh viễn
```

Toàn bộ cổng công nợ của Đợt 4 **đang không dùng được** chỉ vì thiếu một cái nút.

### Bảng đối chiếu: có bộ máy nhưng thiếu đường vào

| Việc | Backend | Giao diện |
|---|:---:|---|
| Duyệt / từ chối phiếu thu | ✅ có API | 🔴 **không có nút nào** |
| Danh sách "Đã giao — chưa thu đủ" | ✅ có API | 🔴 **không có trang nào** |
| Vòng đời hồ sơ pháp lý (4 nút) | ✅ có API | 🟠 chỉ ở trang Hồ Sơ Pháp Lý + khung node, **thiếu ở Lịch trình** |
| Khối công nợ node bàn giao | ✅ có API | 🟠 chỉ vào được qua Workflow Designer |
| Việc chờ giám đốc duyệt | ✅ có chuông | 🟠 chuông chỉ báo nghiệm thu, **không báo phiếu thu** |

### Kế toán đăng nhập vào thì thấy gì

Quyền API **đủ hết** — gọi được cả 4 endpoint cần dùng:

```
200  /api/contracts/workspace      200  /api/handover/{node}
200  /api/handover/outstanding     200  /api/finance/cashflow
```

Nhưng thanh điều hướng chỉ hiện: **Tổng Quan · Hợp Đồng · Thu Chi Sổ Quỹ · KPI · Nhân Sự**.
Không có tab nào dẫn tới việc của họ. Muốn ghi nhận một đợt thu tiền, đường đi hiện tại:

```
Hợp Đồng → tìm đúng hợp đồng → bấm Quy trình → tìm node K08 → mới thấy nút
```

Bốn bước, và **phải tự biết hợp đồng nào đang cần thu** — thứ mà máy đã biết sẵn.

---

## 2. Luồng thao tác đích — bốn vai, bốn màn hình

### 2.1. Toàn cảnh: ai chạm vào hồ sơ lúc nào

```
NV ĐO VẼ          NV PHÁP LÝ         NGƯỜI PHỤ TRÁCH K08    KẾ TOÁN        GIÁM ĐỐC
────────────────────────────────────────────────────────────────────────────────────
① Đo, chuẩn hoá
   tài liệu ────────▶
                  ② Tiếp nhận
                  ③ Nộp cơ quan
                  ④ Tạm dừng/Tiếp tục
                     (chờ cơ quan)
                  ⑤ Đóng hồ sơ ──────▶
                                    ⑥ Nhận kết quả
                                    ⑦ Bàn giao khách
                                       ↓ còn nợ? hỏi xác nhận
                                    ⑧ Vẫn giao ─────────────▶
                                                          ⑨ Ghi nhận
                                                             từng đợt thu
                                                             + ảnh bill ──────▶
                                                                            ⑩ Duyệt phiếu
                                                          ⑪ Công nợ về 0
                                                             (tự tính)
                                    ⑫ Node K08 đóng được ─────────────────────▶
                                                                            ⑬ Duyệt nghiệm thu
                                                                               → QUY TRÌNH XONG
```

**Điểm mấu chốt:** giữa ⑨ và ⑪ **bắt buộc** có ⑩. Thiếu nút duyệt là đứt mạch ở đúng đó.

### 2.2. GIÁM ĐỐC — "việc chờ tôi"

Giám đốc không đi tìm việc; việc phải tự tìm tới. Một hộp duy nhất trên Tổng Quan:

```
┌─ Chờ tôi duyệt ─────────────────────────── 21 việc ─┐
│                                                      │
│  💰 Phiếu thu chờ duyệt                    19        │
│     Nguyễn Võ Hiệp · 6.000.000₫ · 📎 bill            │
│     Phạm Văn C     · 2.500.000₫ · ⚠️ thiếu bill      │
│     … xem tất cả                                     │
│                                                      │
│  ✅ Nghiệm thu chờ duyệt                    2        │
│     K03 Chuẩn hoá tài liệu · Nguyễn Văn A            │
│                                                      │
│  🔴 Hồ sơ đã giao mà chưa thu đủ            1        │
│     2001/BK-2026 · còn thiếu 32.000.000₫             │
└──────────────────────────────────────────────────────┘
```

Bấm vào một dòng phiếu thu → mở hộp thoại **Xem bill · Duyệt · Từ chối (ghi lý do)**.
Duyệt xong công nợ tự trừ, cổng bàn giao tự mở. Giám đốc không phải vào tab nào khác.

> **Vì sao gộp cả 3 loại vào một hộp:** hiện chuông chỉ báo nghiệm thu. Tiền nằm ở
> chỗ khác, nợ nằm ở chỗ khác nữa. Ba nơi thì sẽ có nơi không ai ngó tới.

### 2.3. NHÂN VIÊN PHÁP LÝ — theo dõi vòng đời

Bộ nút **đã có sẵn**, chỉ thiếu chỗ gắn. Cần xuất hiện ở **cả ba** nơi họ đang làm việc:

| Ở đâu | Khi nào dùng | Trạng thái |
|---|---|---|
| **Lịch trình** *(tab chính của nhân viên)* | Mở đầu ngày, thấy việc hôm nay | 🔴 **thiếu** |
| **Trang Hồ Sơ Pháp Lý** | Tra cứu, lọc, xem lịch sử | ✅ đã có |
| **Khung node trong sơ đồ** | Giám đốc xem tiến độ | ✅ đã có |

Một ngày của nhân viên pháp lý:

```
Mở Lịch trình
   │
   ├─ 🔔 "Có hồ sơ mới từ bộ phận đo vẽ"     → bấm Tiếp nhận
   │
   ├─ Hồ sơ đang xử lý                        → Nộp cơ quan, nhập biên nhận
   │                                             hoặc bấm Tạm dừng + chọn lý do
   │       Chờ cơ quan · Chờ đo vẽ · Chờ nội bộ
   │
   ├─ 🔔 "Hồ sơ X đang chờ đo vẽ sửa bản vẽ"  → theo dõi, xong thì Tiếp tục
   │
   └─ Có kết quả từ cơ quan                    → Đóng hồ sơ (Lấy được / Bị bác)
                                                  ↓ mở khoá node Bàn giao
```

Thêm một việc chưa có nút: **Nộp lại lần 2** khi cơ quan trả về.
API `POST /api/legal-dossiers/{id}/submissions` đã có, giao diện chưa.

### 2.4. NGƯỜI PHỤ TRÁCH NODE BÀN GIAO — làn A, hiện vật

Đây là **người được phân công chính** ở node K08, không nhất thiết là pháp lý —
hạng mục đo vẽ thuần thì là nhân viên đo vẽ.

```
Lịch trình → công việc "Nhận kết quả & bàn giao"
   │
   ├─ ❌ Node còn khoá: "Chờ đóng hồ sơ nộp cơ quan"
   │      → không bấm được gì, hiện rõ đang chờ ai
   │
   └─ ✅ Node mở:
         ├─ Xem khối công nợ: giá trị · đã thu · còn thiếu
         ├─ Bấm [Xác nhận bàn giao]
         │     └─ còn nợ? → hộp thoại "Vẫn giao tài liệu khi chưa thu đủ?"
         │                   bấm Vẫn giao → ghi nhật ký ai bấm, thiếu bao nhiêu
         └─ Xong làn A → node Lưu trữ mở ngay + tiền khoán vào lương
```

**Tiền khoán không chờ khách trả nợ** — họ làm xong phần của họ rồi.

### 2.5. KẾ TOÁN — làn B, tiền

Cần **một tab riêng**, không bắt họ lục qua Hợp Đồng → Quy trình → node.

```
┌─ Thu Công Nợ ────────────────────────────────────────┐
│  Đã giao — chưa thu đủ            1 hồ sơ · 32.000.000₫│
├──────────────────────────────────────────────────────┤
│  2001/BK-2026 · Nguyễn Võ Hiệp                       │
│  Tách thửa · đã giao 13/08 bởi Trần Thụy Tường Vy    │
│                                                       │
│  Giá trị 32.000.000₫ · Đã thu 0₫ · Còn 32.000.000₫   │
│                                                       │
│  [ ➕ Ghi nhận thanh toán ]   [ Xem hồ sơ ]           │
└──────────────────────────────────────────────────────┘
```

Bấm **Ghi nhận thanh toán** → form: số tiền · **ảnh bill bắt buộc** · hình thức · ghi chú
→ tạo phiếu *Chờ duyệt* → giám đốc thấy ngay trong hộp "Chờ tôi duyệt".

Danh sách này **tự sinh** từ hồ sơ đang treo ở node bàn giao — kế toán không phải
tự dò hợp đồng nào còn nợ. Thu đủ thì dòng đó tự biến mất.

---

## 3. Việc phải làm — chia 3 đợt

### 🔴 ĐỢT 5 — Thông mạch tiền *(chặn mọi thứ khác)*

| # | Việc | Vì sao gấp |
|---|---|---|
| 5.1 | **Nút Duyệt / Từ chối phiếu thu** trong trang Thu Chi Sổ Quỹ | 19 phiếu đang kẹt, cổng công nợ vô dụng |
| 5.2 | Hộp thoại duyệt: xem ảnh bill · số tiền · ai nhập · **từ chối phải ghi lý do** | Duyệt mà không xem bill thì duyệt để làm gì |
| 5.3 | Cảnh báo rõ khi phiếu **thiếu ảnh bill** | Phiếu cũ nhập tay không có minh chứng |
| 5.4 | Chuông + hộp **"Chờ tôi duyệt"** cho giám đốc, gộp cả 3 loại | Việc phải tự tìm tới người duyệt |

**Xong đợt = luồng tiền chạy thông từ đầu đến cuối.** Kiểm chứng: kế toán ghi 6 triệu → giám đốc thấy chuông → duyệt → công nợ về 0 → node K08 đóng được.

### 🟠 ĐỢT 6 — Màn hình của Kế toán

| # | Việc |
|---|---|
| 6.1 | Tab **Thu Công Nợ** cho vai trò kế toán |
| 6.2 | Danh sách *"Đã giao — chưa thu đủ"* — nối vào API đã có |
| 6.3 | Form ghi nhận thanh toán ngay tại danh sách, không phải vào node |
| 6.4 | Tải ảnh bill lên thật *(hiện đang phải dán đường dẫn)* |
| 6.5 | Lịch sử các đợt đã thu của từng hợp đồng |

### 🟡 ĐỢT 7 — Đưa thao tác về Lịch trình

| # | Việc |
|---|---|
| 7.1 | Bộ nút vòng đời pháp lý **trong Lịch trình** — component đã có, chỉ gắn thêm |
| 7.2 | Khối công nợ + nút bàn giao **trong Lịch trình** |
| 7.3 | Nút **Nộp lại lần 2** *(API đã có, giao diện chưa)* |
| 7.4 | Node còn khoá thì hiện rõ **đang chờ ai, chờ việc gì** |

**Xong đợt = nhân viên không cần rời tab Lịch trình để làm hết việc trong ngày.**

---

## 4. Thứ tự và lý do

```
ĐỢT 5 ──▶ ĐỢT 6 ──▶ ĐỢT 7
 tiền      màn hình   đưa về
 thông     kế toán    Lịch trình
```

Đợt 5 trước vì **không có nó thì Đợt 4 vừa làm xong đang nằm chết**. Đợt 6 trước Đợt 7
vì kế toán hiện không có đường vào nào cả, còn pháp lý thì đã có 2 đường tạm dùng được.

---

## 5. Cần bạn chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| A | Kế toán có được **tự duyệt** phiếu mình nhập không? | **Không** — giữ tách bạch người nhập ↔ người duyệt |
| B | Giám đốc duyệt phiếu ở **trang Thu Chi** hay ngay trong hộp "Chờ tôi duyệt" ở Tổng Quan? | **Cả hai** — cùng một hộp thoại |
| C | Ảnh bill: tải file lên thật hay tạm dán đường dẫn? | **Tải lên thật** ở Đợt 6 — hệ thống đã có MinIO |
| D | 19 phiếu "Chờ duyệt" cũ xử lý sao? | Để giám đốc tự duyệt/từ chối sau khi có nút — **không tự động vá** |

**Chưa code — chờ bạn cho lệnh.**
