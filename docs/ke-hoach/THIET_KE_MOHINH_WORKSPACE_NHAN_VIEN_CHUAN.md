# 📱 BẢN THIẾT KẾ MÔ PHỎNG GIAO DIỆN BÀN LÀM VIỆC NHÂN VIÊN CHUẨN NGHIỆP VỤ
## DỰ ÁN: BÁCH KHOA ERP — ĐO ĐẠC ĐỊA CHÍNH, BẢN VẼ CAD & PHÁP LÝ NHÀ ĐẤT
### ÁP DỤNG TƯ DUY PHẢN BIỆN & ĐỐI SOÁT TOÀN DIỆN VỚI MASTER PLAN

> **Tài liệu chuẩn hóa thực chiến:** Loại bỏ hoàn toàn các text mẫu chung chung (như "Viết code", "Banner", "Họp phòng ban").  
> **100% Nội dung & Luồng nghiệp vụ chuẩn của Bách Khoa ERP:** Đo đạc hiện trường (K02) ➔ Biên tập CAD (K03) ➔ Hồ sơ pháp lý (K04) ➔ Thẩm tra (K05) ➔ Nộp VPĐKĐĐ (K06) ➔ Bàn giao & Thu nợ (K08).

---

# 🧠 BẢN ĐỐI SOÁT PHẢN BIỆN NGHIỆP VỤ (CRITICAL CROSS-CHECK)

| Thành phần trên UI | ❌ Lỗi tư duy giao diện mẫu (Generic Mockup) | ✅ Chuẩn phản biện nghiệp vụ Bách Khoa ERP (To-Be) |
| :--- | :--- | :--- |
| **Card Bể việc (Task Pool)** | Ghi "Viết code Module A", "Banner sự kiện" không có ngữ cảnh. | **Mỗi card là 1 ca khoán cụ thể:** Mã HĐ (`HĐ-015/BK-2026`), Tên khách (`Hoàng Nam`), Địa bàn (`Q.7 / Nhà Bè`), Mã Node (`K02 / K03 / K06`), Nguồn file (`Trích lục VPĐK` vs `Ảnh mốc K02`), Tiền khoán (`250k`), KPI (`+10đ`), Nút `[ 🚀 Nhận việc ]`. |
| **Nhảy cóc việc (Fast-track)** | Không biết file đầu vào lấy từ đâu vì bước trước bị bỏ qua. | **Sheet đối soát dữ liệu 1-chạm:** Tự động nạp file Trích lục khách nộp + Checkbox cam kết đối soát tọa độ + Ghi log audit diện Fast-Track. |
| **Việc đang làm (Active Strip)** | Text chung chung không gắn kết với quy trình. | **Live Timer Mono `⏱ 01:45:12`**, Gắn rõ HĐ đang làm (`Đang vẽ CAD HĐ 015`), Link tải túi hồ sơ (`[ 📄 Tải ảnh mốc K02 ]` hoặc `[ 📄 Trích lục VPĐK ]`), Nút `[ ⏹️ Nộp nghiệm thu ]` để upload bản vẽ `.dwg` / ảnh GPS. |
| **Lịch tuần (FullCalendar)** | Ghi "Họp phòng ban", "Viết báo cáo" chiếm hết các ngày. | **Xếp ca sáng/chiều chuẩn dân đo đạc:** <br>• **Sáng (07:00):** Đi đo thực địa ngoài trời (K02) hoặc Đi nộp Chi nhánh VPĐKĐĐ (K06).<br>• **Chiều (13:00):** Về VP ngồi máy lạnh vẽ CAD (K03), Soạn hồ sơ (K04) hoặc Bàn giao sổ (K08). |
| **Sidebar 300px** | Chỉ hiện tin tức đơn thuần. | **Gắn liền vận hành cá nhân:** Số ngày phép còn lại (12) + Nộp đơn phép, Thông báo chốt hồ sơ/quy định an toàn đo đạc, Sổ tay quy trình & Sơ đồ tổ chức. |

---

# 📐 MÔ PHỎNG BỐ CỤC FULLSCREEN CHUẨN NGHIỆP VỤ (WIREFRAME 100% REAL-DATA)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏢 BÁCH KHOA ERP — KHÔNG GIAN LÀM VIỆC      [ 🔍 Tìm mã HĐ, tên khách, số tờ/thửa... ]       [ 🔄 Đồng bộ ] [ 🌙 ] [ 🔔 3 ] [ 👤 Nguyễn Văn A ▾ ]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 👤 CHÀO BUỔI SÁNG, NGUYỄN VĂN A                                                                               [ 🔴 Check-out / Đã Check-in ] │
│    🟢 Trạng thái: Đang làm việc (Online) · Đội Đo đạc & Biên tập CAD · Phòng Kỹ thuật                                                  │
├──────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────┤
│ 🖥️ CỘT CHÍNH (MAIN WORKSPACE - 75%): Bọc trong `.employee-workspace__main`               │ 📁 CỘT PHỤ (SIDEBAR - 25% — 300px)          │
│                                                                                          │                                             │
│ 🔵 BỂ VIỆC SẴN SÀNG NHẬN (TaskPoolPanel - Grid 4 cột) ────────────────────────────────── │ 📅 THÔNG TIN NGHỈ PHÉP ──────────────────── │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │ • Phép năm còn lại: 12 / 14 ngày            │
│ │ 📐 K02 Đo đạc hiện tr│ │ 💻 K03 Biên tập CAD  │ │ ⚡ K03 Cad (Nhảy cóc)│ │ 🏛️ K06 Nộp VPĐK Q.7 │ │ • Đã nghỉ trong năm: 2 ngày                 │
│ │ HĐ 014 · Khách: Tuấn │ │ HĐ 012 · Khách: Dũng │ │ HĐ 015 · Trích lục sẵn│ │ HĐ 009 · Khách: Oanh │ │ [ + Tạo đơn nghỉ phép ]                     │
│ │ 📍 P. Tân Phong, Q.7 │ │ 📍 Xã Phước Kiển, NB │ │ 📍 P. Thảo Điền, Q.2 │ │ 📍 81 Tân Phú, Q.7    │ ├─────────────────────────────────────────────┤
│ │ Khoán: 250k  KPI: +10│ │ Khoán: 200k  KPI: +10│ │ Khoán: 200k  KPI: +10│ │ Khoán: 100k  KPI: +05│ 📢 TIN TỨC & THÔNG BÁO ──────────────────── │
│ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận việc ]   │ │ 🔵 Thông báo nộp hồ sơ trước 16h30        │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ │ 🟢 Cập nhật mẫu biên bản bàn giao K08       │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │ 🔴 Hạn chót nghiệm thu bản vẽ tháng 8      │
│ │ 📐 K02 Cắm mốc ranh  │ │ 💻 K03 Biên tập CAD  │ │ ⚖️ K04 Hồ sơ kỹ thuật│ │ 🤝 K08 Bàn giao sổ │ │ 🟡 Quy định an toàn máy đo RTK ngoài trời │
│ │ HĐ 016 · Khách: Minh │ │ HĐ 011 · Khách: Hạnh │ │ HĐ 017 · Khách: Cường│ │ HĐ 008 · Khách: Phát │ ├─────────────────────────────────────────────┤
│ │ 📍 Xã Hiệp Phước, NB │ │ 📍 P. Phú Mỹ, Q.7    │ │ 📍 P. Bình An, Q.2   │ │ 📍 P. Tân Thuận, Q.7 │ 🔗 LIÊN KẾT NHANH ───────────────────────── │
│ │ Khoán: 300k  KPI: +15│ │ Khoán: 200k  KPI: +10│ │ Khoán: 150k  KPI: +08│ │ Khoán: 150k  KPI: +05│ • [ 📖 Sổ tay quy trình kỹ thuật ]          │
│ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận việc ]   │ • [ 👥 Danh bạ & Sơ đồ tổ chức ]            │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ • [ 💰 Bảng kê quyết toán khoán ]           │
│                                                                                          │                                             │
│ 🔴 VIỆC ĐANG LÀM & TỔNG KẾT HÔM NAY (ActiveWorkStrip + DailySummary) ─────────────────── │                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ ┌───────────────────┐ │                                             │
│ │ ⏱ 01:45:12  HĐ 015 · Đang vẽ CAD (Dùng Trích Lục VPĐK)          │ │ ✓ 2 ca đã nộp   │ │                                             │
│ │ [ 📄 Xem file trích lục gốc ]    👉 [ ⏹️ Nộp bản vẽ CAD .dwg ]    │ │ ⏱ 1 đang làm    │ │                                             │
│ │                                                                 │ │ 💰 550.000 đ khoán│ │                                             │
│ └─────────────────────────────────────────────────────────────────┘ └───────────────────┘ └─────────────────────────────────────────────┘
│                                                                                                                                        │
│ 📅 LỊCH LÀM VIỆC & PHÂN BỔ CA TUẦN NÀY (FullCalendar > 1000px) ──────────────────────────────────────────────────────────────────────── │
│ ┌────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬─────────────────────┐ │
│ │        │    THỨ HAI     │     THỨ BA     │     THỨ TƯ     │    THỨ NĂM     │    THỨ SÁU     │    THỨ BẢY     │      CHỦ NHẬT       │ │
│ │        │   17/08/2026   │   18/08/2026   │   19/08/2026   │   20/08/2026   │   21/08/2026   │   22/08/2026   │     23/08/2026      │ │
│ ├────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼─────────────────────┤ │
│ │ SÁNG   │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │                │                     │ │
│ │ (07:00)│ │📐 K02 Đo đạc │ │ │🏛️ K06 Nộp VP│ │ │📐 K02 Cắm mốc│ │ │📐 K02 Đo đạc │ │ │🏛️ K06 Nộp VP│ │                │                     │ │
│ │        │ │HĐ 012 · Q.7  │ │ │ĐK Q.7 HĐ 009│ │ │Nhà Bè HĐ 016 │ │ │Bình Chánh    │ │ │ĐK Q.2 HĐ 010│ │                │                     │ │
│ │        │ │07:30 - 11:00 │ │ │08:00 - 10:30│ │ │07:30 - 11:30 │ │ │07:30 - 11:00 │ │ │08:00 - 10:00│ │                │                     │ │
│ │        │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │                │                     │ │
│ ├────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼─────────────────────┤ │
│ │ CHIỀU  │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │                │                     │ │
│ │ (13:00)│ │💻 K03 Vẽ CAD │ │ │💻 K03 Vẽ CAD │ │ │⚖️ K04 Soạn HS│ │ │💻 K03 Vẽ CAD │ │ │🤝 K08 Giao sổ│ │                │                     │ │
│ │        │ │HĐ 012        │ │ │HĐ 015        │ │ │kỹ thuật HĐ016│ │ │HĐ 018        │ │ │HĐ 008        │ │                │                     │ │
│ │        │ │13:30 - 16:30 │ │ │13:30 - 16:00 │ │ │13:30 - 15:30 │ │ │13:30 - 16:30 │ │ │14:00 - 16:00 │ │                │                     │ │
│ │        │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │                │                     │ │
│ │        │                │ ┌────────────┐ │                │ ┌────────────┐ │                │                │                     │ │
│ │        │                │ │🔍 K05 Thẩm tra│ │                │ │🤝 K08 Giao sổ│ │                │                │                     │ │
│ │        │                │ │nội bộ HĐ 011 │ │                │ │HĐ 006        │ │                │                │                     │ │
│ │        │                │ │16:00 - 17:00 │ │                │ │16:30 - 17:30 │ │                │                │                     │ │
│ │        │                │ └────────────┘ │                │ └────────────┘ │                │                │                     │ │
│ └────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 🚀 4 ĐIỂM SÁNG GIÁ TRONG THIẾT KẾ PHẢN BIỆN NGHIỆP VỤ:

### 1. 🏷️ Thẻ Bể Việc Gắn Liền Với Hợp Đồng & Hồ Sơ Đất Đai:
- Mỗi thẻ đều ghi rõ: **Mã HĐ + Tên Khách + Địa bàn hành chính (Phường/Quận)**.
- Người thợ đo khi nhìn vào thẻ biết ngay địa bàn (VD: "Q.7" hay "Nhà Bè") để cân nhắc tuyến đường chạy xe và thời gian nhận ca.

### 2. ⚡ Xử Lý Ca Nhảy Cóc (Fast-track) Cực Kỳ Minh Bạch:
- Thẻ có huy hiệu `⚡ K03 Cad (Nhảy cóc)` ➔ Khi bấm nhận việc, hệ thống hiển thị Sheet tải file trích lục gốc do khách hàng cung cấp, không bị báo lỗi "thiếu file từ bước đo K02".

### 3. ⏱️ Thanh Live Timer Gắn Liền Với Hành Động Nghiệm Thu Kỹ Thuật:
- Nút nộp không ghi chung chung mà ghi rõ: **`[ ⏹️ Nộp bản vẽ CAD .dwg ]`** (đối với thợ Cad) hoặc **`[ ⏹️ Nộp 4 ảnh mốc ranh GPS ]`** (đối với thợ đo).

### 4. 📅 Lịch Tuần Phản Ánh Nhịp Độ Vận Hành Thực Địa:
- Buổi sáng tập trung đo vẽ hiện trường và nộp hồ sơ nhà nước.
- Buổi chiều tập trung vẽ CAD nội nghiệp, soạn hồ sơ pháp lý và bàn giao giấy tờ cho khách.
