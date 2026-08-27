# 📚 MASTER PLAN TOÀN DIỆN: NGHIỆP VỤ & KIẾN TRÚC VẬN HÀNH PHÂN HỆ BỂ VIỆC (TASK POOL ENGINE)
## DỰ ÁN: BÁCH KHOA ERP — ĐO ĐẠC ĐỊA CHÍNH, BIÊN TẬP CAD & PHÁP LÝ NHÀ ĐẤT
### ⭐️ BẢN CHUẨN HOÁ DANH MỤC 7 NODE K LIÊN TỤC (K01 ➔ K07)

---

## MỤC LỤC

| Chương | Nội dung |
|--------|----------|
| **Ch.1** | Bối cảnh doanh nghiệp & Triết lý chuyển dịch vận hành |
| **Ch.2** | Phân định 2 Khối chuyên môn & 4 Vai trò |
| **Ch.3** | Danh mục **7 Node K liên tục (K01 ➔ K07)** & Checklist đầu ra bắt buộc |
| **Ch.4** | Bản thể Bể việc & Quy tắc nhận trọn chuỗi K đo vẽ (`K02 ➔ K03`) |
| **Ch.5** | Phân biệt Thợ phụ (`Assistant` — Chỉ K02) và Cứu viện (`Help` — Mọi Node) |
| **Ch.6** | Điều hành chuỗi K & Chuyển tiếp tự động sau Cứu viện |
| **Ch.7** | Kiểm soát Hạn mức tải dở dang (`Hard WIP Limit = 3` cho K02-K03) |
| **Ch.8** | Bàn giao Sổ đỏ K06 & Cổng bảo vệ dòng tiền (`Financial Gatekeeper`) |
| **Ch.9** | Cơ chế K05 Nộp & Theo dõi — Vòng đời & Cascade Rollback có duyệt |
| **Ch.10** | Chuẩn hoá CSDL (`workflow_nodes`), Chống tranh chấp & Đồng bộ thời gian thực |
| **Tổng kết** | 3 Trụ cột vận hành |

---

## CHƯƠNG 1: BỐI CẢNH DOANH NGHIỆP & TRIẾT LÝ CHUYỂN DỊCH VẬN HÀNH

### 1.1. Bối cảnh đặc thù của Bách Khoa ERP
Bách Khoa ERP là hệ thống điều hành lõi cho doanh nghiệp hoạt động chuyên sâu trong ngành Đo đạc địa chính, Biên tập bản đồ địa chính và Dịch vụ Pháp lý nhà đất. Quy trình nghiệp vụ tại doanh nghiệp mang tính liên hoàn, khép kín, kết hợp chặt chẽ giữa:
- **Tác nghiệp ngoài hiện trường (Ngoại nghiệp):** Đo đạc tọa độ GPS RTK, cắm cọc mốc ranh giới, nộp và rút hồ sơ tại Chi nhánh Văn phòng Đăng ký Đất đai (Một Cửa VPĐKĐĐ).
- **Tác nghiệp trong văn phòng (Nội nghiệp):** Biên tập và chuẩn hóa bản vẽ kỹ thuật, trích lục địa chính, soạn thảo hồ sơ kỹ thuật thửa đất, thẩm tra pháp lý.
- **Cơ chế tài chính khoán 3P:** Thu nhập của nhân viên gắn liền trực tiếp với đơn giá khoán của từng bước công việc được nghiệm thu đạt chuẩn.

### 1.2. Chuyển dịch từ Mô hình Gán tay (Push Model) sang Bể việc Tự nhận (Pull Model)
- **Hạn chế của mô hình cũ:** Cấp quản lý phải gán tay từng hợp đồng → nút thắt cổ chai, nhân viên bị động, tình trạng "ôm việc ngâm hồ sơ".
- **Mô hình Bể việc tự nhận (Hybrid Task Pool Claim):**
  - **Ban Giám đốc:** Chọn mẫu quy trình chuẩn, kích hoạt checklist đầu ra, phê duyệt đơn giá khoán.
  - **Bể việc:** Tự động phân loại và đẩy công việc READY vào Bể việc của từng phòng ban.
  - **Nhân viên:** Chủ động bấm nhận việc theo năng lực và hạn mức tải cho phép.

---

## CHƯƠNG 2: PHÂN ĐỊNH 2 KHỐI CHUYÊN MÔN & 4 VAI TRÒ TRONG DOANH NGHIỆP

```
┌─────────────────────────────────────────┬─────────────────────────────────────────┐
│ 📐 KHỐI ĐO ĐẠC & KỸ THUẬT CAD          │ ⚖️ KHỐI PHÁP LÝ & HỒ SƠ                │
├─────────────────────────────────────────┼─────────────────────────────────────────┤
│ K01 → K02 → K03 → K05(đo vẽ)           │ K04 → K05(pháp lý) → K06 → K07         │
│                                         │                                         │
│ THỢ PHỤ: CHỈ K02 có thợ phụ            │ THỢ PHỤ: KHÔNG CÓ ở bất kỳ bước nào   │
│ (Role ASSISTANT, 100.000đ)              │ (Mỗi bước 1 Chuyên viên độc lập)       │
│                                         │                                         │
│ BỂ VIỆC: Nhận trọn chuỗi K02→K03       │ BỂ VIỆC: Nhận theo từng bước độc lập   │
│ Hard WIP Limit = 3 hạng mục dở dang    │ Chỉ có Cứu viện (Help), không thợ phụ  │
│                                         │                                         │
│ K05 ĐO VẼ: Nộp xong → ĐÓNG NGAY       │ K05 PHÁP LÝ: Nộp xong → THEO DÕI      │
│ Không theo dõi vòng đời hồ sơ          │ VÒNG ĐỜI: Biên nhận, Ngày hẹn, Rollback│
└─────────────────────────────────────────┴─────────────────────────────────────────┘
```

**4 Vai trò cốt lõi trong hệ thống:**
1. **Ban Giám Đốc / Quản Lý:** Cấu hình quy trình, duyệt ngoại lệ (Fast-Track, bảo lãnh giao sổ, **Cascade Rollback**).
2. **Nhân Viên Đo Đạc & Kỹ Thuật CAD:** Nhận trọn gói `K02 ➔ K03`, đo hiện trường (có thể có thợ phụ K02), xuất bản vẽ CAD, chuẩn hóa hồ sơ kỹ thuật.
3. **Chuyên Viên Pháp Lý:** Nhận độc lập `K04 ➔ K05 ➔ K06 ➔ K07`, nộp Một Cửa VPĐK, theo dõi biên nhận, nhận kết quả, bàn giao sổ đỏ (không thợ phụ).
4. **Phòng Kế Toán:** Phụ trách 100% công nợ, thu tiền, xuất phiếu. **Tuyệt đối không giao thu nợ cho nhân viên kỹ thuật/pháp lý.**

---

## CHƯƠNG 3: DANH MỤC 7 NODE K ĐÁNH SỐ LIÊN TỤC (K01 ➔ K07) & CHECKLIST ĐẦU RA

> ### 📌 BẢNG ÁNH XẠ ĐÁNH SỐ LẠI MỚI (CHUẨN HOÁ 100% LIÊN TỤC):
> - **K01**: **Tiếp nhận & kiểm tra đầu vào** *(Giữ nguyên)*
> - **K02**: **Khảo sát & đo hiện trường** *(Giữ nguyên — Có thợ phụ ASSISTANT)*
> - **K03**: **Chuẩn hoá tài liệu kỹ thuật** *(Giữ nguyên — Vẽ CAD & tính diện tích)*
> - **K04**: **Soạn bộ hồ sơ pháp lý** *(Đổi từ K05 cũ)*
> - **K05**: **Nộp & theo dõi hồ sơ** *(Đổi từ K06 cũ — Nộp Một Cửa & Cascade Rollback)*
> - **K06**: **Nhận kết quả & bàn giao** *(Đổi từ K08 cũ — Cổng chặn tài chính)*
> - **K07**: **Lưu trữ & đóng hồ sơ** *(Đổi từ K09 cũ — Scan số hóa & lưu kho)*

---

### 📐 KHỐI ĐO VẼ & KỸ THUẬT

#### K01 — Tiếp nhận & kiểm tra đầu vào
| Mục | Chi tiết |
|-----|----------|
| **Mã & Tên Node** | `K01` — **Tiếp nhận & kiểm tra đầu vào** |
| **Mô tả hệ thống** | Tiếp nhận yêu cầu, kiểm tra sơ bộ giấy tờ đầu vào từ khách hàng |
| **Phòng ban phụ trách** | Phòng Sale / CSKH |
| **Thợ phụ (Assistant)**| Không |
| **Tiền khoán** | — (tính gộp vào chi phí tiếp nhận hợp đồng) |
| **Checklist đầu ra bắt buộc** | ✅ Ảnh chụp Trích lục địa chính (bản gốc/bản trích lục rõ nét) |
| | ✅ Ảnh chụp Giấy tờ nhà đất khách bàn giao (Sổ đỏ, CMND/CCCD, v.v.) |
| | ✅ Ghi nhận tọa độ vị trí thửa đất (Google Maps / Tọa độ WGS84) |
| | ✅ Ghi chú phân tích sơ bộ: Loại dịch vụ, mức độ ưu tiên, gói Đo vẽ hay Pháp lý |

---

#### K02 — Khảo sát & đo hiện trường
| Mục | Chi tiết |
|-----|----------|
| **Mã & Tên Node** | `K02` — **Khảo sát & đo hiện trường** |
| **Mô tả hệ thống** | Đo đạc thực địa, chụp ảnh hiện trạng, lấy toạ độ GPS RTK, cắm cọc mốc ranh giới |
| **Phòng ban phụ trách** | Phòng Đo vẽ (SURVEY) |
| **Thợ phụ (Assistant)**| **CÓ DUY NHẤT Ở NODE NÀY** — Role ASSISTANT, đơn giá khoán: **100.000đ** |
| **Tiền khoán Thợ chính** | **250.000đ** |
| **Checklist đầu ra bắt buộc** | ✅ Tối thiểu 04 ảnh thực địa chụp tại các góc ranh (máy RTK tại mốc, cọc ranh đã đóng) |
| | ✅ File số liệu tọa độ đo đạc thô (.csv hoặc .txt) xuất trực tiếp từ máy đo RTK GNSS |
| | ✅ Ảnh chụp màn hình kết quả đo GPS (PDOP, Fixed status, số lượng vệ tinh >= 5) |
| | ✅ Ảnh hiện trạng ranh giới, mốc ranh đã đóng thực tế tại hiện trường |

---

#### K03 — Chuẩn hoá tài liệu kỹ thuật
| Mục | Chi tiết |
|-----|----------|
| **Mã & Tên Node** | `K03` — **Chuẩn hoá tài liệu kỹ thuật** |
| **Mô tả hệ thống** | Xử lý số liệu, vẽ bản đồ, tính diện tích, tự kiểm định và chuẩn hoá bộ hồ sơ kỹ thuật. Nghiệm thu node này = bàn giao đo vẽ sang pháp lý |
| **Phòng ban phụ trách** | Phòng Đo vẽ / Kỹ thuật CAD |
| **Thợ phụ (Assistant)**| Không (chỉ 1 Chuyên viên Kỹ thuật CAD xử lý) |
| **Tiền khoán** | **200.000đ – 300.000đ** (Tùy loại hình thửa đất và độ phức tạp) |
| **Checklist đầu ra bắt buộc** | ✅ File AutoCAD gốc `.dwg` (tuân thủ 100% chuẩn layer, khung tên của công ty) |
| | ✅ 04 bản vẽ hiện trạng thửa đất xuất định dạng PDF (khung tên chuẩn A4/A3) |
| | ✅ Bản vẽ vị trí thửa đất lồng ghép trên nền bản đồ địa chính |
| | ✅ Bảng tính diện tích & Tờ trình kỹ thuật (so khớp diện tích đo đạc thực tế với trích lục) |
| | ✅ Biên bản tự kiểm định kỹ thuật nội bộ trước khi chuyển giao |

---

### ⚖️ KHỐI PHÁP LÝ & HỒ SƠ

#### K04 — Soạn bộ hồ sơ pháp lý *(Đổi từ mã K05 cũ)*
| Mục | Chi tiết |
|-----|----------|
| **Mã & Tên Node** | `K04` — **Soạn bộ hồ sơ pháp lý** |
| **Mô tả hệ thống** | Gom giấy tờ, soạn đơn, rà quy hoạch, hoàn thiện bộ hồ sơ trước khi nộp |
| **Phòng ban phụ trách** | Phòng Pháp lý (LEGAL) |
| **Thợ phụ (Assistant)**| Không |
| **Tiền khoán** | **150.000đ** |
| **Checklist đầu ra bắt buộc** | ✅ File Word/PDF Đơn đăng ký biến động đất đai / Đơn cấp đổi (Mẫu 09/ĐK) |
| | ✅ Toàn bộ file scan giấy tờ pháp lý nhân thân & quyền sử dụng đất (bản sao y công chứng) |
| | ✅ Kết quả rà soát quy hoạch / Chứng chỉ quy hoạch (nếu thuộc diện yêu cầu) |
| | ✅ Tờ khai lệ phí trước bạ, thuế thu nhập cá nhân (đối với hồ sơ chuyển nhượng/biến động) |
| | ✅ Phiếu kiểm tra đối soát pháp lý nội bộ đạt chuẩn trước khi đi nộp |

---

#### K05 — Nộp & theo dõi hồ sơ *(Đổi từ mã K06 cũ)* [HAI CHẾ ĐỘ & ROLLBACK]
| Mục | K05 Đo vẽ (Kỹ thuật) | K05 Pháp lý (Hồ sơ) |
|-----|----------------------|---------------------|
| **Mã & Tên Node** | `K05` — **Nộp & theo dõi hồ sơ** | `K05` — **Nộp & theo dõi hồ sơ** |
| **Mô tả hệ thống** | Nộp hồ sơ kỹ thuật tại quầy, lấy kết quả | Nộp cơ quan nhà nước, lấy biên nhận, theo dõi tới khi có kết quả. Bao gồm cả các lần nộp lại khi bị yêu cầu bổ sung |
| **Phòng ban** | Phòng Đo vẽ / Kỹ thuật | Phòng Pháp lý |
| **Thợ phụ** | Không | Không |
| **Sau khi nộp** | **ĐÓNG NGAY** (hoàn tất giao nộp kỹ thuật) | **PHẢI THEO DÕI VÒNG ĐỜI** đến khi có kết quả |
| **Tiền khoán** | **80.000đ** | **220.000đ** |
| **Checklist đầu ra** | ✅ Ảnh chụp Phiếu tiếp nhận / Xác nhận nộp | ✅ Ảnh chụp Biên nhận hồ sơ & Giấy hẹn trả kết quả |
| | ✅ Ghi chú kết quả nhận được | ✅ Nhập Mã số biên nhận vào hệ thống |
| | | ✅ Nhập Ngày hẹn trả kết quả |
| | | ✅ Cập nhật diễn biến xử lý khi cơ quan thông báo |

**Vòng đời State Machine K05 Pháp lý:**
```
ASSIGNED ──▶ PROCESSING ──▶ PENDING (sub_status: AGENCY / SURVEYOR / INTERNAL)
                 ▲                │
                 │     RESUME     │
                 └────────────────┘
                 │
                 ▼ (Hoàn tất)
               CLOSED (Outcome: DONE | REJECTED)
```
- `sub_status = AGENCY`: Cơ quan nhà nước yêu cầu nộp bổ sung giấy tờ. Nhân viên cập nhật ghi chú, bổ sung giấy tờ trực tiếp trong K05, tăng số lần nộp bổ sung, cập nhật ngày hẹn mới. **Xử lý nội bộ K05, không cần rollback.**
- `sub_status = SURVEYOR`: Phát hiện lỗi sai ranh giới, sai số liệu đo đạc, sai bản vẽ kỹ thuật. **Kích hoạt Cơ chế Cascade Rollback có Quản lý/GĐ duyệt (Chương 9).**
- `sub_status = INTERNAL`: Chờ khách hàng nộp thuế / Chờ lãnh đạo ký văn bản nội bộ.

---

#### K06 — Nhận kết quả & bàn giao *(Đổi từ mã K08 cũ)* [CỔNG BẢO VỆ DÒNG TIỀN]
| Mục | Chi tiết |
|-----|----------|
| **Mã & Tên Node** | `K06` — **Nhận kết quả & bàn giao** |
| **Mô tả hệ thống** | Nhận kết quả, giao hồ sơ cho khách và lấy chữ ký xác nhận. Đồng thời phải thu đủ tiền hợp đồng thì mới đóng được bước này |
| **Phòng ban phụ trách** | Phòng Pháp lý / CSKH |
| **Thợ phụ** | Không |
| **Tiền khoán** | **100.000đ** |
| **Điều kiện mở khóa** | Khách hàng đã thanh toán 100% công nợ **HOẶC** Giám đốc duyệt Phiếu bảo lãnh giao sổ |
| **Checklist đầu ra bắt buộc** | ✅ Ảnh chụp Giấy chứng nhận (Sổ hồng / Sổ đỏ) mới đã nhận từ cơ quan |
| | ✅ Ảnh chụp Biên bản bàn giao hồ sơ có đầy đủ chữ ký xác nhận của khách hàng |
| | ✅ Ảnh chụp bàn giao 04 bản vẽ hiện trạng kèm theo cho khách |
| | ✅ Xác nhận hoàn tất công nợ từ Kế toán (hoặc Mã phiếu duyệt bảo lãnh của Giám đốc) |

---

#### K07 — Lưu trữ & đóng hồ sơ *(Đổi từ mã K09 cũ)*
| Mục | Chi tiết |
|-----|----------|
| **Mã & Tên Node** | `K07` — **Lưu trữ & đóng hồ sơ** |
| **Mô tả hệ thống** | Chuẩn hoá tên file, lưu vào thư mục Hạng mục, scan số hóa, lưu kho bản cứng, đóng hồ sơ |
| **Phòng ban phụ trách** | Phòng Pháp lý / Lưu trữ |
| **Thợ phụ** | Không |
| **Tiền khoán** | — (Quyết toán hồ sơ hoàn tất) |
| **Checklist đầu ra bắt buộc** | ✅ Toàn bộ file số hóa (AutoCAD, PDF bản vẽ, scan Giấy chứng nhận, Biên bản bàn giao) được lưu đúng thư mục lưu trữ |
| | ✅ Lưu trữ hồ sơ giấy bản cứng vào kho lưu trữ theo mã lưu trữ chuẩn |
| | ✅ Xác nhận đóng Hạng mục và Hợp đồng trên phần mềm ERP |

---

### BẢNG TỔNG HỢP DANH MỤC 7 NODE HOẠT ĐỘNG CHUẨN LIÊN TỤC

| Mã Mới | Mã Cũ | Tên Node Chuẩn Mới | Phòng ban | Thợ phụ (Assistant) | Đơn giá khoán (VNĐ) | Trạng thái CSDL |
|:------:|:-----:|-------------------|:---------:|:-------------------:|:-------------------:|:---------------:|
| **K01**| K01 | **Tiếp nhận & kiểm tra đầu vào** | Sale / CSKH | Không | Theo HĐ | `is_active = true` |
| **K02**| K02 | **Khảo sát & đo hiện trường** | Đo vẽ (SURVEY) | **CÓ (+100.000đ)** | 250.000 | `is_active = true` |
| **K03**| K03 | **Chuẩn hoá tài liệu kỹ thuật** | Đo vẽ (CAD) | Không | 200k – 300k | `is_active = true` |
| **K04**| K05 | **Soạn bộ hồ sơ pháp lý** | Pháp lý (LEGAL) | Không | 150.000 | `is_active = true` |
| **K05**| K06 | **Nộp & theo dõi hồ sơ** | Đo vẽ / Pháp lý | Không | 80k (Đo) / 220k (PL) | `is_active = true` |
| **K06**| K08 | **Nhận kết quả & bàn giao** | Pháp lý / CSKH | Không | 100.000 | `is_active = true` |
| **K07**| K09 | **Lưu trữ & đóng hồ sơ** | Pháp lý / Lưu trữ | Không | Quyết toán | `is_active = true` |

---

## CHƯƠNG 4: BẢN THỂ BỂ VIỆC & QUY TẮC NHẬN TRỌN CHUỖI K ĐO VẼ (BUNDLE CLAIMING)

### 4.1. Đơn vị nhận việc trên Bể việc là Chuỗi K Kỹ Thuật (K02 ➔ K03)
Để tránh tình trạng "thợ đo một người, thợ vẽ một người" đổ lỗi cho nhau khi bản vẽ sai lệch số liệu thực địa, hệ thống áp dụng cơ chế **Nhận trọn gói chuỗi đo vẽ**:
- **Chuỗi liên hoàn:** `K02 (Khảo sát & đo hiện trường)` ➔ `K03 (Chuẩn hoá tài liệu kỹ thuật & vẽ CAD)`.
- Khi một Nhân viên Kỹ thuật bấm nhận K02 trên Bể việc, hệ thống tự động gán nhân viên đó làm Thợ chính cho cả K02 và K03 của Hạng mục.

### 4.2. Thông tin bắt buộc thể hiện trên Thẻ Bể việc (Task Pool Card)
- **Thông tin nhận diện:** Mã Hợp đồng, Tên Hạng mục, Tên khách hàng, SĐT liên hệ, Địa chỉ thửa đất (Số Tờ, Số Thửa, Phường/Xã/Quận/Huyện), SLA cam kết.
- **Chuỗi các bước K:** Hiển thị rõ chuỗi (ví dụ: K02 Đo RTK + K03 Vẽ CAD & Chuẩn hóa hồ sơ kỹ thuật).
- **Checklist đầu ra yêu cầu:** Hiển thị chi tiết danh mục checklist từng bước.
- **Tiền khoán minh bạch:** Khoán từng bước (K02: 250k, K03: 300k) và Tổng tiền khoán chuỗi (550.000đ).

### 4.3. Quy tắc Trách nhiệm Trọn Gói (Single Ownership)
- Nhân viên nhận việc chịu trách nhiệm đến cùng từ khi cắm mốc đo đạc đến khi xuất bản vẽ CAD nghiệm thu chuẩn.
- **Chuyển tiếp tự động:** Sau khi nộp đủ bằng chứng và hoàn thành K02, bước K03 tự động xuất hiện trên Bàn làm việc (My Workspace) của chính nhân viên đó mà không đẩy ra Bể việc công cộng.

---

## CHƯƠNG 5: PHÂN BIỆT RẠCH RÒI GIỮA THỢ PHỤ VÀ CỨU VIỆN (ASSISTANT vs HELP)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                    PHÂN BIỆT THỢ PHỤ VÀ CỨU VIỆN                              │
├───────────────────────────────────────┬───────────────────────────────────────┤
│ 🤝 THỢ PHỤ (ASSISTANT)                │ 🆘 CỨU VIỆN / NHƯỜNG VIỆC (HELP)       │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ • CHỈ ÁP DỤNG: Node K02 Đo hiện trường│ • ÁP DỤNG: Tất cả các Node (K01–K07)  │
│ • BẢN CHẤT: Cùng đi hỗ trợ thực địa   │ • BẢN CHẤT: Nhường việc khi quá tải   │
│ • ĐƠN GIÁ: Cố định 100.000đ           │ • ĐƠN GIÁ: Nhận 100% khoán của Node đó│
│ • VÒNG ĐỜI: Tự hủy khi K02 bấm Start  │ • VÒNG ĐỜI: Hoàn tất → Trả lại chuỗi  │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

### 5.1. Cơ chế Thợ Phụ (Assistant — CHỈ DUY NHẤT K02)
- **Bản chất:** Người đi cùng hỗ trợ ngoài hiện trường (cầm gương phản xạ, kéo thước, phát quang cắm cọc ranh).
- **Phạm vi:** **Chỉ duy nhất bước K02 Khảo sát & đo hiện trường.** Khối Pháp lý và các bước kỹ thuật văn phòng tuyệt đối không có thợ phụ.
- **Cơ chế xuất hiện & Tự hủy:**
  - Thẻ Thợ phụ (Khoán 100.000đ) chỉ xuất hiện trên Bể việc khi Thợ chính đã nhận việc nhưng chưa bấm bắt đầu thực địa (`started_at IS NULL`).
  - Khi Thợ chính đã có mặt tại hiện trường và bấm `Bắt đầu đo`, nếu chưa có ai nhận thợ phụ thì hệ thống **ngay lập tức hủy thẻ thợ phụ khỏi Bể việc** (Doanh nghiệp tiết kiệm 100.000đ).

### 5.2. Cơ chế Cứu Viện / Hỗ Trợ (Help Claim — Áp dụng mọi Node)
- **Bản chất:** Nhân viên đang giữ việc gặp trở ngại bất khả kháng (ốm đau, sự cố thiết bị, quá tải giờ chót) cần nhường lại 1 Node công việc cho đồng đội.
- **Quy trình:**
  1. Người giữ việc bấm `Xin hỗ trợ / Đẩy lên Bể việc` và nhập rõ lý do.
  2. Thẻ công việc xuất hiện trên Bể việc ở trạng thái `Cần hỗ trợ (Help Wanted)`.
  3. Đồng nghiệp khác bấm nhận cứu viện và thực hiện node đó.
  4. Người cứu viện nộp checklist và hưởng 100% tiền khoán của node được cứu viện.

---

## CHƯƠNG 6: QUY TRÌNH ĐIỀU HÀNH CHUỖI K VÀ CHUYỂN TIẾP SAU CỨU VIỆN

Xét chuỗi quy trình hoàn chỉnh: `K01 ➔ K02 ➔ K03 ➔ K04 ➔ K05 ➔ K06 ➔ K07`.
Nhân viên A là người nhận trọn chuỗi đo vẽ K02 → K03:

### 6.1. Kịch bản cứu viện tại K03 (A đã hoàn thành K02, đang dở dang K03)
- Nhân viên A gặp sự cố máy tính, bấm gửi yêu cầu cứu viện cho bước K03 lên Bể việc.

### 6.2. Cơ chế chuyển tiếp thông minh
1. **Trường hợp không ai nhận cứu viện K03:**
   - Bước K03 vẫn thuộc quyền quản lý của A.
   - Hạng mục vẫn tính vào hạn mức WIP của A. A phải tiếp tục xử lý xong K03 mới hoàn thành chuỗi.
2. **Trường hợp Nhân viên B nhận cứu viện K03 và hoàn tất nộp bản vẽ CAD:**
   - Nhân viên B được nghiệm thu và nhận tiền khoán của K03.
   - **Tự động chuyển tiếp sang Pháp lý:** Hệ thống nghiệm thu K03 đạt chuẩn sẽ tự động kích hoạt bước K04 (Soạn hồ sơ pháp lý) và đẩy K04 vào Bể việc của Phòng Pháp lý (Chuyên viên Pháp lý nhận độc lập).

---

## CHƯƠNG 7: KIỂM SOÁT HẠN MỨC TẢI DỞ DANG (HARD WIP LIMIT = 3)

### 7.1. Cơ sở vận hành — Định luật Little (Little's Law)
Hồ sơ nhận quá nhiều mà không hoàn thành sẽ gây ứ đọng, tắc nghẽn dòng chảy công việc và làm trễ hẹn giao sổ cho khách hàng. Hệ thống thiết lập rào chắn kỹ thuật kiểm soát tải dở dang (Work-In-Progress).

### 7.2. Quy tắc Khóa Cứng (Hard Lock Rule)
- Mỗi Nhân viên Kỹ thuật chỉ được phép giữ **tối đa 03 Hạng mục Đo vẽ dở dang** (Đã nhận việc nhưng chưa hoàn thành nghiệm thu K03).
- **Khi đạt ngưỡng WIP = 3:**
  - Hệ thống tự động **vô hiệu hóa nút "Nhận việc"** trên Bể việc.
  - Hiển thị thông báo cảnh báo nghiệp vụ: *"Bạn đang giữ tối đa 3 hạng mục dở dang. Hãy nộp nghiệm thu bản vẽ CAD (K03) để tiếp tục nhận thêm công việc mới!"*

---

## CHƯƠNG 8: PHÂN ĐỊNH BÀN GIAO SỔ ĐỎ K06 & BẢO VỆ DÒNG TIỀN

```
┌───────────────────────────────────────────────────────────────────────────────┐
│              CỔNG BẢO VỆ DÒNG TIỀN K06 (FINANCIAL GATEKEEPER)                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  [ Chuyên viên Pháp lý hoàn tất K05, có kết quả Sổ đỏ ]                       │
│                                │                                              │
│                                ▼                                              │
│               KIỂM TRA CÔNG NỢ TÀI CHÍNH HỢP ĐỒNG                            │
│                                │                                              │
│             ┌──────────────────┴──────────────────┐                           │
│             ▼                                     ▼                           │
│     [ Khách còn nợ tiền ]               [ Đã thanh toán 100% ]                │
│             │                                     │                           │
│             ├───────────────┐                     ▼                           │
│             ▼               ▼            NÚT K06 TỰ ĐỘNG MỞ                   │
│      NÚT K06 BỊ KHÓA   GĐ DUYỆT BẢO LÃNH          │                           │
│     (Chờ kế toán thu)       │                     │                           │
│                             ▼                     │                           │
│                      NÚT K06 MỞ NGOẠI LỆ          │                           │
│                             │                     │                           │
│                             └──────────┬──────────┘                           │
│                                        ▼                                      │
│                      [ BÀN GIAO SỔ ĐỎ & KÝ BIÊN BẢN ]                         │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 8.1. Tách bạch hoàn toàn trách nhiệm thu tiền
- **Chuyên viên Kỹ thuật / Pháp lý:** Tuyệt đối không giao nhận tiền mặt, không thu nợ khách hàng để tránh rủi ro thất thoát hoặc khiếu nại.
- **Phòng Kế toán:** Chịu trách nhiệm 100% về công nợ hợp đồng, xuất phiếu thu, đối soát tài khoản ngân hàng và kích hoạt trạng thái tài chính.

### 8.2. Quy trình Bàn giao K06
1. Chuyên viên Pháp lý kiểm đếm đầy đủ: Bản chính Giấy chứng nhận + 04 bản vẽ hiện trạng đã nghiệm thu.
2. Trao tận tay khách hàng tại văn phòng hoặc tại địa chỉ khách hàng yêu cầu.
3. Hướng dẫn khách hàng ký tên vào Biên bản bàn giao.
4. Chụp ảnh rõ nét Biên bản có đủ chữ ký và ảnh trao sổ ➔ Nộp lên hệ thống để hoàn thành K06.

### 8.3. Khóa Cứng Nghiệp Vụ (Financial Gatekeeper)
Nút bàn giao K06 bị khóa cứng mặc định và chỉ mở trong 2 trường hợp:
- **Trường hợp 1 (Chuẩn):** Kế toán đã ghi nhận khách thanh toán 100% giá trị hợp đồng (`debt.is_settled = true`).
- **Trường hợp 2 (Ngoại lệ):** Giám đốc phê duyệt điện tử Phiếu bảo lãnh bàn giao trước (`handover_exception_approved = true`).

---

## CHƯƠNG 9: CƠ CHẾ K05 NỘP & THEO DÕI — VÒNG ĐỜI & CASCADE ROLLBACK CÓ DUYỆT

### 9.1. Tổng quan cơ chế Rollback
Mọi nghiệp vụ bổ sung hoặc xử lý sai sót khi nộp hồ sơ được quản lý trực tiếp tại Node `K05 (Nộp & theo dõi hồ sơ)` và cơ chế **Cascade Rollback có Quản lý/GĐ duyệt**.

> **Nguyên tắc bất biến:** Nhân viên tuyệt đối **KHÔNG ĐƯỢC TỰ Ý QUAY LẠI NODE**. Mọi yêu cầu quay lại bắt buộc phải lập phiếu yêu cầu có lý do và được Quản lý/Giám đốc phê duyệt trên hệ thống.

### 9.2. Sơ đồ Luồng Yêu cầu & Phê duyệt Rollback

```
[Chuyên viên K05]          [Quản lý / Giám đốc]              [Hệ thống ERP]
       │                            │                               │
       │── 1. Gửi Yêu cầu Rollback ─▶│                               │
       │   (Chọn Node quay lại + Lý do)                             │
       │                            │── 2. Kiểm tra thông tin ─────▶│
       │                            │                               │
       │                     [Duyệt]│── 3. Chạy cascade_rollback() ─▶│── 4. Chuyển Kx→Kn thành
       │                            │                               │      rework_required (Cam)
       │◀── 5. Thông báo đã duyệt ──│                               │── 5. Gửi thông báo đến
       │                            │                               │      tất cả nhân viên liên quan
       │                   [Từ chối]│── 6. Giữ nguyên hiện trạng ───▶│
       │◀── 6. Thông báo từ chối ───│                               │
```

---

### 9.3. Các Trường Hợp Cascade Rollback Cụ Thể (Hệ Thống 7 Node K01 ➔ K07)

#### 🔹 Trường Hợp 1: Hồ sơ bị cơ quan yêu cầu bổ sung giấy tờ pháp lý đơn giản (`AGENCY`)
- **Tình huống:** Chi nhánh VPĐKĐĐ yêu cầu bổ sung CCCD công chứng mới hoặc văn bản cam kết.
- **Xử lý:** K05 chuyển `PENDING (sub_status: AGENCY)`. Chuyên viên bổ sung hồ sơ trực tiếp trong K05 ➔ Tiếp tục nộp lại ➔ Cập nhật ngày hẹn mới.
- **Kết luận:** **Xử lý nội bộ K05, KHÔNG CẦN ROLLBACK.**

#### 🔹 Trường Hợp 2: Lỗi soạn thảo hồ sơ pháp lý, quay lại K04
- **Tình huống:** Phát hiện Đơn đăng ký biến động khai sai thông tin chủ hộ hoặc thiếu giấy tờ nhân thân cơ bản.
- **Điểm quay lại:** Quay về `K04 (Soạn bộ hồ sơ pháp lý)`.
- **Tác động Cascade:**
  ```
  K01(OK) ──▶ K02(OK) ──▶ K03(OK) ──▶ K04(🟠) ──▶ K05(🟠) ──▶ K06(🟠) ──▶ K07(🟠)
                                        ↑ Điểm quay lại
  ```
  - `K01, K02, K03` đã nghiệm thu: **GIỮ NGUYÊN 100% (Xanh lá).**
  - `K04, K05, K06, K07`: Chuyển sang **rework_required (Màu cam)**.
  - Chuyên viên Pháp lý nhận lại K04 để chỉnh sửa và trình nộp lại.

#### 🔹 Trường Hợp 3: Sai bản vẽ kỹ thuật CAD, quay lại K03
- **Tình huống:** Cơ quan địa chính đối soát phát hiện sai layer, sai số liệu diện tích hoặc ranh giới kỹ thuật trên bản vẽ CAD.
- **Điểm quay lại:** Quay về `K03 (Chuẩn hoá tài liệu kỹ thuật)`.
- **Tác động Cascade (Xuyên Khối Đo vẽ & Pháp lý):**
  ```
  K01(OK) ──▶ K02(OK) ──▶ K03(🟠) ──▶ K04(🟠) ──▶ K05(🟠) ──▶ K06(🟠) ──▶ K07(🟠)
                            ↑ Điểm quay lại
  ```
  - `K01, K02` đã nghiệm thu: **GIỮ NGUYÊN.**
  - `K03, K04, K05, K06, K07`: Chuyển sang **rework_required (Màu cam)**.
  - Hệ thống gửi thông báo đồng thời đến **Nhân viên Kỹ thuật CAD** (sửa bản vẽ K03) và **Chuyên viên Pháp lý** (cập nhật lại hồ sơ K04 sau khi có bản vẽ mới).

#### 🔹 Trường Hợp 4: Sai sót mốc ranh ngoài hiện trường, quay lại K02
- **Tình huống:** Cơ quan kiểm tra thực địa phát hiện mốc ranh sai lệch tọa độ thực tế, yêu cầu đo đạc lại hiện trường.
- **Điểm quay lại:** Quay về `K02 (Khảo sát & đo hiện trường)`.
- **Tác động Cascade toàn diện:**
  ```
  K01(OK) ──▶ K02(🟠) ──▶ K03(🟠) ──▶ K04(🟠) ──▶ K05(🟠) ──▶ K06(🟠) ──▶ K07(🟠)
                ↑ Điểm quay lại
  ```
  - Chỉ `K01` (Tiếp nhận ban đầu) được giữ nguyên.
  - Toàn bộ chuỗi từ `K02` đến `K07` chuyển sang **rework_required (Màu cam)** để tiến hành đo đạc và lập lại hồ sơ từ đầu.

---

### 9.4. Bảng Màu Trạng Thái Hạng Mục & Cảnh Báo Quy Trình

| Trạng thái Hạng mục | Mã màu | Ý nghĩa hiển thị trên UI | Hành động yêu cầu |
|---------------------|:------:|--------------------------|-------------------|
| **Hoàn thành** | 🟢 Xanh lá | Tất cả các node K đều đã được nghiệm thu (`accepted`) | Đóng hồ sơ, lưu kho |
| **Đang thực hiện** | 🔵 Xanh dương | Các node đang tiến hành bình thường theo đúng tiến độ | Tiếp tục tác nghiệp |
| **Cần chỉnh sửa** | 🟠 Màu cam | Có ít nhất 1 node ở trạng thái `rework_required` do Rollback | Ưu tiên sửa chữa checklist node bị trả về |
| **Bị nghẽn / Trễ SLA** | 🔴 Màu đỏ | Node bị `blocked` hoặc quá hạn cam kết SLA | Quản lý can thiệp xử lý ngay |
| **Đang chờ** | ⚪ Màu xám | Các node tiếp theo chưa đến lượt kích hoạt | Chờ bước trước hoàn thành |

---

## CHƯƠNG 10: CHUẨN HOÁ CSDL (`workflow_nodes`), CHỐNG TRANH CHẤP & ĐỒNG BỘ THỜI GIAN THỰC

### 10.1. Chuẩn hóa Bảng Danh mục `workflow_nodes` trong Database (K01 ➔ K07)

```sql
-- Chuẩn hóa bảng public.workflow_nodes theo bộ mã liên tục K01–K07
UPDATE public.workflow_nodes 
SET name = 'Tiếp nhận & kiểm tra đầu vào', 
    description = 'Tiếp nhận yêu cầu, kiểm tra sơ bộ giấy tờ đầu vào từ khách hàng',
    is_active = true
WHERE code = 'K01';

UPDATE public.workflow_nodes 
SET name = 'Khảo sát & đo hiện trường', 
    description = 'Đo đạc thực địa, chụp ảnh hiện trạng, lấy toạ độ GPS RTK',
    is_active = true
WHERE code = 'K02';

UPDATE public.workflow_nodes 
SET name = 'Chuẩn hoá tài liệu kỹ thuật', 
    description = 'Xử lý số liệu, vẽ bản đồ, tính diện tích, tự kiểm định và chuẩn hoá bộ hồ sơ kỹ thuật. Nghiệm thu node này = bàn giao đo vẽ sang pháp lý.',
    is_active = true
WHERE code = 'K03';

UPDATE public.workflow_nodes 
SET name = 'Soạn bộ hồ sơ pháp lý', 
    description = 'Gom giấy tờ, soạn đơn, rà quy hoạch, hoàn thiện bộ hồ sơ trước khi nộp',
    is_active = true
WHERE code = 'K04';

UPDATE public.workflow_nodes 
SET name = 'Nộp & theo dõi hồ sơ', 
    description = 'Nộp cơ quan nhà nước, lấy biên nhận, theo dõi tới khi có kết quả. Bao gồm cả các lần nộp lại khi bị yêu cầu bổ sung và cơ chế quay ngược node.',
    is_active = true
WHERE code = 'K05';

UPDATE public.workflow_nodes 
SET name = 'Nhận kết quả & bàn giao', 
    description = 'Nhận kết quả, giao hồ sơ cho khách và lấy chữ ký xác nhận. Đồng thời phải thu đủ tiền hợp đồng thì mới đóng được bước này.',
    is_active = true
WHERE code = 'K06';

UPDATE public.workflow_nodes 
SET name = 'Lưu trữ & đóng hồ sơ', 
    description = 'Chuẩn hoá tên file, lưu vào thư mục Hạng mục, scan số hóa, lưu kho bản cứng, đóng hồ sơ.',
    is_active = true
WHERE code = 'K07';

-- De-activate các mã cũ nếu còn tồn tại
UPDATE public.workflow_nodes 
SET is_active = false 
WHERE code IN ('K08', 'K09');
```

### 10.2. Chống Tranh Chấp Nhận Việc (Race Condition Prevention)
1. **Redis Distributed Lock (Tầng ngoài):** `SET lock:task:{task_node_id}:{role} {employee_id} NX EX 5` phản hồi trong 0.2ms. Request bấm nhận thứ 2 bị chặn ngay lập tức và trả về mã lỗi `409 Conflict`.
2. **PostgreSQL Atomic Lock (Tầng CSDL):** `SELECT ... FOR UPDATE` kết hợp ràng buộc `UNIQUE` đảm bảo 100% không xảy ra tình trạng 2 người cùng nhận 1 suất việc.

### 10.3. Đồng bộ Thời Gian Thực — Server-Sent Events (SSE)
- Hệ thống phát tín hiệu qua Redis Pub/Sub đến các kênh SSE client (`/api/notifications/stream`).
- Khi có bất kỳ sự kiện nhận việc, cứu viện, nghiệm thu, hoặc Rollback, UI của toàn bộ nhân viên được cập nhật tức thời (<30ms) mà không cần tải lại trang.

---

## TỔNG KẾT BẢN THIẾT KẾ VẬN HÀNH

Toàn bộ mô hình Bể việc chuẩn 7 Node liên tục (`K01 ➔ K07`) của Bách Khoa ERP vận hành dựa trên **3 Trụ Cột Vàng**:
1. **Minh bạch & Tự chủ:** Thợ kỹ thuật và Chuyên viên pháp lý chủ động nhận việc từ Bể việc theo đúng chuyên môn, định mức khoán rõ ràng, checklist đầu ra minh bạch.
2. **Kỷ luật & Trách nhiệm:** Khóa cứng hạn mức tải dở dang (WIP Limit = 3 cho khối đo vẽ), ràng buộc cổng kiểm soát công nợ K06 chặt chẽ trước khi bàn giao sổ đỏ.
3. **Linh hoạt & Kiểm soát:** Cơ chế Thợ phụ ngoài hiện trường (K02), Cơ chế Cứu viện nhường việc thông minh, và Cơ chế Cascade Rollback có kiểm duyệt chặt chẽ, đảm bảo thông suốt dòng chảy hồ sơ và an toàn tuyệt đối cho doanh nghiệp.
