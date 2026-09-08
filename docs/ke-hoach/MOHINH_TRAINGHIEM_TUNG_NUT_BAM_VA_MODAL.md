# 🚀 BẢN THIẾT KẾ MÔ PHỎNG TRẢI NGHIỆM THỰC CHIẾN TỪ GÓC NHÌN NHÂN VIÊN
## DỰ ÁN: BÁCH KHOA ERP — ĐO ĐẠC ĐỊA CHÍNH, BIÊN TẬP CAD & PHÁP LÝ NHÀ ĐẤT
### TÀI LIỆU "NẶNG ĐÔ" MÔ PHỎNG CHI TIẾT TỪNG NÚT BẤM, MODAL POPUP & PHẢN ỨNG HỆ THỐNG

> **Góc nhìn (Persona):** Bạn là Thợ đo hiện trường, Thợ vẽ CAD, Chuyên viên Pháp lý hoặc Nhân viên Bàn giao.  
> **Mục tiêu:** Khi gặp từng tình huống nghiệp vụ thực tế ngoài đời, bạn nhìn thấy gì, bấm nút gì, màn hình nào bật lên, điền gì vào form và hệ thống xử lý ra sao.

---

# 📑 MỤC LỤC 7 KỊCH BẢN THAO TÁC THỰC CHIẾN

1. [Kịch bản 1: Săn ca Đo đạc K02 (Chọn Thợ chính 250k / Thợ phụ 100k) & Nộp 4 ảnh mốc GPS](#-kịch-bản-1-nhận-ca-đo-đạc-k02--nộp-4-ảnh-mốc-gps)
2. [Kịch bản 2: Săn ca Vẽ CAD Nhảy Cóc K03 (Dùng Trích lục VPĐK khách nộp sẵn)](#-kịch-bản-2-săn-ca-vẽ-cad-nhảy-cóc-k03-dùng-trích-lục-khách-nộp)
3. [Kịch bản 3: Đi nộp Một Cửa VPĐKĐĐ (K06) & Chụp Phiếu hẹn Một Cửa](#-kịch-bản-3-đi-nộp-một-cửa-vpđkđđ-k06--nộp-phiếu-hẹn)
4. [Kịch bản 4: VPĐK Trả Hồ Sơ Tại K06 ➔ Bấm Trả Về & Chọn Bước Rollback (K03 hoặc K02)](#-kịch-bản-4-vpđk-trả-hồ-sơ--chọn-bước-rollback-k03k02)
5. [Kịch bản 5: Bàn Giao Sổ Đỏ K08 Khi Khách Còn Nợ Tiền (Lập Đơn Xin Bảo Lãnh Nợ)](#-kịch-bản-5-bàn-giao-sổ-k08-khi-còn-nợ--xin-bảo-lãnh-giám-đốc)
6. [Kịch bản 6: Bị Chặn Nhận Việc Do Nợ Bản Vẽ CAD (WIP Limit >= 3)](#-kịch-bản-6-bị-chặn-nhận-việc-do-nợ-bản-vẽ-cad-wip-limit--3)
7. [Kịch bản 7: Đi Đo Vùng Mất Sóng 4G ➔ Khai Báo Bắt Đầu Hồi Tố (Manual Adjustment)](#-kịch-bản-7-đi-đo-vùng-mất-sóng--khai-báo-bắt-đầu-hồi-tố)

---

# 🎬 KỊCH BẢN 1: NHẬN CA ĐO ĐẠC K02 & NỘP 4 ẢNH MỐC GPS

### 1.1. Bối cảnh:
Bạn là **Nguyễn Văn A (Thợ chính)**. Sáng 07:15 mở Bàn làm việc, thấy HĐ 014 ở Quận 7 có ca đo đang mở.

### 1.2. Nhìn thấy trên Bể việc:
```
┌────────────────────────────────────────────────────────┐
│ 📐 K02 Đo đạc hiện trường · HĐ 014/BK-2026             │
│ Khách: Anh Tuấn · 📍 123 Nguyễn Thị Thập, P. Tân Phong │
│ 💡 Cơ cấu: 1 Thợ chính (250k) + 1 Thợ phụ (100k)       │
│                                                        │
│   👉 [ 🚀 Nhận Thợ chính (250k) ]  [ 🤝 Nhận Thợ phụ ] │
└────────────────────────────────────────────────────────┘
```

### 1.3. Thao tác bấm nút:
- Bạn bấm vào nút: **`[ 🚀 Nhận Thợ chính (250k) ]`**.

### 1.4. Màn hình Popup bật lên (Modal 1.1):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🚀 XÁC NHẬN NHẬN CA ĐO ĐẠC HIỆN TRƯỜNG — HĐ 014/BK-2026                 │
├─────────────────────────────────────────────────────────────────────────┤
│ 📍 Địa chỉ đo: 123 Nguyễn Thị Thập, P. Tân Phong, Quận 7                │
│ 👤 Khách hàng: Anh Tuấn (SĐT: 0908.123.456)                             │
│ 💰 Định mức khoán: 250.000 đ · ⏱ SLA quy định: 4 giờ                    │
│                                                                         │
│ 📋 CHECKLIST THIẾT BỊ & HỒ SƠ MANG THEO:                                │
│    [✓] Đã kiểm tra máy đo RTK GNSS (Pin > 80%, Đủ sim 4G kết nối Cors)  │
│    [✓] Đã mang đủ 04 cọc mốc sắt / đinh bê tông                         │
│    [✓] Đã tải bản sao Sổ đỏ & Bản trích lục tham chiếu                  │
├─────────────────────────────────────────────────────────────────────────┤
│                     [ ❌ Hủy ]        👉 [ 🚀 BẮT ĐẦU XUẤT PHÁT ĐO ]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.5. Phản ứng hệ thống sau khi bấm:
- Dải **`ActiveWorkStrip`** lập tức kích hoạt:
  `⏱ 00:00:01 · Đang đo đạc HĐ 014 (Thợ chính) · [ 📁 Tải sơ đồ tham chiếu ] · [ ⏹️ Nộp nghiệm thu ]`
- Lịch tuần FullCalendar tự động tô khối màu xanh dương: `📐 K02 Đo đạc HĐ 014 (07:30 - 11:30)`.

### 1.6. Khi đo xong tại hiện trường (Bấm nộp nghiệm thu):
- Bạn bấm nút: **`[ ⏹️ Nộp nghiệm thu ]`**.
- Màn hình Popup bật lên (Modal 1.2):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📷 NỘP MINH CHỨNG NGHIỆM THU ĐO HIỆN TRƯỜNG (K02)                       │
├─────────────────────────────────────────────────────────────────────────┤
│ 📸 4 ẢNH CHỤP MỐC RANH THỰC ĐỊA (CÓ TỌA ĐỘ GPS & ĐÓNG DẤU NGÀY GIỜ):    │
│    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│    │ [📷 Mốc 1 ✓] │ │ [📷 Mốc 2 ✓] │ │ [📷 Mốc 3 ✓] │ │ [📷 Mốc 4 ✓] │  │
│    └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
│ 📁 FILE TỌA ĐỘ TRẮC ĐỊA XUẤT TỪ MÁY RTK (.CSV / .TXT):                  │
│    [ 📄 toado_tho_HD014.csv (14.2 KB) 🗑️ ]  [ 📤 Tải file khác ]         │
│                                                                         │
│ 📝 GHI CHÚ HIỆN TRƯỜNG (NẾU CÓ):                                        │
│    [ Mốc 3 giáp tường nhà bên cạnh, chủ đất đã ký biên bản xác nhận ranh ]│
├─────────────────────────────────────────────────────────────────────────┤
│                     [ ❌ Đóng ]      👉 [ 📤 NỘP BÁO CÁO NGHIỆM THU ]   │
└─────────────────────────────────────────────────────────────────────────┘
```
- Bấm **`[ 📤 Nộp báo cáo nghiệm thu ]`** ➔ Ca đo chuyển sang `SUBMITTED` ➔ Bạn được mở khóa nhận ngay ca tiếp theo trong ngày!

---

# 🎬 KỊCH BẢN 2: SĂN CA VẼ CAD NHẢY CÓC K03 (DÙNG TRÍCH LỤC KHÁCH NỘP)

### 2.1. Bối cảnh:
Bạn là **Lê Văn C (Thợ CAD)**. Khách hàng HĐ 015 đã nộp sẵn bản Trích lục từ Chi nhánh VPĐKĐĐ (không cần đi đo K02).

### 2.2. Nhìn thấy trên Bể việc:
```
┌────────────────────────────────────────────────────────┐
│ ⚡ K03 Biên tập CAD (Nhảy cóc) · HĐ 015/BK-2026        │
│ Khách: Anh Hoàng Nam · 📍 P. Thảo Điền, Quận 2         │
│ 📄 Nguồn: Khách nộp sẵn Trích lục VPĐK (2 file PDF)    │
│ 💰 Khoán: 200.000 đ · ⏱ SLA: 4 giờ                     │
│                                                        │
│            👉 [ 🚀 NHẬN VIỆC BIÊN TẬP CAD ]            │
└────────────────────────────────────────────────────────┘
```

### 2.3. Thao tác bấm nút:
- Bạn bấm: **`[ 🚀 Nhận việc biên tập CAD ]`**.

### 2.4. Màn hình Popup bật lên (Modal 2):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚡ TIẾP NHẬN CA VẼ CAD DIỆN FAST-TRACK (DÙNG TRÍCH LỤC KHÁCH NỘP)       │
├─────────────────────────────────────────────────────────────────────────┤
│ 📄 HỒ SƠ NGUỒN DO KHÁCH HÀNG CUNG CẤP:                                  │
│    1. [ 📑 TrichLuc_Thua81_To12.pdf (1.8 MB) 👁️ Xem nhanh ]            │
│    2. [ 📑 SoDoHienTrang_2024.pdf (2.4 MB) 👁️ Xem nhanh ]              │
│                                                                         │
│ 📤 TẢI LÊN FILE TỌA ĐỘ BỔ SUNG / SỐ HÓA (NẾU CÓ):                       │
│    [ 📤 Kéo thả file .txt / .csv tọa độ vào đây ]                       │
│                                                                         │
│ 🛡️ CAM KẾT TRÁCH NHIỆM KỸ THUẬT:                                       │
│    [✓] Tôi đã đối soát số tờ (12), số thửa (81) và hệ tọa độ VN-2000    │
│        khớp hoàn toàn với hồ sơ gốc của khách hàng.                     │
├─────────────────────────────────────────────────────────────────────────┤
│                  [ ❌ Hủy ]        👉 [ 💻 TIẾP NHẬN & BẮT ĐẦU VẼ ]     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.5. Phản ứng hệ thống:
- Live Timer kích hoạt: `⏱ 00:00:01 · Đang vẽ CAD HĐ 015 (Trích lục VPĐK)`.
- Ghi log hệ thống: *"Thợ CAD Lê Văn C nhận K03 diện Fast-Track dựa trên hồ sơ khách nộp"*.

---

# 🎬 KỊCH BẢN 3: ĐI NỘP MỘT CỬA VPĐKĐĐ (K06) & NỘP PHIẾU HẸN

### 3.1. Bối cảnh:
Bạn là **Phạm Thị D (Chuyên viên Pháp lý)**. Bạn cầm bộ hồ sơ hoàn chỉnh đến Chi nhánh VPĐKĐĐ Quận 7 để nộp.

### 3.2. Khi cán bộ Một Cửa trao Phiếu Tiếp Nhận & Hẹn Trả Kết Quả:
- Bạn mở app trên điện thoại, tại thanh việc đang làm bấm: **`[ ⏹️ Nộp Biên Nhận Một Cửa ]`**.

### 3.3. Màn hình Popup bật lên (Modal 3):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🏛️ CẬP NHẬT BIÊN NHẬN & GIẤY HẸN MỘT CỬA VPĐKĐĐ (K06)                   │
├─────────────────────────────────────────────────────────────────────────┤
│ 📍 Cơ quan tiếp nhận: Chi nhánh Văn phòng Đăng ký Đất đai Quận 7        │
│                                                                         │
│ 🔢 MÃ SỐ BIÊN NHẬN:                                                     │
│    [ BN-2026-08194-Q7_________________________________________________] │
│                                                                         │
│ 📅 NGÀY HẸN TRẢ KẾT QUẢ THEO PHIẾU:                                     │
│    [ 05 / 09 / 2026 ▾ ] (Hệ thống sẽ tự động nhắc việc trước 1 ngày)    │
│                                                                         │
│ 📸 ẢNH CHỤP PHIẾU HẸN / BIÊN NHẬN (RÕ CHỮ & DẤU MỘC):                   │
│    ┌──────────────────────────────────────────────────────────────┐     │
│    │ [ 📷 phieu_hen_mot_cua_014.jpg (2.1 MB)  🗑️ Xóa / Chụp lại ] │     │
│    └──────────────────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────────────────┤
│                  [ ❌ Đóng ]      👉 [ ✅ HOÀN TẤT NỘP MỘT CỬA ]        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 🎬 KỊCH BẢN 4: VPĐK TRẢ HỒ SƠ ➔ CHỌN BƯỚC ROLLBACK (K03/K02)

### 4.1. Bối cảnh:
Đến ngày hẹn, Cán bộ VPĐKĐĐ ra **Thông báo yêu cầu sửa đổi**: *"Bản vẽ chưa cập nhật lộ giới mở hẻm 6m theo Quyết định mới"*.

### 4.2. Thao tác của Chuyên viên Pháp lý:
- Tại Node K06 trên Timeline / Workspace, bạn bấm nút đỏ: **`[ 🔄 Báo VPĐK trả hồ sơ & Lùi bước quy trình ]`**.

### 4.3. Màn hình Popup bật lên (Modal 4):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔄 XỬ LÝ HỒ SƠ BỊ TRẢ VỀ & CHỌN BƯỚC LÀM LẠI (CASCADE RESET)            │
├─────────────────────────────────────────────────────────────────────────┤
│ 📁 HỢP ĐỒNG: HĐ 015/BK-2026 · Khách: Hoàng Nam                          │
│                                                                         │
│ 📝 LÝ DO TRẢ HỒ SƠ (GHI CHÚ CHI TIẾT TỪ VPĐK):                          │
│    [ VPĐK yêu cầu điều chỉnh lộ giới mở hẻm từ 4m lên 6m theo QĐ mới___] │
│                                                                         │
│ 📸 ĐÍNH KÈM THÔNG BÁO / PHIẾU HƯỚNG DẪN CỦA CƠ QUAN:                    │
│    [ 📄 PhieuYeuCauSuaDoi_VPDK.pdf (1.2 MB) 🗑️ ] [ + Tải thêm ảnh ]      │
│                                                                         │
│ 🎯 CHỌN BƯỚC CẦN QUAY VỀ LÀM LẠI (HỆ THỐNG TỰ ĐỘNG RESET CÁC BƯỚC SAU): │
│    ( ) 📐 [K02] Khảo sát & Đo lại hiện trường   (Reset từ K02 ➔ K06)    │
│    (●) 💻 [K03] Biên tập & Vẽ lại bản vẽ CAD    (Reset từ K03 ➔ K06) ⭐ │
│    ( ) ⚖️ [K04] Soạn lại hồ sơ kỹ thuật & Đơn   (Reset từ K04 ➔ K06)    │
│                                                                         │
│ ⚠️ HỆ THỐNG SẼ:                                                         │
│    • Đẩy Node K03 vào Bể việc Đo vẽ với nhãn [ 🔥 Khắc phục theo VPĐK ].│
│    • Đặt các bước K04, K05, K06 về trạng thái PENDING chờ làm lại.      │
├─────────────────────────────────────────────────────────────────────────┤
│               [ ❌ Hủy ]        👉 [ 🔄 XÁC NHẬN QUAY NGƯỢC VỀ K03 ]     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.4. Phản ứng trên Bàn làm việc của Thợ CAD:
- Bể việc Phòng Đo vẽ lập tức xuất hiện thẻ đỏ khẩn cấp:
```
┌────────────────────────────────────────────────────────┐
│ 🔥 K03 Cad (Làm lại do VPĐK trả về) · HĐ 015           │
│ 📍 Lý do: Cập nhật lộ giới mở hẻm 6m theo QĐ mới       │
│ 📄 [ 👁️ Xem phiếu yêu cầu sửa đổi của VPĐK ]           │
│ 💰 Khoán bổ sung: 100.000 đ · ⏱ SLA: 2 giờ             │
│                                                        │
│             👉 [ 🚀 NHẬN SỬA BẢN VẼ NGAY ]             │
└────────────────────────────────────────────────────────┘
```

---

# 🎬 KỊCH BẢN 5: BÀN GIAO SỔ K08 KHI CÒN NỢ ➔ XIN BẢO LÃNH GIÁM ĐỐC

### 5.1. Bối cảnh:
Bạn là **Trần Văn E (Nhân viên bàn giao)**. Khách hàng đến lấy sổ đỏ lúc 08:30 sáng để đi công chứng, còn nợ **5.000.000 đ** (hẹn 14:00 chiều chuyển khoản).

### 5.2. Nhìn thấy tại Node K08:
- Cổng công nợ báo khóa đỏ: `[ 🔒 KHÓA BÀN GIAO: Khách hàng còn nợ 5.000.000 đ ]`.
- Bạn bấm nút: **`[ 📝 Lập đơn xin bảo lãnh bàn giao khi còn nợ ]`**.

### 5.3. Màn hình Popup bật lên (Modal 5):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📝 ĐƠN XIN DUYỆT BÀN GIAO SỔ ĐỎ KHI CÒN CÔNG NỢ (K08)                   │
├─────────────────────────────────────────────────────────────────────────┤
│ 📁 Hợp đồng: HĐ 008/BK-2026 · Khách hàng: Anh Phát                      │
│ 💰 Giá trị HĐ: 25.000.000 đ  │  Đã thu: 20.000.000 đ  │  Còn nợ: 5.000k │
│                                                                         │
│ 📝 LÝ DO XIN BẢO LÃNH BÀN GIAO TRƯỚC:                                   │
│    [ Khách hàng cần lấy sổ gấp đi công chứng thế chấp ngân hàng lúc 9h. │
│      Cam kết chuyển khoản 5.000.000 đ còn lại trước 15h00 chiều nay.___] │
│                                                                         │
│ 📅 THỜI HẠN CAM KẾT THU ĐỦ TIỀN:                                        │
│    [ 22 / 08 / 2026 — 17:00 ▾ ]                                         │
├─────────────────────────────────────────────────────────────────────────┤
│               [ ❌ Hủy ]        👉 [ 📤 GỬI GIÁM ĐỐC PHÊ DUYỆT ]        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.4. Phản ứng hệ thống:
- Giám đốc nhận thông báo khẩn trên Dashboard ➔ Bấm **`[ 🛡️ Phê duyệt bảo lãnh ]`**.
- Màn hình Bàn giao của bạn ngay lập tức chuyển sang màu xanh:
  `[ 🟢 ĐÃ ĐƯỢC GIÁM ĐỐC BẢO LÃNH CHO NỢ ] ➔ [ 🤝 Ký Biên Bản Bàn Giao ]`.

---

# 🎬 KỊCH BẢN 6: BỊ CHẶN NHẬN VIỆC DO NỢ BẢN VẼ CAD (WIP LIMIT >= 3)

### 6.1. Bối cảnh:
Bạn là Thợ đo/CAD đang ôm 3 bản vẽ CAD của các HĐ 011, 012, 014 chưa nộp. Bạn cố tình bấm nhận tiếp ca thứ 4 trong Bể việc.

### 6.2. Màn hình Popup cảnh báo bật lên (Modal 6):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚠️ TẠM KHÓA NHẬN VIỆC — BẠN ĐANG VƯỢT HẠN MỨC ÔM VIỆC (WIP LIMIT)       │
├─────────────────────────────────────────────────────────────────────────┤
│ 🛑 Hệ thống quy định mỗi nhân viên không được nợ quá 03 bản vẽ CAD.    │
│                                                                         │
│ 📋 DANH SÁCH 03 BẢN VẼ BẠN ĐANG NỢ CHƯA NỘP NGHIỆM THU:                 │
│    1. 💻 HĐ 011/BK-2026 · Khách: Chị Hạnh  (Đã nhận: 2 ngày trước)      │
│    2. 💻 HĐ 012/BK-2026 · Khách: Anh Dũng  (Đã nhận: 1 ngày trước)      │
│    3. 💻 HĐ 014/BK-2026 · Khách: Anh Tuấn  (Đã nhận: Sáng nay)          │
│                                                                         │
│ 💡 GIẢI PHÁP:                                                           │
│    Bạn hãy hoàn thành và bấm [ ⏹️ Nộp nghiệm thu ] ít nhất 01 bản vẽ   │
│    để hệ thống tự động mở khóa Bể việc cho bạn!                         │
├─────────────────────────────────────────────────────────────────────────┤
│                           👉 [ 💻 VỀ VẼ BẢN VẼ NGAY ]                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 🎬 KỊCH BẢN 7: ĐI ĐO VÙNG MẤT SÓNG ➔ KHAI BÁO BẮT ĐẦU HỒI TỐ

### 7.1. Bối cảnh:
Bạn đi đo đạc tại xã Hiệp Phước (Nhà Bè) hoặc Cần Giờ vùng sâu mất sóng 4G lúc 07:30. Đến 10:30 về tới văn phòng mới mở máy.

### 7.2. Thao tác:
- Tại thẻ công việc, bạn bấm: **`[ ⏱️ Khai báo bắt đầu hồi tố ]`**.

### 7.3. Màn hình Popup bật lên (Modal 7):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⏱️ KHAI BÁO THỜI GIAN BẮT ĐẦU HỒI TỐ (MANUAL ADJUSTMENT)                 │
├─────────────────────────────────────────────────────────────────────────┤
│ 📁 Hợp đồng: HĐ 016/BK-2026 · Khảo sát hiện trường Nhà Bè               │
│                                                                         │
│ 📅 THỜI ĐIỂM THỰC TẾ XUẤT PHÁT ĐO NGOÀI THỰC ĐỊA:                       │
│    Ngày: [ 22 / 08 / 2026 ]   Giờ: [ 07 : 30 ] sáng                     │
│                                                                         │
│ 📝 LÝ DO KHAI BÁO HỒI TỐ:                                               │
│    [ Đi đo tại ấp 4 xã Hiệp Phước vùng mất sóng 4G không kết nối mạng___]│
│                                                                         │
│ 💡 Lưu ý: Ca việc sẽ được gắn cờ [ 🟡 Khai báo hồi tố ] để Giám đốc     │
│    kiểm tra đối soát khi duyệt nghiệm thu.                              │
├─────────────────────────────────────────────────────────────────────────┤
│                 [ ❌ Hủy ]        👉 [ 💾 LƯU & BẮT ĐẦU TÍNH GIỜ ]       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 💎 BẢNG ĐỐI SOÁT TỔNG THỂ CHO CODEX THI CÔNG FRONTEND & BACKEND

| Kịch Bản | Nút Bấm Kích Hoạt | Modal Bật Lên | Endpoint Backend Gọi Tới | Thay Đổi Trên CSDL |
| :--- | :--- | :--- | :--- | :--- |
| **1. Nhận ca đo K02** | `[ 🚀 Nhận Thợ chính (250k) ]` | `Modal 1.1: Xác nhận thiết bị` | `POST /api/employee-portal/tasks/{id}/claim` | `assigned_employee_id = X, role_code = 'MAIN', status = 'in_progress', started_at = NOW()` |
| **2. Nộp 4 ảnh GPS** | `[ ⏹️ Nộp nghiệm thu ]` | `Modal 1.2: Upload ảnh & tọa độ` | `POST /api/employee-portal/tasks/{id}/submit` | `status = 'submitted', submitted_at = NOW(), checklist_evidence = JSON` |
| **3. Nhận Cad nhảy cóc** | `[ 🚀 Nhận việc vẽ CAD ]` | `Modal 2: Sheet đối soát trích lục` | `POST /api/employee-portal/tasks/{id}/claim-fast-track` | `source_type = 'EXTERNAL_FAST_TRACK', status = 'in_progress'` |
| **4. Nộp biên nhận K06** | `[ ⏹️ Nộp Biên Nhận ]` | `Modal 3: Nhập mã BN & ngày hẹn` | `POST /api/employee-portal/tasks/{id}/submit-filing` | `filing_code = '...', appointment_date = '2026-09-05', status = 'submitted'` |
| **5. VPĐK Trả hồ sơ** | `[ 🔄 Báo VPĐK trả ]` | `Modal 4: Chọn Rollback Target` | `POST /api/contracts/{id}/workflow/rollback` | `target_node.status = 'ready', intermediate_nodes.status = 'pending', version = 2` |
| **6. Xin bảo lãnh nợ K08** | `[ 📝 Lập đơn xin nợ ]` | `Modal 5: Đơn xin bảo lãnh nợ` | `POST /api/contracts/{id}/debt-waiver-request` | `debt_waiver_status = 'PENDING_DIRECTOR'` |
| **7. Chặn WIP Limit** | Bấm nhận ca thứ 4 | `Modal 6: Cảnh báo quá 3 bản vẽ` | Chặn tại Client & Backend 400 | Không thay đổi CSDL |
| **8. Bắt đầu hồi tố** | `[ ⏱️ Bắt đầu hồi tố ]` | `Modal 7: Chọn giờ xuất phát` | `POST /api/employee-portal/tasks/{id}/claim-retroactive` | `started_at = input_time, is_retroactive = true` |
