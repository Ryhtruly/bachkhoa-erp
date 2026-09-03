# 🚀 BẢN THIẾT KẾ MÔ PHỎNG TRẢI NGHIỆM THỰC CHIẾN TỪ GÓC NHÂN VIÊN
## DỰ ÁN: BÁCH KHOA ERP — ĐO ĐẠC ĐỊA CHÍNH, BIÊN TẬP CAD & PHÁP LÝ NHÀ ĐẤT
### CƠ CHẾ: NHẬN TRỌN CHUỖI K ĐO VẼ, SLOT PHỤ RIÊNG & QUY TRÌNH NHƯỜNG VIỆC BẤT KHẢ KHÁNG (HELP / YIELD NODE)

> **Góc nhìn (Persona):** Bạn là Thợ đo hiện trường, Thợ vẽ CAD, Chuyên viên Pháp lý.  
> **Quy tắc Bể việc cốt lõi:**  
> 1. Mỗi thẻ trên Bể việc đại diện cho **CHUỖI CÁC BƯỚC (K) ĐO VẼ** của Hạng mục Hợp đồng (chỉ gồm các K kỹ thuật đo vẽ như `K02 ➔ K03`), thể hiện rõ mức khoán từng bước và tổng khoán.  
> 2. Chừa riêng **Slot Thợ phụ (K02 - 100k)** cho đồng đội khác nhận phụ đi cùng.  
> 3. **Cơ chế Cứu viện / Bất khả kháng:** Khi đã nhận nhưng gặp sự cố bất khả kháng (ốm đau, hư xe/máy tính), thợ được bấm **`[ 🆘 Bắn lại lên Bể việc yêu cầu cứu viện ]`**. Trong lúc chưa ai nhận thì anh ta vẫn phải tự chịu trách nhiệm; khi có đồng đội nhận làm thay và hoàn thành thì anh ta mới được giải phóng tải để nhận việc mới (nếu < 3 hạng mục).

---

# 📑 MỤC LỤC CÁC KỊCH BẢN THỰC CHIẾN

1. [Thiết kế Thẻ Chuỗi K Đo Vẽ trên Bể Việc (Pool Card Wireframe)](#-thiết-kế-thẻ-chuỗi-k-đo-vẽ-trên-bể-việc)
2. [Kịch bản 1: Săn Trọn Chuỗi K Đo Vẽ HĐ 014 (K02 Đo 250k + K03 CAD 200k = 450k)](#-kịch-bản-1-săn-trọn-chuỗi-k-đo-vẽ-k02--k03)
3. [Kịch bản 2: Săn Slot Thợ Phụ K02 Riêng Biệt (Khoán Phụ 100k)](#-kịch-bản-2-săn-slot-thợ-phụ-k02-riêng-biệt)
4. [Kịch bản 3: Gặp Bất Khả Kháng ➔ Bấm Bắn Node Lên Bể Việc Yêu Cầu Cứu Viện (Yield Node)](#-kịch-bản-3-gặp-bất-khả-kháng--bắn-node-lên-bể-việc-cứu-viện)
5. [Kịch bản 4: Đồng Đội Nhận Cứu Viện ➔ Giải Phóng Tải Để Nhận Hạng Mục Mới (< 3)](#-kịch-bản-4-đồng-đội-nhận-cứu-viện--giải-phóng-tải-nhận-việc-mới)
6. [Kịch bản 5: Không Ai Nhận Cứu Viện ➔ Thợ Buộc Phải Tự Mình Hoàn Thành](#-kịch-bản-5-không-ai-nhận-cứu-viện--thợ-buộc-phải-tự-hoàn-thành)
7. [Kịch bản 6: Đi Nộp Một Cửa Chi Nhánh VPĐKĐĐ (K06) & Nộp Phiếu Hẹn](#-kịch-bản-6-đi-nộp-một-cửa-chi-nhánh-vpđkđđ-k06)
8. [Kịch bản 7: Bàn Giao Giấy Chứng Nhận / Bản Vẽ Cho Khách (K08)](#-kịch-bản-7-bàn-giao-giấy-chứng-nhận--bản-vẽ-cho-khách-k08)

---

# 🔵 THIẾT KẾ THẺ CHUỖI K ĐO VẼ TRÊN BỂ VIỆC

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔵 BỂ VIỆC SẴN SÀNG NHẬN (TaskPoolPanel — Chuỗi K Đo Vẽ & Hạng Mục Dịch Vụ)                                            │
│    Bộ lọc: [ 🔵 Tất cả (8) ]  [ 📐 Chuỗi Đo Vẽ (3) ]  [ 🤝 Slot Thợ Phụ (2) ]  [ 🆘 Ca Cứu Viện (1) ]  [ 🏛️ Nộp VPĐK (1) ]   │
│    Hạn mức tải: [ 📊 Đang giữ: 1/3 Hạng mục ] 🟢 An toàn (Được nhận thêm tối đa 2 hạng mục)                           │
├──────────────────────────┬──────────────────────────┬──────────────────────────┬───────────────────────────────────────┤
│ ┌──────────────────────┐ │ ┌──────────────────────┐ │ ┌──────────────────────┐ │ ┌───────────────────────────────────┐ │
│ │ 📐 CHUỖI K ĐO VẼ     │ │ │ 🤝 SLOT PHỤ ĐO ĐẠC   │ │ │ 🆘 CA CỨU VIỆN CAD   │ │ │ 🏛️ [K06] NỘP MỘT CỬA VPĐKĐĐ       │ │
│ │ HĐ 014 · Khách: Tuấn │ │ │ HĐ 016 · Khách: Minh │ │ │ HĐ 011 · Khách: Hạnh │ │ │ HĐ 009 · Khách: Chị Oanh            │ │
│ │ 📍 P. Tân Phong, Q.7 │ │ │ 📍 Xã Hiệp Phước, NB │ │ │ 📍 P. Phú Mỹ, Quận 7 │ │ │ 📍 81 Tân Phú, Q.7 (Một Cửa)       │ │
│ │ 📑 Hạng mục: Đo vẽ HT│ │ │ 👑 Chính: Nguyễn VănA│ │ │ 👤 Nhường: Lê Văn C  │ │ │ 📑 Hạng mục: Cấp đổi GCN            │ │
│ │ 📋 CÁC BƯỚC ĐO VẼ:   │ │ │ 📋 NHIỆM VỤ PHỤ ĐO:  │ │ │ 📋 BƯỚC CẦN CỨU VIỆN:│ │ │ 📋 CHECKLIST ĐẦU RA BẮT BUỘC:        │ │
│ │  • [K02] Đo RTK: 250k│ │ │  • [K02] Phụ đo: 100k│ │ │  • [K03] Vẽ Cad: 200k│ │ │  ☑️ Chụp ảnh Phiếu hẹn Một Cửa  │ │
│ │  • [K03] Vẽ CAD: 200k│ │ │   (Cầm gương/cọc mốc)│ │ │   (Lý do: Sốt cao)   │ │ │  ☑️ Nhập mã Biên nhận & Ngày hẹn│ │
│ │ 💰 Tổng khoán: 450k  │ │ │ 💰 Khoán phụ: 100.000│ │ │ 💰 Khoán nhận: 200.000│ │ │ 💰 Khoán: 100.000 đ · SLA: 3g       │ │
│ │ [🚀 Nhận Chuỗi Đo Vẽ]│ │ │   [ 🤝 Nhận Thợ Phụ] │ │ │  [ 🆘 Nhận Cứu Viện] │ │ │        [ 🚀 Nhận Đi Nộp ]         │ │
│ └──────────────────────┘ │ └──────────────────────┘ │ └──────────────────────┘ │ └───────────────────────────────────┘ │
│ ┌──────────────────────┐ │ ┌──────────────────────┐ │ ┌──────────────────────┐ │ ┌───────────────────────────────────┐ │
│ │ 📍 CHUỖI K CẮM MỐC   │ │ │ ⚡ [K03] CAD FAST    │ │ │ 📐 CHUỖI K TÁCH THỬA │ │ │ 🤝 [K08] BÀN GIAO SỔ CHO KHÁCH    │ │
│ │ HĐ 018 · Khách: Dũng │ │ │ HĐ 015 · Khách: Nam  │ │ │ HĐ 017 · Khách: Cường│ │ │ HĐ 008 · Khách: Anh Phát           │ │
│ │ 📍 Xã Phước Kiển, NB │ │ │ 📍 P. Thảo Điền, Q.2 │ │ │ 📍 P. Bình An, Q.2   │ │ │ 📍 P. Tân Thuận, Q.7                │ │
│ │ 📑 Hạng mục: Cắm mốc │ │ │ 📑 Trích lục có sẵn  │ │ │ 📑 Hạng mục: Tách thửa│ │ │ 📑 Sổ hồng gốc CS-12903             │ │
│ │ 📋 CÁC BƯỚC ĐO VẼ:   │ │ │ 📋 BƯỚC KỸ THUẬT:    │ │ │ 📋 CÁC BƯỚC ĐO VẼ:   │ │ │ 📋 CHECKLIST BẮT BUỘC:               │ │
│ │  • [K02] Cắm mốc:300k│ │ │  • [K03] Vẽ CAD: 200k│ │ │  • [K02] Đo ranh:300k│ │ │  ☑️ Kế toán duyệt phí ✓             │ │
│ │  • [K03] Sơ đồ:  200k│ │ │   (Số hóa trích lục) │ │ │  • [K03] Vẽ tách:250k│ │ │  ☑️ Ký Biên bản giao sổ gốc      │ │
│ │ 💰 Tổng khoán: 500k  │ │ │ 💰 Khoán: 200.000 đ  │ │ │ 💰 Tổng khoán: 550k  │ │ │ 💰 Khoán bàn giao: 100.000 đ      │ │
│ │ [🚀 Nhận Chuỗi Cắm]  │ │ │   [ 🚀 Nhận việc ]   │ │ │ [🚀 Nhận Chuỗi Tách] │ │ │        [ 🚀 Nhận Bàn Giao ]       │ │
│ └──────────────────────┘ │ └──────────────────────┘ │ └──────────────────────┘ │ └───────────────────────────────────┘ │
└──────────────────────────┴──────────────────────────┴──────────────────────────┴───────────────────────────────────────┘
```

---

# 🎬 KỊCH BẢN 1: SĂN TRỌN CHUỖI K ĐO VẼ (K02 ➔ K03)

### 1.1. Chi tiết thẻ trên Bể việc:
```
┌────────────────────────────────────────────────────────┐
│ 📐 CHUỖI K ĐO VẼ: ĐO VẼ HIỆN TRẠNG VỊ TRÍ THỬA ĐẤT     │
│ 📁 Hợp đồng: HĐ 014/BK-2026 · Khách: Anh Tuấn          │
│ 📍 Địa chỉ: 123 Nguyễn Thị Thập, P. Tân Phong, Quận 7  │
│ 📑 Thông tin: Thửa đất số 81, Tờ bản đồ số 12 (Q.7)    │
│                                                        │
│ 📋 CÁC BƯỚC (K) ĐO VẼ BẮT BUỘC TRỌN GÓI:               │
│    1. 🔹 [K02] Khảo sát & Đo đạc RTK hiện trường (250k)│
│    2. 🔹 [K03] Biên tập & Chuẩn hóa bản vẽ CAD   (200k)│
│                                                        │
│ 💰 TỔNG TIỀN KHOÁN KHI HOÀN THÀNH: 450.000 đ           │
│ ⏱ TỔNG THỜI HẠN HOÀN THÀNH: 1 ngày (Đo 4g + Vẽ CAD 4g) │
│                                                        │
│        👉 [ 🚀 NHẬN TRỌN GÓI CHUỖI ĐO VẼ (450k) ]      │
└────────────────────────────────────────────────────────┘
```

### 1.2. Quy trình thực hiện:
1. Bạn bấm **`[ 🚀 NHẬN TRỌN GÓI CHUỖI ĐO VẼ (450k) ]`**.
2. Hệ thống gán bạn làm Thợ chính cho cả 2 Node: `K02` và `K03`.
3. Bạn đi đo `K02` ngoài hiện trường ➔ Nộp 4 ảnh GPS & file `.csv` ➔ `K02` hoàn thành ➔ Hệ thống tự động chuyển sang `[K03] Vẽ CAD` trên Bàn làm việc của bạn để bạn vẽ tiếp!

---

# 🎬 KỊCH BẢN 2: SĂN SLOT THỢ PHỤ K02 RIÊNG BIỆT (KHOÁN PHỤ 100k)

### 2.1. Chi tiết thẻ trên Bể việc:
```
┌────────────────────────────────────────────────────────┐
│ 🤝 SLOT THỢ PHỤ: ĐO ĐẠC HIỆN TRƯỜNG · HĐ 016/BK-2026   │
│ 📁 Hạng mục: Đo vẽ hiện trạng vị trí thửa đất          │
│ 👤 Khách: Anh Minh · 📍 Xã Hiệp Phước, Huyện Nhà Bè    │
│ 👑 Thợ chính: Nguyễn Văn A (Đang chờ xuất phát)        │
│                                                        │
│ 📋 NHIỆM VỤ THỢ PHỤ:                                   │
│    • Cầm gương phản xạ, cắm cọc tiêu mốc ranh          │
│    • Hỗ trợ thợ chính chụp ảnh 4 mốc ranh GPS          │
│                                                        │
│ 💰 KHOÁN THỢ PHỤ KHI XONG: 100.000 đ · ⏱ SLA: 4 giờ    │
│                                                        │
│           👉 [ 🤝 NHẬN LÀM THỢ PHỤ (100k) ]            │
└────────────────────────────────────────────────────────┘
```

### 2.2. Điều kiện vận hành:
- Slot Thợ phụ chỉ mở khi Thợ chính **chưa bấm xuất phát (`started_at IS NULL`)**.
- Nếu không có ai nhận phụ (Thợ chính tự đo một mình) ➔ Công ty **chỉ chi khoán Thợ chính (250k), KHÔNG chi thêm khoán phụ (100k)**.

---

# 🎬 KỊCH BẢN 3: GẶP BẤT KHẢ KHÁNG ➔ BẮN NODE LÊN BỂ VIỆC CỨU VIỆN (YIELD NODE)

### 3.1. Bối cảnh:
Bạn là **Lê Văn C (Thợ đo)**. Bạn đã nhận chuỗi HĐ 011 và đã đi đo xong `K02`. Đến chiều bạn chuẩn bị vẽ `K03 CAD` thì bị **sốt cao 39°C phải nhập viện cấp cứu**, không thể ngồi máy tính vẽ được.

### 3.2. Thao tác trên giao diện việc đang làm:
- Tại dải `ActiveWorkStrip` hoặc màn hình việc đang làm của HĐ 011, bạn bấm nút:
  **`[ 🆘 Báo Bất Khả Kháng / Gửi Lên Bể Việc Tìm Người Cứu Viện ]`**.

### 3.3. Màn hình Popup bật lên (Modal 3):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🆘 YÊU CẦU TRỢ GIÚP / BẮN BƯỚC (K) LÊN BỂ VIỆC DO BẤT KHẢ KHÁNG         │
├─────────────────────────────────────────────────────────────────────────┤
│ 📁 HỢP ĐỒNG: HĐ 011/BK-2026 · Khách hàng: Chị Hạnh                      │
│ 📍 Địa chỉ: Phường Phú Mỹ, Quận 7                                       │
│ 📦 TIẾN ĐỘ HIỆN TẠI: Đã hoàn thành [K02 Đo đạc] ✓                       │
│                                                                         │
│ 🎯 BƯỚC BẠN MUỐN NHƯỜNG LẠI CHO ĐỒNG ĐỘI:                               │
│    [ 💻 [K03] Biên tập & Chuẩn hóa bản vẽ Autocad (Khoán 200.000 đ) ▾ ]  │
│                                                                         │
│ 📝 LÝ DO BẤT KHẢ KHÁNG (BẮT BUỘC):                                      │
│    [ Bị sốt cao 39 độ nhập viện cấp cứu BV Quận 7, không ngồi vẽ CAD được]│
│                                                                         │
│ ⚠️ QUY TẮC RÀNG BUỘC TRÁCH NHIỆM (QUAN TRỌNG):                          │
│    1. Node K03 sẽ được bắn lên Bể việc với nhãn [ 🆘 Ca Cứu Viện ].     │
│    2. TRONG LÚC CHƯA CÓ ĐỒNG ĐỘI NHẬN: Bạn vẫn đứng tên chịu trách nhiệm│
│       và Hạng mục này VẪN TÍNH VÀO TẢI (chiếm 1/3 slot) của bạn.        │
│    3. KHI CÓ ĐỒNG ĐỘI NHẬN & HOÀN THÀNH: Tiền khoán 200k chuyển sang cho│
│       người cứu viện, bạn được giải phóng tải để nhận Hạng mục mới!     │
├─────────────────────────────────────────────────────────────────────────┤
│               [ ❌ Hủy ]        👉 [ 📤 BẮN LÊN BỂ VIỆC CỨU VIỆN ]      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 🎬 KỊCH BẢN 4: ĐỒNG ĐỘI NHẬN CỨU VIỆN ➔ GIẢI PHÓNG TẢI NHẬN VIỆC MỚI (< 3)

### 4.1. Phản ứng trên Bể việc của toàn công ty:
- Trên Bể việc xuất hiện ngay thẻ đỏ cứu viện:
```
┌────────────────────────────────────────────────────────┐
│ 🆘 CA CỨU VIỆN: [K03] BIÊN TẬP BẢN VẼ CAD · HĐ 011    │
│ 📁 Khách hàng: Chị Hạnh · 📍 P. Phú Mỹ, Quận 7         │
│ 👤 Thợ nhường: Lê Văn C (Lý do: Sốt cao cấp cứu)       │
│ 📄 Dữ liệu kế thừa: Đã có đủ 4 ảnh GPS & file tọa độ K02│
│ 💰 KHOÁN NHẬN NGAY: 200.000 đ · ⏱ SLA: 4 giờ           │
│                                                        │
│            👉 [ 🆘 NHẬN CỨU VIỆN & VẼ CAD (200k) ]     │
└────────────────────────────────────────────────────────┘
```

### 4.2. Khi đồng đội (Nguyễn Văn B) bấm nhận và hoàn thành:
1. Tiền khoán `200.000 đ` của bước K03 được cộng vào bảng lương của **Nguyễn Văn B**.
2. HĐ 011 được **GIẢI PHÓNG HOÀN TOÀN** khỏi danh sách đang giữ của Lê Văn C.
3. Hạn mức tải của Lê Văn C giảm xuống (ví dụ từ `3/3` ➔ `2/3`).
4. Khi sức khỏe hồi phục, Lê Văn C được **mở khóa nhận tiếp Hạng mục khác trên Bể việc** (vì số lượng đang giữ `< 3`)!

---

# 🎬 KỊCH BẢN 5: KHÔNG AI NHẬN CỨU VIỆN ➔ THỢ BUỘC PHẢI TỰ HOÀN THÀNH

### 5.1. Bối cảnh:
Sau 4 tiếng bắn lên Bể việc, tất cả đồng đội khác đều bận ca đo hoặc đã đầy tải, không có ai bấm `[ 🆘 Nhận Cứu Viện ]`.

### 5.2. Hệ thống xử lý:
- Hệ thống gửi thông báo nhắc việc cho thợ: *"Chưa có đồng đội nhận ca cứu viện HĐ 011. Ca việc vẫn thuộc trách nhiệm của bạn!"*.
- Thẻ K03 vẫn nằm trên bàn làm việc của người thợ ban đầu. Khi thợ xuất viện về hoặc máy tính sửa xong, **thợ buộc phải tự mình mở CAD ra vẽ và nộp nghiệm thu** để đóng bước K03 và giải phóng hạn mức tải của mình.

---

# 🎬 KỊCH BẢN 6: ĐI NỘP MỘT CỬA CHI NHÁNH VPĐKĐĐ (K06)

```
┌────────────────────────────────────────────────────────┐
│ 🏛️ [K06] NỘP HỒ SƠ MỘT CỬA CHI NHÁNH VPĐKĐĐ QUẬN 7     │
│ 📁 Hợp đồng: HĐ 009/BK-2026 · Khách: Chị Oanh          │
│ 📍 Địa điểm nộp: 81 Tân Phú, P. Tân Phú, Quận 7        │
│ 📄 Bộ hồ sơ: Đã duyệt thẩm tra kỹ thuật K05 ✓          │
│                                                        │
│ 📋 CHECKLIST ĐẦU RA BẮT BUỘC:                          │
│    ☑️ Chụp ảnh Phiếu tiếp nhận Một Cửa (Rõ mộc & chữ)  │
│    ☑️ Nhập chính xác Mã Biên nhận (Ví dụ: BN-08194)    │
│    ☑️ Nhập Ngày hẹn trả kết quả (Ví dụ: 05/09/2026)    │
│                                                        │
│ 💰 ĐỊNH MỨC KHOÁN: 100.000 đ · ⏱ SLA: 3 giờ           │
│                                                        │
│              👉 [ 🚀 NHẬN ĐI NỘP MỘT CỬA ]             │
└────────────────────────────────────────────────────────┘
```

---

# 🎬 KỊCH BẢN 7: BÀN GIAO GIẤY CHỨNG NHẬN / BẢN VẼ CHO KHÁCH (K08)

```
┌────────────────────────────────────────────────────────┐
│ 🤝 [K08] BÀN GIAO GIẤY CHỨNG NHẬN & HỒ SƠ CHO KHÁCH    │
│ 📁 Hợp đồng: HĐ 008/BK-2026 · Khách: Anh Phát          │
│ 📍 Địa điểm: Trụ sở VP Bách Khoa / Giao tận nhà        │
│ 📑 Giấy tờ giao: Sổ hồng gốc CS-12903 + 4 Bản vẽ K03   │
│                                                        │
│ 📋 CHECKLIST BẮT BUỘC:                                 │
│    ☑️ Kế toán đã duyệt xác nhận hoàn tất tài chính ✓   │
│    ☑️ Khách hàng ký nhận vào Biên bản bàn giao hồ sơ   │
│    ☑️ Chụp ảnh Biên bản bàn giao có chữ ký của khách   │
│                                                        │
│ 💰 KHOÁN BÀN GIAO: 100.000 đ · ⏱ SLA: 2 giờ            │
│                                                        │
│              👉 [ 🚀 NHẬN CA BÀN GIAO ]                │
└────────────────────────────────────────────────────────┘
```

---

# 💎 ĐỐI SOÁT VỚI DB & CODE THẬT (Bách Khoa ERP) — PLAN CHUẨN THEO CƠ CHẾ MỚI

> **Cơ chế đã đổi:** Sếp chỉ **CHỌN & cấu hình quy trình** (chọn mẫu, gắn checklist, khoán); nhân viên **TỰ NHẬN việc từ Bể việc** — KHÔNG còn sếp phân công tay. Phần dưới ánh xạ **đúng schema/endpoint THẬT** (bản nháp gốc ở cuối dùng nhiều field giả định — bỏ).

## A. Ánh xạ: BẢN NHÁP (giả định) → THỰC TẾ trong DB/code

| Bản nháp cũ | Thực tế | Ghi chú |
| :--- | :--- | :--- |
| `task_nodes.assigned_employee_id` | ❌ Không có. Dùng bảng **`task_node_assignments`** (`employee_id`, `role_code` `MAIN`/phụ, `is_primary`, `assignment_status`, `ended_at`, `replacement_reason`) | 1 node nhiều người: chính + phụ |
| `assistant_employee_id` | = 1 dòng `task_node_assignments` role phụ (`is_primary=false`) | Không thêm cột |
| `is_help_requested`, `yield_reason` | Chưa có cột riêng → dùng `assignment_status` + `replacement_reason` + `execution_data.inherited_files` (đã có) | Cần chốt nhãn "cứu viện" |
| `filing_code`, `appointment_date` | **`legal_submissions.receipt_code` / `expected_return_date` / `submitted_agency` / `received_date`** (đã có UI `SubmissionReceiptPanel`) | K06 nộp cơ quan |
| Khoán từng bước | **`work_item_rates.amount`** theo `role_code`; ghi nhận vào **`work_pay_entitlements`** khi checklist được DUYỆT | |
| Lọc card theo phòng ban | Hàm **`task_pool_department_code(node_code, node_def)`** (`workflow_runtime.py:66`) | |
| Hạn mức 3 hạng mục | **`_EMPLOYEE_POOL_GUARDS_QUERY`** (pool guards trong `get_task_pool`) | |

## B. ĐÃ CÓ (verified trong code) — ĐỪNG LÀM LẠI

| Hạng mục | Vị trí | Trạng thái |
| :--- | :--- | :--- |đa
| API Bể việc | `GET /api/employee-portal/task-pool` → `EmployeePortalService.get_task_pool` | ✅ Lọc theo phòng ban; trả card/node kèm `claim_roles` (chính/phụ), `occupied_roles`, `role_amounts` (khoán/vai), `preferred_employee_id`/`preference_until` (ưu tiên thợ chính cho slot phụ), `inherited_files` (kế thừa cứu viện), pool guards (hạn mức) |
| Nhận việc | `POST /api/employee-portal/tasks/{id}/claim` → `claim_and_start_task` | ✅ (per-node) |
| Bắt đầu / Nộp / Checklist | `POST .../start`, `.../submit`, `.../checklist/{id}/submit` | ✅ |
| **UI Bể việc** | `TaskPoolPanel` — `EmployeeWorkspaceCalendar.jsx:406` | ✅ Render card, filter, badge ưu tiên, khoá CAD-WIP, nút nhận |
| Biên nhận K06 | `SubmissionReceiptPanel` + PATCH `legal-submissions` | ✅ cơ quan tiếp nhận, ngày nhận/hẹn trả (`input type="date"`) |
| Test | `tests/test_task_pool_query|routes|runtime_unittest.py` | ✅ đã có |

## C. THIẾU / SAI so với ý bạn — CẦN LÀM (ưu tiên đúng "Bể việc")

1. **[P1] Card Bể việc phải KÈM CHECKLIST đầu ra** — `get_task_pool` hiện **KHÔNG** trả mảng checklist, nên card chưa hiện `📋 CHECKLIST` (đúng cái bạn yêu cầu: *"bao gồm cả checklist"*). → Thêm query `task_node_checklist_results` per node vào `get_task_pool` + render list trên `TaskPoolPanel` card.
2. **[P2] Thẻ = CHUỖI K (bundle), không phải per-node** — vision: 1 thẻ = trọn chuỗi đo vẽ (`K02➔K03`), hiện khoán từng bước + **tổng khoán**, nhận 1 lần. Hiện card là per-node. → Gộp card theo hạng mục (`service_line`) cho gói Đo vẽ; claim chuỗi = nhận `K02` (MAIN) + tự nối `K03`.
3. **[P3] Yield / Cứu viện** — endpoint `yield-to-pool` **chưa có** (dù `inherited_files` đã sẵn cho bên nhận). → Thêm `POST .../tasks/{id}/yield-to-pool`: kết thúc assignment cũ (`ended_at`, `replacement_reason`), đẩy node về pool nhãn cứu viện, **vẫn tính tải** cho tới khi có người hoàn thành.
4. **[P4] Slot thợ phụ** — xác minh `claim` nhận đúng role phụ + chỉ mở slot khi thợ chính `started_at IS NULL`; không có phụ thì **không chi khoán phụ**.

## D. Khoán đúng luồng thật (quan trọng)
Khoán KHÔNG cộng lúc "nhận" mà cộng khi **checklist được DUYỆT** → sinh `work_pay_entitlements`. Card chỉ hiển thị khoán **dự kiến** (`role_amounts` từ `work_item_rates`). Cần đảm bảo copy trên card ghi rõ "khoán dự kiến khi hoàn thành".

---

# 💎 BẢNG ĐỐI SOÁT (BẢN NHÁP GỐC — field GIẢ ĐỊNH, GIỮ ĐỂ THAM CHIẾU, KHÔNG THI CÔNG THEO)

| Kịch Bản | Thao Tác Bấm Nút | Modal Bật Lên | Endpoint API Gọi Tới | Thay Đổi Trên CSDL |
| :--- | :--- | :--- | :--- | :--- |
| **1. Nhận Chuỗi K Đo Vẽ** | `[ 🚀 Nhận Chuỗi Đo Vẽ ]` | `Modal 1: Cam kết trọn cụm K02+K03` | `POST /api/employee-portal/items/{id}/claim-survey-bundle` | Gán nhân viên vào cả K02 & K03; K02 `status = 'in_progress'`, K03 `status = 'pending'`. |
| **2. Nhận Slot Thợ Phụ** | `[ 🤝 Nhận Thợ Phụ ]` | `Modal 2: Xác nhận đi cùng thợ chính` | `POST /api/employee-portal/items/{id}/claim-assistant` | Gán `assistant_employee_id = Y` cho Node K02. |
| **3. Bắn Báo Cứu Viện** | `[ 🆘 Báo Bất Khả Kháng ]`| `Modal 3: Chọn Node & Lý do nhường` | `POST /api/employee-portal/tasks/{id}/yield-to-pool` | Đổi Node K03 sang `is_help_requested = TRUE, yield_reason = '...'`, đẩy lên Bể việc. |
| **4. Nhận Cứu Viện** | `[ 🆘 Nhận Cứu Viện ]` | `Modal 4: Xác nhận nhận thay` | `POST /api/employee-portal/tasks/{id}/claim-help` | Đổi `assigned_employee_id` sang người mới, giải phóng tải cho thợ cũ. |
| **5. Nộp Một Cửa K06** | `[ 🚀 Nhận Đi Nộp ]` | `Modal 5: Chụp phiếu hẹn & nhập BN` | `POST /api/employee-portal/tasks/{id}/submit-filing` | `filing_code = '...', appointment_date = '2026-09-05'`. |
| **6. Bàn Giao K08** | `[ 🚀 Nhận Bàn Giao ]` | `Modal 6: Chụp biên bản bàn giao ký` | `POST /api/employee-portal/tasks/{id}/submit-handover` | `status = 'submitted', handover_evidence = JSON`. |
