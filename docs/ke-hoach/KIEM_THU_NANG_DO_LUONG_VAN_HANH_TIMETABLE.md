# 🚀 BẢN MÔ PHỎNG KIỂM THỬ NẶNG ĐÔ: TỪNG CÚ CLICK & LUỒNG VẬN HÀNH 100% THỰC TẾ — BACH KHOA ERP

Tài liệu này mô phỏng **TỪNG BƯỚC THAO TÁC, TỪNG CÚ CLICK CHUỘT, POPUP HIỂN THỊ VÀ PHẢN HỒI THỜI GIAN THỰC** của toàn bộ hệ thống Timetable & Dispatch, chuẩn hóa 100% tên 7 Node CSDL gốc: `K01`, `K02`, `K03`, `K05`, `K06`, `K08`, `K09`.

---

# 🎬 KỊCH BẢN TỔNG THỂ: HỢP ĐỒNG `004/BK-2026` (ĐO VẼ & HỢP THỨC HÓA NHÀ ĐẤT QUẬN 7)

- **Khách hàng:** Anh Hoàng Nam (0908.123.456)
- **Địa chỉ thửa đất:** 123 Nguyễn Thị Thập, Phường Tân Quy, **Quận 7, TP.HCM**
- **Cơ quan tiếp nhận:** **Chi nhánh VP ĐKĐĐ Quận 7**
- **Tổng giá trị HĐ:** 15.000.000 đ (Đã cọc K01: 5.000.000 đ · Còn nợ: 10.000.000 đ)

---

# 📍 CHẶNG 1: SẾP GIAO VIỆC & ĐẶT GIỜ "3 CHẠM" TỪ QUY TRÌNH HỢP ĐỒNG

### 🎯 Tình huống:
Node `K01 Tiếp nhận & kiểm tra đầu vào` đã xong. Node `K02 Khảo sát & đo hiện trường` chuyển sang `READY` (Chờ phân công).

---

### 🖱️ BƯỚC 1.1: Sếp mở Timeline Hợp đồng & Click vào Node K02
Sếp truy cập trang `ContractTimeline.jsx` của HĐ 004/BK, click vào nút `[ ⚡ Phân công & Lên lịch ]` trên Node K02.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📍 PHÂN CÔNG BƯỚC: K02 - KHẢO SÁT & ĐO HIỆN TRƯỜNG                      │
│ 📁 Hợp đồng: 004/BK-2026 · Thửa đất: 123 Nguyễn Thị Thập, Quận 7       │
├─────────────────────────────────────────────────────────────────────────┤
│ 💡 1. THUẬT TOÁN QUÉT QUÂN SỐ & ĐỊA BÀN:                                │
│   • [ (•) 👤 Nguyễn Văn A (Đo vẽ) ] 🟢 RẢNH SÁNG T4 (07:30 – 10:30)     │
│     📍 CÙNG ĐỊA BÀN: A cũng đang có lịch đo HĐ 001 tại Quận 7 lúc 07:30! │
│     ➔ Gợi ý: Ghép đo liền kề lúc 09:30 – 11:30 (Tiết kiệm 100% đi lại) │
│                                                                         │
│   • [ ( ) 👤 Trần Văn B (Đo vẽ) ] 🔴 ĐANG QUÁ TẢI 35H (Đo Hóc Môn)      │
│   • [ ( ) 👤 Lê Văn C (Đo vẽ) ] ⚪ Trống lịch cả ngày                  │
├─────────────────────────────────────────────────────────────────────────┤
│ 📅 2. CHỌN NGÀY LÀM VIỆC:                                               │
│   [ (•) Hôm nay (Thứ 4, 19/08) ]   [ Ngày mai (T5) ]   [ Thứ 6 ]        │
├─────────────────────────────────────────────────────────────────────────┤
│ ⏰ 3. CHỌN GIỜ & THỜI LƯỢNG:                                            │
│   • Giờ bắt đầu: [ 07:30 ]  [ 08:30 ]  [ (•) 09:30 ]  [ 14:00 ]         │
│   • Thời lượng:  [ 1.5h ]   [ (•) 2.0h ]  [ 2.5h ]                      │
├─────────────────────────────────────────────────────────────────────────┤
│ 🛡️ CHECK XUNG ĐỘT THỜI GIAN THỰC:                                       │
│   👉 Dự kiến: Thứ 4 (19/08) từ 09:30 ➔ 11:30 (120 phút)                 │
│   🟢 Trạng thái: Nguyễn Văn A TRỐNG LỊCH hoàn toàn khung giờ này!       │
├─────────────────────────────────────────────────────────────────────────┤
│                       [ Hủy ]    [ 🚀 XÁC NHẬN PHÂN CÔNG & BẮN LỊCH ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

👉 **Sếp bấm: `[ 🚀 XÁC NHẬN PHÂN CÔNG & BẮN LỊCH ]` (1 Cú Click!)**
- Update `task_nodes` (`planned_start = '09:30'`, `planned_end = '11:30'`) và gán cho Nguyễn Văn A.
- **Tự động xuất hiện ngay lập tức trên Lịch Timetable của Nguyễn Văn A!**

---

# 📱 CHẶNG 2: NHÂN VIÊN MỞ THẺ ➔ NỘP CHECKLIST NGHIỆM THU

---

### 🖱️ BƯỚC 2.1: Nhân viên Nguyễn Văn A mở Timetable cá nhân
A mở màn hình lúc 09:25 sáng Thứ 4 ➔ Bấm vào thẻ việc `[K02] Khảo sát & đo hiện trường` ➔ **Màn hình Drawer bên phải trượt ra**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📋 THỰC THI TASK: [K02] KHẢO SÁT & ĐO HIỆN TRƯỜNG (HĐ 004/BK)           │
├─────────────────────────────────────────────────────────────────────────┤
│ 📍 Địa chỉ: 123 Nguyễn Thị Thập, P. Tân Quy, Quận 7                     │
│ 👤 Khách hàng: Hoàng Nam (📞 0908.123.456)                              │
├─────────────────────────────────────────────────────────────────────────┤
│ ⏱ TRẠNG THÁI: [🔵 SẴN SÀNG]                      [ 🚀 BẮT ĐẦU LÀM ]    │
├─────────────────────────────────────────────────────────────────────────┤
│ 📑 CHECKLIST NGHIỆM THU TIẾN ĐỘ (3 MỤC):                                │
│                                                                         │
│ [X] 1. Chụp ảnh mốc ranh giới thực địa                                  │
│     📷 [moc_dong.jpg] [moc_tay.jpg] [moc_nam.jpg] [moc_bac.jpg]         │
│     [ + Tải thêm ảnh hiện trường ]                                      │
│                                                                         │
│ [X] 2. Upload file số liệu thô máy đo                                   │
│     📁 [toa_do_tho_H004.csv] (Kích thước: 42 KB)                        │
│                                                                         │
│ [X] 3. Biên bản xác nhận mốc ranh với chủ đất & giáp ranh               │
│     📄 [bien_ban_ky_giap_ranh.pdf] (Đã ký đủ)                           │
├─────────────────────────────────────────────────────────────────────────┤
│ 💰 LƯƠNG KHOÁN ĐẦU VIỆC KHI ĐẠT: +350.000 đ (Tự động cộng sau khi duyệt)│
├─────────────────────────────────────────────────────────────────────────┤
│ [ ⏱ Báo trễ +30p ]   [ 🚨 Báo kẹt việc ]    [ 📤 NỘP DUYỆT NGHIỆM THU ] │
└─────────────────────────────────────────────────────────────────────────┘
```

👉 **A bấm: `[ 📤 NỘP DUYỆT NGHIỆM THU ]`**
- `task_nodes.status` chuyển sang `'submitted'`.
- `task_nodes.submitted_at` ghi nhận `2026-08-19 11:15:00` (Xong trước hạn 15 phút ➔ On-time 100%!).

---

# 👑 CHẶNG 3: SẾP PHÊ DUYỆT ➔ NHẢY SỐ TIỀN KHOÁN TỨC THÌ

---

### 🖱️ BƯỚC 3.1: Sếp duyệt nghiệm thu K02
Sếp xem ảnh hiện trường & file số liệu ➔ Bấm **`[ ✅ DUYỆT NGHIỆM THU ]`**:

```
                           SỰ KIỆN DUYỆT K02 THÀNH CÔNG!
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 1️⃣ Node K02 chuyển trạng thái: 🟢 ACCEPTED                              │
 │ 2️⃣ Node K03 (Chuẩn hoá tài liệu kỹ thuật) tự động chuyển: 🔵 READY      │
 │ 3️⃣ TIỀN LƯƠNG KHOÁN TỰ ĐỘNG CỘNG VÀO VÍ CỦA A:                         │
 │     💰 +350.000 đ (Đã kích hoạt compensation term CT_DOVE_01)          │
 └─────────────────────────────────────────────────────────────────────────┘
```

---

# ⚡ CHẶNG 4: TÌNH HUỐNG KHẨN CẤP — TRỄ THỜI GIAN, KẸT GIỜ MỘT CỬA & TỰ ĐỘNG SAN TẢI

---

### 💥 Tình huống:
- Chiều Thứ 4, **Trần Văn B** đang đo thửa đất `HĐ 006` ở Hóc Môn (Lịch dự kiến: 13:30 – 16:00).
- Sau đó, B còn 1 lịch nộp hồ sơ **`[K06] Nộp & theo dõi hồ sơ` tại VPĐK Quận 7 lúc 16:15**.
- **SỰ CỐ:** Lúc 15:45, chủ đất Hóc Môn xảy ra tranh chấp ranh ➔ **Kéo dài thêm 90 phút (đến 17:30 mới xong)**.

---

### 🖱️ BƯỚC 4.1: Bấm nút báo kẹt
B bấm: **`[ 🚨 Báo kẹt việc / Xin gia hạn +90p ]`**.

---

### 🧠 BƯỚC 4.2: Thuật toán Cascade Ripple & Cảnh báo Tử huyệt kích hoạt

```
                     HỆ THỐNG PHÂN TÍCH TÁC ĐỘNG DÂY CHUYỀN
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ ⚠️ Task 1 (Đo HĐ 006): Kéo dài từ 13:30 ➔ 17:30                         │
 │                                                                         │
 │ 🚨 PHÁT HIỆN NGUY CƠ TỬ HUYỆT Ở TASK TIẾP THEO:                         │
 │ • Task 2: [K06] Nộp & theo dõi hồ sơ tại VPĐK Quận 7                    │
 │ • Giờ dự kiến cũ: 16:15 ➔ NẾU ĐẨY LÙI SẼ THÀNH: 17:45                   │
 │ ❌ TỬ HUYỆT: VPĐK QUẬN 7 ĐÓNG CỬA MỘT CỬA LÚC 16:30 (NGƯNG BỐC SỐ 16:00)! │
 │ ➔ NẾU B TỰ ĐI THÌ CHẮC CHẮN 100% BỊ ĐÓNG CỬA, HỒ SƠ TRỄ HẠN!           │
 └─────────────────────────────────────────────────────────────────────────┘
```

---

### 🤖 BƯỚC 4.3: San tải 1 chạm cho Sếp
Màn hình Giám đốc lập tức hiện Popup điều phối khẩn cấp:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🚨 CẢNH BÁO ĐIỀU PHỐI KHẨN: HỒ SƠ CÓ NGUY CƠ TRỄ GIỜ MỘT CỬA HÔM NAY!    │
├─────────────────────────────────────────────────────────────────────────┤
│ • Nhân viên: Trần Văn B đang kẹt đo tại Hóc Môn đến 17:30.              │
│ • Hồ sơ bị ảnh hưởng: [K06] Nộp & theo dõi hồ sơ VPĐK Q.7 (HĐ 004/BK)   │
├─────────────────────────────────────────────────────────────────────────┤
│ 💡 THUẬT TOÁN ĐÃ TÌM THẤY GIẢI PHÁP TỐI ƯU NHẤT:                        │
│   👤 PHẠM THỊ D (Phòng Pháp Lý) HIỆN ĐANG Ở QUẬN 7 (RẢNH CHIỀU NAY 14:00)!│
│   👉 Chuyển việc nộp hồ sơ này cho Phạm Thị D để nộp trước 16:00 chiều nay!│
├─────────────────────────────────────────────────────────────────────────┤
│        [ 🌙 Để mai nộp (Trễ 1 ngày) ]    [ ⚡ SAN VIỆC NGAY CHO CHỊ D ]  │
└─────────────────────────────────────────────────────────────────────────┘
```

👉 **Sếp bấm: `[ ⚡ SAN VIỆC NGAY CHO CHỊ D ]` (1 Click DUY NHẤT!)**
- Chị D nhận việc, sang VPĐK Q.7 bốc số nộp lúc 15:15 trước giờ đóng cửa ➔ **Cứu nguy tiến độ Hợp đồng!**

---

# 🌙 CHẶNG 5: TOÀN BỘ CÔNG TY KÍN LỊCH ➔ FALLBACK FORCE-PUSH SANG HÔM SAU

```
[ Kích Hoạt Quy Tắc: Fallback Force-Push to Next Business Day ]
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 1️⃣ TỰ ĐỘNG ĐẨY SANG SÁNG HÔM SAU:                                       │
 │    • Chuyển [K02 HĐ 009] sang Thứ 5 (20/08) lúc 08:00 – 09:30 (cho A).  │
 │                                                                         │
 │ 2️⃣ TỰ ĐỘNG GIA HẠN DEADLINE NODE:                                      │
 │    • deadline_at của Node K02 tự động tịnh tiến: +1 ngày (Không bị phạt)│
 │                                                                         │
 │ 3️⃣ TỊNH TIẾN DÂY CHUYỀN ĐỒ THỊ (DAG RIPPLE):                            │
 │    • Các Node con phía sau (K03, K05, K06, K08) tự động dời +1 ngày.     │
 │                                                                         │
 │ 4️⃣ BẬT CẢNH BÁO LIÊN HỆ KHÁCH HÀNG:                                    │
 │    • Bắn thông báo cho CSKH:                                            │
 │      👉 [ 📞 Nhắc gọi khách HĐ 009 dời lịch hẹn khảo sát sang 8h sáng mai]│
 └─────────────────────────────────────────────────────────────────────────┘
```

---

# 🛡️ CHẶNG 6: CỔNG CÔNG NỢ K08 & DUYỆT NỢ 1 CHẠM

```
1. Khách hàng nhận sổ đỏ gốc tại K08 (Nhận kết quả & bàn giao), còn nợ 10.000.000 đ.
2. Hệ thống KHÓA CỨNG: Chặn in Biên bản bàn giao có mã QR.
3. Nhân viên gửi yêu cầu ➔ Sếp bấm [ 🚀 DUYỆT CHO NỢ & MỞ KHÓA BÀN GIAO ].
4. Hệ thống MỞ KHÓA NGAY LẬP TỨC:
   • Xuất file Biên bản bàn giao K08.
   • Ghi nhận công nợ bảo lãnh.
   • TỰ ĐỘNG GIẢI NGÂN TIỀN LƯƠNG KHOÁN (K02, K03, K05, K06) CHO TOÀN ĐỘI!
```
