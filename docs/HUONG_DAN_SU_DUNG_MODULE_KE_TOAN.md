# SỔ TAY HƯỚNG DẪN SỬ DỤNG MODULE KẾ TOÁN & TÀI CHÍNH
### HỆ THỐNG QUẢN TRỊ DOANH NGHIỆP WIFIM ERP
**Đơn vị áp dụng**: Công Ty TNHH Kiến Trúc Xây Dựng và Đo Đạc Bản Đồ Bách Khoa  
**Cơ sở pháp lý**: Thông tư số 99/2025/TT-BTC của Bộ Tài Chính (áp dụng từ 01/01/2026)  
**Phiên bản tài liệu**: 3.0 (Cập nhật chuẩn hóa toàn diện — Tháng 09/2026)

---

## 📌 MỤC LỤC
1. [Tổng Quan Kiến Trúc & Phân Định Trách Nhiệm (SoD)](#1-tổng-quan-kiến-trúc--phân-định-trách-nhiệm-sod)
2. [Cấu Trúc Giao Diện 3 Phân Hệ & 13 Tab Nghiệp Vụ](#2-cấu-trúc-giao-diện-3-phân-hệ--13-tab-nghiệp-vụ)
3. [Hướng Dẫn Dành Cho Ban Giám Đốc (Director / Admin)](#3-hướng-dẫn-dành-cho-ban-giám-đốc-director--admin)
4. [Hướng Dẫn Dành Cho Kế Toán & Thủ Quỹ (Accountant)](#4-hướng-dẫn-dành-cho-kế-toán--thủ-quỹ-accountant)
5. [Hướng Dẫn Dành Cho Nhân Viên (Khảo Sát / Đo Vẽ / Pháp Lý)](#5-hướng-dẫn-dành-cho-nhân-viên-khảo-sát--đo-vẽ--pháp-lý)
6. [Quy Trình Tạm Ứng & Quyết Toán Hoàn Ứng 3 Bước](#6-quy-trình-tạm-ứng--quyết-toán-hoàn-ứng-3-bước)
7. [Quy Chuẩn In Ấn Chứng Từ & Sổ Sách (TT 99/2025/TT-BTC)](#7-quy-chuẩn-in-ấn-chứng-từ--sổ-sách-tt-992025tt-btc)
8. [Danh Mục Thu Chi Chuẩn Ngành Trắc Địa & Bản Đồ](#8-danh-mục-thu-chi-chuẩn-ngành-trắc-địa--bản-đồ)
9. [Nguyên Tắc An Toàn Tài Chính & Giải Đáp Thắc Mắc (FAQ)](#9-nguyên-tắc-an-toàn-tài-chính--giải-đáp-thắc-mắc-faq)

---

## 1. TỔNG QUAN KIẾN TRÚC & PHÂN ĐỊNH TRÁCH NHIỆM (SoD)

Hệ thống Tài chính & Kế toán của WIFIM ERP được thiết kế theo nguyên tắc **Phân định trách nhiệm nghiêm ngặt (Segregation of Duties - SoD)** nhằm ngăn ngừa rủi ro thất thoát dòng tiền, bảo vệ an toàn ngân quỹ và bảo mật doanh thu hợp đồng:

```mermaid
flowchart TD
    subgraph "PHÂN ĐỊNH QUYỀN HẠN DÒNG TIỀN (SoD)"
        Dir["BAN GIÁM ĐỐC\n(isDirector = true)"]
        Acc["BỘ PHẬN KẾ TOÁN\n(role: accountant)"]
        Emp["NHÂN VIÊN HIỆN TRƯỜNG\n(Cổng thông tin cá nhân)"]
        
        Dir -->|"1. Toàn quyền lập & duyệt Phiếu Thu"| Inc["Phiếu Thu (INCOME)\n& Doanh Thu Hợp Đồng"]
        Dir -->|"2. Phê duyệt chi tiền & yêu cầu tạm ứng"| Appr["Duyệt Phiếu / Từ Chối"]
        Dir -->|"3. Quản lý công nợ & hoàn trả nộp thừa"| Rec["Sổ Công Nợ (RECEIVABLES)"]
        
        Acc -->|"1. Lập phiếu chi tiền / chi bù"| Exp["Phiếu Chi (EXPENSE)"]
        Acc -->|"2. Xuất phiếu tạm ứng từ lệnh đã duyệt"| Adv["Phiếu Tạm Ứng (ADVANCE)"]
        Acc -->|"3. Quyết toán hoàn ứng & in ấn TT 99"| Clr["Quyết Toán (REIMBURSEMENT)"]
        
        Emp -->|"1. Gửi Đề xuất tạm ứng công tác"| Req["Yêu Cầu Tạm Ứng (PENDING)"]
        Emp -->|"2. Bàn giao hóa đơn quyết toán"| Inv["Chứng từ thực chi"]
        Emp -->|"3. Xem phiếu lương 3P của chính mình"| Pay["Lương Của Tôi"]
    end
```

### Bảng Ma Trận Phân Quyền Tài Chính Cốt Lõi:

| Nghiệp vụ / Tài nguyên | Ban Giám Đốc | Kế toán & Thủ quỹ | Nhân viên nghiệp vụ | Cơ chế an toàn trong hệ thống |
| :--- | :---: | :---: | :---: | :--- |
| **Lập & cập nhật Phiếu Thu** | ✅ Toàn quyền | ❌ Bị chặn 403 | ❌ Bị chặn | `assert_transaction_write_scope`: Chỉ Giám đốc được lập phiếu thu |
| **Xem Dòng tiền Thu & Doanh thu** | ✅ Toàn quyền | ❌ Ẩn tự động | ❌ Bị chặn | `finance_visibility`: Kế toán tự động chuyển sang chế độ `expense` (chỉ xem chi) |
| **Lập Phiếu Chi tiền** | ✅ Toàn quyền | ✅ Lập phiếu chờ duyệt | ❌ Bị chặn | Kế toán lập phiếu chi ở trạng thái `PENDING` gửi Giám đốc |
| **Phê duyệt Phiếu Thu / Chi** | ✅ Duyệt / Từ chối | ❌ Không tự duyệt | ❌ Bị chặn | `assert_director`: Chỉ Giám đốc mới có quyền duyệt để xuất quỹ |
| **Xem & Xử lý Công nợ Phải thu** | ✅ Toàn quyền | ❌ Ẩn màn hình | ❌ Bị chặn | Bảo mật tuyệt đối công nợ và giá trị hợp đồng khách hàng |
| **Duyệt Yêu cầu Tạm ứng** | ✅ Duyệt / Từ chối | ❌ Không tự duyệt | ❌ Bị chặn | Nhân viên gửi $\rightarrow$ Giám đốc duyệt $\rightarrow$ Kế toán mới được chi |
| **Lập Phiếu Tạm ứng & Chi tiền** | ❌ Chờ kế toán xuất | ✅ Thực hiện chi | ❌ Bị chặn | Chỉ lập được khi có Yêu cầu đã được Giám đốc phê duyệt |
| **Hoàn trả tiền nộp thừa cho khách**| ✅ Toàn quyền | ❌ Bị chặn 403 | ❌ Bị chặn | `assert_director`: Chỉ Giám đốc được duyệt hoàn tiền thừa |
| **Chốt sổ quỹ / Khóa kỳ kế toán** | ✅ Toàn quyền | ❌ Bị chặn | ❌ Bị chặn | Khóa bất biến toàn bộ giao dịch trước ngày chốt sổ |
| **Khóa bảng lương tháng** | ✅ Khóa sổ lương | ❌ Không được khóa | ❌ Bị chặn | Chốt snapshot cố định lương toàn công ty |

---

## 2. CẤU TRÚC GIAO DIỆN 3 PHÂN HỆ & 13 TAB NGHIỆP VỤ

Màn hình Tài chính được quy hoạch khoa học thành **3 Nhóm Phân Hệ Chính** với **13 Tab chức năng**:

```mermaid
mindmap
  root((Tài Chính & Kế Toán))
    Nhóm 1: Dòng tiền & Sổ quỹ
      Báo cáo tháng 🔒 [Giám đốc]
      Nhật ký thu chi [Toàn hệ thống]
      Quỹ tiền mặt [Két tiền mặt]
      Quỹ ngân hàng [Tài khoản NH]
      Chứng từ in Thu/Chi [Mẫu TT 99]
    Nhóm 2: Công nợ & Tạm ứng
      Thu công nợ 🔒 [Giám đốc]
      Công nợ phải thu 🔒 [Giám đốc]
      Đề xuất tạm ứng [Phiếu & Yêu cầu]
      Quyết toán hoàn ứng [Đối trừ chi phí]
    Nhóm 3: Lương 3P & Danh mục
      Lương khoán nhiệm vụ [Lương kỹ thuật]
      Bảng giá khoán [Đơn giá định mức]
      Lương VP & Hoa hồng [Bảng lương tháng]
      Thiết lập tài chính 🔒 [Giám đốc]
```

### Chi Tiết Quyền Hiển Thị Từng Tab:
- **Nhóm 1: Dòng tiền & sổ quỹ**
  1. `monthly-dashboard` (*Báo cáo tháng*): Biểu đồ doanh số, chi phí, cơ cấu nhóm chi, nút xuất Excel tổng hợp. *(Chỉ Giám đốc)*
  2. `cashflow-all` (*Nhật ký thu chi*): Danh sách mọi biến động dòng tiền (Kế toán chỉ thấy phiếu chi; Giám đốc thấy cả thu và chi).
  3. `cashflow-cash` (*Quỹ tiền mặt*): Quản lý sổ quỹ tiền mặt thực tế, kiểm kê két, đối soát phiếu thu/chi tiền mặt.
  4. `cashflow-bank` (*Quỹ ngân hàng*): Quản lý tài khoản ngân hàng công ty, giao dịch chuyển khoản, ủy nhiệm chi.
  5. `cashflow-print` (*Chứng từ in Thu/Chi*): Công cụ soạn và in Phiếu Thu (Mẫu 01-TT), Phiếu Chi (Mẫu 02-TT).
- **Nhóm 2: Công nợ & tạm ứng**
  6. `debt-collection` (*Thu công nợ*): Theo dõi tiến độ thanh toán theo từng đợt của hợp đồng. *(Chỉ Giám đốc)*
  7. `receivables` (*Công nợ phải thu*): Sổ chi tiết nợ khách hàng, tuổi nợ (Aging), nộp thừa, nút hoàn tiền thừa. *(Chỉ Giám đốc)*
  8. `advance-request` (*Đề xuất tạm ứng*): Theo dõi luồng tạm ứng từ nhân viên, nút Giám đốc duyệt, nút Kế toán chi tiền.
  9. `advance-clear` (*Quyết toán hoàn ứng*): Nhập chi phí thực tế, tự sinh phiếu hoàn tiền thừa hoặc chi bù.
- **Nhóm 3: Lương 3P & danh mục**
  10. `payroll-worker` (*Lương khoán nhiệm vụ*): Lương 3P theo hạng mục kỹ thuật/đo đạc hoàn thành.
  11. `bang-gia` (*Bảng giá khoán*): Danh mục 15 đơn giá khoán chuẩn của công ty, lịch sử sửa đổi giá.
  12. `payroll-office` (*Lương VP & hoa hồng*): Bảng tính lương khối văn phòng, hoa hồng kinh doanh, nút Khóa sổ lương.
  13. `cashflow-settings` (*Thiết lập tài chính*): Cấu hình số dư đầu kỳ, chốt kỳ sổ quỹ, cấu hình 5 chữ ký in chứng từ. *(Chỉ Giám đốc)*

---

## 3. HƯỚNG DẪN DÀNH CHO BAN GIÁM ĐỐC (DIRECTOR / ADMIN)

> **Đối tượng áp dụng**: Tổng Giám Đốc, Giám Đốc Điều Hành, Phó Giám Đốc Tài Chính.  
> **Điều kiện tài khoản**: Tài khoản `admin` hoặc nhân sự có cờ `isDirector = true`.

### 3.1. Lập Phiếu Thu Tiền & Ghi Nhận Dòng Tiền Vào
> [!IMPORTANT]
> Nhằm đảm bảo an toàn tuyệt đối, hệ thống quy định **duy nhất Ban Giám Đốc** mới có quyền lập và duyệt Phiếu Thu. Kế toán không thể tự tạo phiếu thu tiền.

1. Vào tab **Nhật Ký Thu Chi** (hoặc Quỹ tiền mặt / Quỹ ngân hàng) $\rightarrow$ Bấm nút **`[+ Thu Tiền]`**.
2. Điền thông tin phiếu thu:
   - **Hợp đồng / Dự án**: Gõ tìm kiếm mã hợp đồng hoặc tên khách hàng. Hệ thống tự động điền Tên đối tác và Số điện thoại từ CRM.
   - **Hạng mục thu**: Chọn đúng danh mục (Thu tiền hợp đồng dịch vụ, Thu cọc, Thu hồi công nợ...).
   - **Số tiền**: Nhập số tiền thu được. Hệ thống tự động chuyển số tiền thành chữ tiếng Việt chuẩn xác.
   - **Hình thức**: `Tiền mặt` (nhập quỹ két) hoặc `Chuyển khoản` (vào tài khoản ngân hàng).
   - **Trạng thái**: Chọn `Hoàn thành` (đã nhận tiền thực tế) hoặc `Chờ duyệt` (chờ đối soát ngân hàng).
3. Bấm **`[Lưu Phiếu Thu]`**. Nếu ở trạng thái `Hoàn thành`, hệ thống lập tức cộng số dư quỹ và tự động giảm trừ công nợ của hợp đồng.

### 3.2. Phê Duyệt Phiếu Chi Tiền Của Kế Toán
- Khi Kế toán lập phiếu chi, giao dịch xuất hiện với huy hiệu màu vàng cam **`Chờ duyệt`** (PENDING). Lúc này, **quỹ tiền chưa bị trừ**.
- Giám đốc nhấp vào mã phiếu để xem chi tiết:
  - Xem kỹ nội dung chi, người nhận tiền, hóa đơn/chứng từ gốc đính kèm.
  - Bấm **`[✓ Duyệt Phiếu]`**: Hệ thống trừ tiền quỹ, cập nhật số dư tức thì, ghi nhận lịch sử duyệt vào `AuditLog`.
  - Bấm **`[✕ Từ Chối]`**: **Bắt buộc nhập lý do từ chối** (Ví dụ: "Thiếu hóa đơn VAT", "Chi sai định mức") để Kế toán nắm rõ và bổ sung.

### 3.3. Xử Lý Hợp Đồng Nộp Thừa (Hoàn Tiền Cho Khách Hàng)
1. Vào tab **Công Nợ Phải Thu** $\rightarrow$ Hệ thống tự động gắn huy hiệu màu tím **`Nộp thừa`** cho các hợp đồng có số tiền đã thu lớn hơn giá trị hợp đồng.
2. Tại cột Xử lý, Giám đốc bấm nút **`[Hoàn tiền thừa]`**.
3. Nhập số tiền cần hoàn trả và lý do hoàn trả $\rightarrow$ Bấm xác nhận.
4. Hệ thống tự động lập một **Phiếu Chi hoàn tiền** (hạng mục `Chi hoàn trả khách hàng`), trừ số tiền nộp thừa và cân bằng lại công nợ hợp đồng.

### 3.4. Hủy Phiếu Sai Sót (Cơ Chế Bút Toán Đảo - Voiding)
> [!WARNING]
> Hệ thống áp dụng chuẩn kiểm toán quốc tế: **Tuyệt đối không xóa cứng (Hard Delete)** giao dịch tài chính đã ghi nhận.

- Khi phát hiện một giao dịch đã duyệt bị sai sót: Mở chi tiết phiếu $\rightarrow$ Bấm nút **`[Hủy phiếu]`**.
- Bắt buộc nhập lý do hủy.
- Hệ thống tự động thực hiện **Bút toán đảo ngược**:
  - Hủy phiếu chi: Tự sinh nghiệp vụ hoàn tiền lại vào quỹ.
  - Hủy phiếu thu: Tự sinh nghiệp vụ điều chỉnh giảm quỹ và phục hồi lại công nợ gốc của khách hàng.
  - Toàn bộ thao tác hủy được gắn thẻ `CANCELLED`, gạch ngang số tiền và lưu rõ người hủy, ngày giờ, lý do.

### 3.5. Chốt Sổ Quỹ & Khóa Kỳ Kế Toán
1. Vào tab **Thiết Lập Tài Chính** $\rightarrow$ Mục **Chốt Sổ Quỹ / Khóa Kỳ Kế Toán**.
2. Chọn mốc thời gian cần chốt (Ví dụ: 23:59:59 ngày cuối tháng). Hệ thống tự động tính toán chính xác số dư thực tế của Quỹ Tiền Mặt và Quỹ Ngân Hàng đến từng giây.
3. Giám đốc kiểm đếm tiền thực tế trong két, nhập số dư xác nhận và ghi chú biên bản kiểm kê $\rightarrow$ Bấm **`[Xác Nhận Chốt Kỳ]`**.
4. **Hiệu lực khóa**: Toàn bộ giao dịch thu chi có ngày $\le$ ngày chốt sẽ bị khóa bất biến (`Immutable`). Kế toán không thể thêm, sửa, hay hủy các phiếu thuộc kỳ đã chốt.

### 3.6. Cấu Hình Tên & Chức Danh 5 Chữ Ký Chứng Từ
1. Vào tab **Thiết Lập Tài Chính** $\rightarrow$ Mục **Cấu Hình Người Ký Chứng Từ**.
2. Điền thông tin chuẩn của ban điều hành:
   - **Giám đốc**: Họ tên (Mặc định: *Lê Văn Sáu*).
   - **Kế toán trưởng**: Họ tên & Chức danh (*Kế toán trưởng* hoặc *Kế toán phụ trách*).
   - **Thủ quỹ**: Họ tên thủ quỹ chịu trách nhiệm tiền mặt.
   - **Kế toán tiền lương**: Họ tên kế toán phụ trách bảng lương.
3. Bấm **`[Lưu Cấu Hình Người Ký]`**. Khi lập phiếu, hệ thống sẽ chụp ảnh lịch sử (Signer Snapshot) các chức danh này gắn chặt vào chứng từ in.

---

## 4. HƯỚNG DẪN DÀNH CHO KẾ TOÁN & THỦ QUỸ (ACCOUNTANT)

> **Đối tượng áp dụng**: Kế toán trưởng, Kế toán thanh toán, Kế toán chi phí, Thủ quỹ.  
> **Quyền hạn hệ thống**: Tài khoản có Role `accountant`.

### 4.1. Tầm Nhìn Dữ Liệu & Phạm Vi Thao Tác
> [!NOTE]
> Nhằm bảo mật doanh thu theo chính sách của Ban Giám Đốc, tài khoản Kế toán khi đăng nhập vào hệ thống sẽ hoạt động ở chế độ **`expense` (chỉ xem chi phí)**:
> - Chỉ hiển thị các tab: *Nhật ký thu chi, Quỹ tiền mặt, Quỹ ngân hàng, Chứng từ in, Đề xuất tạm ứng, Quyết toán hoàn ứng, Lương khoán, Bảng giá khoán, Lương văn phòng*.
> - Mọi số liệu và dòng tiền Thu (INCOME) được hệ thống tự động ẩn để tránh lộ dữ liệu doanh thu hợp đồng.
> - Kế toán **chỉ lập và cập nhật Phiếu Chi (EXPENSE)**. Không lập phiếu thu.

### 4.2. Lập Phiếu Chi Tiền Hàng Ngày
1. Tại tab **Nhật Ký Thu Chi** (hoặc Quỹ tiền mặt / Quỹ ngân hàng) $\rightarrow$ Bấm nút **`[- Chi Tiền]`**.
2. Nhập các thông tin chứng từ:
   - **Hạng mục chi**: Chọn đúng trong danh mục chuẩn (Văn phòng phẩm, Công tác phí, Xăng xe, Điện nước, Sửa máy đo...).
   - **Đối tác / Người nhận tiền**: Điền tên cá nhân/đơn vị nhận thanh toán.
   - **Số tiền**: Nhập số tiền chi.
   - **Hình thức**: `Tiền mặt` hoặc `Chuyển khoản`.
   - **Diễn giải**: Ghi rõ mục đích chi, số hóa đơn chứng từ gốc kèm theo.
   - **Đính kèm**: Tải lên ảnh chụp hóa đơn, biên nhận, phiếu xuất kho.
3. Bấm **`[Lưu Phiếu Chi]`**. Phiếu được lưu ở trạng thái `Chờ duyệt` (PENDING) và chuyển ngay lên thông báo chờ Giám đốc phê duyệt.

### 4.3. Xuất Phiếu Tạm Ứng Từ Yêu Cầu Đã Được Giám Đốc Duyệt
> [!IMPORTANT]
> Kế toán **tuyệt đối không lập phiếu tạm ứng tự do** nếu chưa có đề xuất được Giám đốc phê duyệt trước trên hệ thống.

1. Vào tab **Đề Xuất Tạm Ứng**.
2. Tìm yêu cầu tạm ứng có huy hiệu màu xanh lá **`ĐÃ DUYỆT (DIRECTOR_APPROVED)`**.
3. Bấm nút **`[Lập Phiếu Tạm Ứng & Chi]`**.
4. Kiểm tra số tiền, chọn hình thức chi trả (`Tiền mặt` tại quỹ két hoặc `Chuyển khoản` vào STK nhân viên) $\rightarrow$ Xác nhận chi.
5. Hệ thống tự động sinh một **Phiếu Tạm Ứng (ADVANCE)** chính thức, trừ tiền quỹ và chuyển trạng thái yêu cầu của nhân viên thành `ĐÃ CHI TIỀN (ISSUED)`.

### 4.4. Thực Hiện Quyết Toán Hoàn Ứng (Advance Settlement)
1. Khi nhân viên công tác về và nộp lại toàn bộ hóa đơn/chứng từ thực chi: Vào tab **Quyết Toán Hoàn Ứng**.
2. Chọn phiếu tạm ứng cần quyết toán của nhân viên đó.
3. Nhập **Số tiền thực chi** theo tổng hóa đơn hợp lệ nộp lại.
4. Hệ thống tự động đối trừ:
   - **Nếu Thực chi < Tạm ứng (Thừa tiền)**: Nhân viên phải nộp lại tiền thừa vào quỹ $\rightarrow$ Hệ thống tự động sinh một **Phiếu Thu hoàn ứng (REIMBURSEMENT)** nhập lại quỹ két.
   - **Nếu Thực chi > Tạm ứng (Thiếu tiền)**: Công ty chi bù thêm cho nhân viên $\rightarrow$ Hệ thống tự động sinh một **Phiếu Chi bù (REIMBURSEMENT)** xuất quỹ.
   - **Nếu Thực chi = Tạm ứng**: Quyết toán cân bằng, không phát sinh dòng tiền bù trừ.
5. Bấm **`[Xác Nhận Quyết Toán]`** $\rightarrow$ Phiếu tạm ứng gốc chuyển sang trạng thái **`ĐÃ QUYẾT TOÁN (SETTLED)`**.

### 4.5. Soạn Thảo & In Chứng Từ Kế Toán Chuẩn Bộ Tài Chính
1. Vào tab **Chứng Từ In (Thu/Chi)**.
2. Chọn biểu mẫu cần in:
   - **Phiếu Thu (Mẫu 01 - TT)**
   - **Phiếu Chi (Mẫu 02 - TT)**
   - **Phiếu Tạm Ứng (Mẫu 02 - TT/TỨ)**
   - **Giấy Thanh Toán Tạm Ứng (Mẫu 03 - TT/HỨ)**
3. Nhập/chọn mã phiếu cần in hoặc điền thông tin nhanh. Hệ thống tự động:
   - Điền tài khoản Nợ/Có chuẩn mực kế toán (1111, 1121, 141, 642, 334, 154, 131, 511).
   - Đọc số tiền thành chữ tiếng Việt chuẩn xác.
   - Lấy đúng tên các chức danh ký tên từ cấu hình hoặc snapshot chứng từ.
4. Bấm **`[🖨️ In Phiếu]`** để xuất lệnh in máy in hoặc lưu thành file PDF khổ A4/A5.

### 4.6. Xác Nhận Chi Trả Lương Đã Khóa
1. Vào tab **Lương VP & Hoa Hồng**.
2. Với các kỳ lương đã được Giám đốc bấm Khóa sổ (`locked`), sau khi Kế toán/Thủ quỹ hoàn tất chuyển khoản hoặc phát tiền mặt cho nhân viên, bấm nút **`[Xác Nhận Đã Thanh Toán Lương]`**.
3. Kỳ lương chuyển trạng thái sang **`ĐÃ THANH TOÁN (PAID)`**.

---

## 5. HƯỚNG DẪN DÀNH CHO NHÂN VIÊN (KHẢO SÁT / ĐO VẼ / PHÁP LÝ)

> **Đối tượng áp dụng**: Kỹ sư trắc địa, Đội trưởng đo đạc hiện trường, Chuyên viên thụ lý hồ sơ đất đai, Nhân viên kinh doanh.  
> **Giao diện thao tác**: **Cổng Thông Tin Nhân Viên (Employee Portal)**.

### 5.1. Gửi Đề Xuất Tạm Ứng Công Tác / Hiện Trường
1. Trước khi đi đo đạc thực địa, cắm mốc hoặc nộp lệ phí cơ quan nhà nước, nhân viên đăng nhập vào Cổng thông tin $\rightarrow$ Chọn mục **Tạm Ứng Của Tôi** $\rightarrow$ Bấm **`[+ Gửi Đề Xuất Tạm Ứng]`**.
2. Điền phiếu đề xuất:
   - **Hợp đồng / Dự án**: Chọn mã hợp đồng/công trình sắp thực hiện.
   - **Số tiền xin tạm ứng**: Nhập số tiền dự toán chi phí.
   - **Nội dung chi tiết**: Ghi rõ mục đích (Ví dụ: "Tạm ứng cắm mốc ranh 4 góc thửa đất và tiền trích lục bản đồ huyện Cần Giờ").
   - **Hình thức nhận**: `Tiền mặt` (nhận tại quầy thủ quỹ) hoặc `Chuyển khoản` (nhập STK ngân hàng cá nhân).
3. Bấm **`[Gửi Đề Xuất]`**. Yêu cầu chuyển ngay vào danh sách chờ Ban Giám Đốc duyệt.

### 5.2. Theo Dõi Tiến Độ Giải Ngân Đề Xuất Tạm Ứng
Nhân viên theo dõi cột trạng thái của đề xuất:
- 🟡 **Chờ duyệt (PENDING)**: Đang chờ Ban Giám Đốc xem xét.
- 🟢 **Giám đốc đã duyệt (DIRECTOR_APPROVED)**: Đã được phê duyệt, Kế toán đang chuẩn bị xuất tiền.
- 🔵 **Đã chi tiền (ISSUED)**: Kế toán đã lập phiếu chi. Nhân viên liên hệ Thủ quỹ nhận tiền mặt hoặc kiểm tra tài khoản ngân hàng.
- 🔴 **Từ chối (REJECTED)**: Đề xuất bị từ chối. Nhân viên rê chuột vào để xem lý do từ chối của Giám đốc để chỉnh sửa gửi lại.

### 5.3. Bàn Giao Hóa Đơn & Quyết Toán Hoàn Ứng
1. Sau khi hoàn thành công tác, nhân viên tập hợp toàn bộ hóa đơn đỏ, biên nhận nộp lệ phí, phiếu thu trích lục, hóa đơn xăng xe...
2. Nộp toàn bộ chứng từ gốc cho Kế toán để thực hiện quyết toán.
3. Kế toán nhập số tiền thực chi:
   - Nếu còn thừa tiền tạm ứng: Nhân viên hoàn trả lại tiền mặt cho Thủ quỹ.
   - Nếu chi vượt số tiền tạm ứng: Kế toán xuất quỹ chi bù thêm cho nhân viên.

### 5.4. Tra Cứu Bảng Lương Cá Nhân (Lương Của Tôi)
- Vào mục **Lương Của Tôi** trên Cổng nhân viên:
  - Xem chi tiết **Lương cơ bản**, ngày công chuẩn, ngày công thực tế.
  - Xem chi tiết **Lương khoán nhiệm vụ (Lương 3P)**: Liệt kê từng node công việc, mã hồ sơ đã đo vẽ/thụ lý thành công được nghiệm thu.
  - Xem các khoản phụ cấp, thưởng tiến độ, thưởng dự án ưu tiên.
  - Xem tổng thu nhập thực nhận (NET).
- **Nguyên tắc bảo mật**: Nhân viên chỉ xem được duy nhất bảng lương của chính mình, không thể xem bảng lương của người khác hay bảng lương toàn công ty.

---

## 6. QUY TRÌNH TẠM ỨNG & QUYẾT TOÁN HOÀN ỨNG 3 BƯỚC

Quy trình tạm ứng trong WIFIM ERP được thiết kế khép kín theo chuẩn kiểm soát nội bộ 3 bước nhằm chống thất thoát:

```mermaid
sequenceDiagram
    autonumber
    actor NV as Nhân Viên Hiện Trường
    actor GD as Ban Giám Đốc
    actor KT as Kế Toán / Thủ Quỹ
    participant DB as Hệ Thống CSDL

    Note over NV, DB: BƯỚC 1: ĐỀ XUẤT TẠM ỨNG
    NV->>DB: Gửi yêu cầu tạm ứng (Mã HĐ, Số tiền, Lý do)
    DB-->>NV: Trạng thái: PENDING (Chưa sinh phiếu chi)

    Note over GD, DB: BƯỚC 2: PHÊ DUYỆT CẤP CAO
    GD->>DB: Xem xét đề xuất & Bấm [Duyệt yêu cầu]
    DB-->>GD: Trạng thái: DIRECTOR_APPROVED

    Note over KT, DB: BƯỚC 3: CHI TIỀN CHÍNH THỨC
    KT->>DB: Bấm [Lập Phiếu Tạm Ứng & Chi]
    DB->>DB: Kiểm tra chống âm quỹ tiền mặt
    DB-->>KT: Sinh Phiếu ADVANCE, trừ tiền quỹ, Trạng thái: ISSUED
    KT->>NV: Giải ngân tiền mặt / Chuyển khoản

    Note over NV, KT: BƯỚC 4: QUYẾT TOÁN HOÀN ỨNG
    NV->>KT: Nộp lại hóa đơn, chứng từ thực tế
    KT->>DB: Nhập số tiền thực chi tại màn Quyết toán
    alt Thực chi < Tạm ứng (Thừa tiền)
        DB-->>KT: Tự sinh Phiếu Thu hoàn tiền thừa nhập quỹ
    else Thực chi > Tạm ứng (Thiếu tiền)
        DB-->>KT: Tự sinh Phiếu Chi bù tiền xuất quỹ
    end
    DB-->>DB: Phiếu tạm ứng gốc chuyển thành: SETTLED (Đã quyết toán)
```

---

## 7. QUY CHUẨN IN ẤN CHỨNG TỪ & SỔ SÁCH (TT 99/2025/TT-BTC)

Toàn bộ hệ thống in ấn trong WIFIM ERP tuân thủ nghiêm ngặt các quy định về chứng từ kế toán của Bộ Tài Chính theo **Thông tư số 99/2025/TT-BTC** (áp dụng cho các doanh nghiệp đo đạc bản đồ, tư vấn xây dựng):

### 7.1. Bảng Tiêu Chuẩn Các Biểu Mẫu Chứng Từ:

| Biểu Mẫu | Mã Số TT 99 | Tài Khoản Nợ | Tài Khoản Có | Chữ Ký Tiền Mặt (5 Chữ Ký) | Chữ Ký Chuyển Khoản |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Phiếu Thu** | **01 - TT** | `1111` | `131`, `511` | Giám đốc, Kế toán trưởng, Thủ quỹ, Người lập phiếu, Người nộp tiền | Giám đốc, Kế toán trưởng, Người lập phiếu |
| **Phiếu Chi** | **02 - TT** | `642`, `334`, `154` | `1111` | Giám đốc, Kế toán trưởng, Thủ quỹ, Người lập phiếu, Người nhận tiền | Giám đốc, Kế toán trưởng, Người lập phiếu |
| **Phiếu Tạm Ứng** | **02 - TT/TỨ**| `141` | `1111` / `1121` | Giám đốc, Kế toán trưởng, Thủ quỹ, Người lập, Người nhận tạm ứng | Giám đốc, Kế toán trưởng, Người lập, Người nhận tạm ứng |
| **Giấy Thanh Toán Tạm Ứng** | **03 - TT/HỨ**| `642`, `154` | `141` | Giám đốc, Kế toán trưởng, Thủ quỹ, Người thanh toán | Giám đốc, Kế toán trưởng, Người thanh toán |

### 7.2. Cơ Chế Snapshot Chữ Ký Bất Biến (Signer Snapshot)
- Khi một phiếu tài chính được khởi tạo hoặc phê duyệt, hệ thống tự động chụp ảnh cấu hình người ký tại thời điểm đó (`signer_snapshot` trong CSDL).
- **Lợi ích**: Kể cả sau này công ty có thay đổi Kế toán trưởng, Thủ quỹ hay Giám đốc thì các chứng từ in của những năm trước vẫn giữ nguyên vẹn họ tên của người đã ký tại thời điểm lịch sử đó, bảo đảm tính pháp lý trước cơ quan Thuế và Kiểm toán.

### 7.3. Quy Chuẩn Sổ Sách Nhiều Trang
- **Phông chữ chuẩn mực**: Toàn bộ chứng từ in sử dụng phông chữ *Times New Roman*, kích thước chữ rõ ràng, căn lề chuẩn trang in văn bản hành chính.
- **Tiêu đề bảng lặp lại**: Khi in sổ Nhật ký thu chi hoặc Sổ công nợ nhiều trang, hàng tiêu đề cột sẽ tự động lặp lại ở đầu mỗi trang để tránh nhầm lẫn.
- **Dòng TỔNG CỘNG kế toán**: Áp dụng quy tắc kế toán: Dòng **TỔNG CỘNG** chỉ xuất hiện **duy nhất 1 lần ở chân trang cuối cùng**, không bị in lặp rác ở các trang giữa.

---

## 8. DANH MỤC THU CHI CHUẨN NGÀNH TRẮC ĐỊA & BẢN ĐỒ

Hệ thống đã chuẩn hóa sẵn toàn bộ danh mục tài chính đặc thù của ngành Đo đạc, Địa chính và Xây dựng:

### 8.1. Danh Mục Thu (INCOME)
1. **Thu tiền hợp đồng dịch vụ**: Thu tiền theo hợp đồng đo vẽ, hồ sơ cấp sổ, chuyển mục đích sử dụng đất, trích lục bản đồ.
2. **Thu hoàn tiền tạm ứng thừa**: Thu hồi tiền thừa từ nhân viên sau khi quyết toán công tác phí/hiện trường.
3. **Thu chênh lệch kiểm kê quỹ**: Thu hồi khoản tiền thừa sau khi kiểm kê quỹ két tiền mặt.
4. **Thu lãi tiền gửi & Tài chính**: Lãi suất ngân hàng từ tài khoản thanh toán công ty.
5. **Thu hoàn tác (Hủy phiếu chi)**: Dòng tiền phục hồi lại quỹ sau khi hủy phiếu chi sai.
6. **Thu khác**: Các khoản thu thanh lý thiết bị cũ, thu hỗ trợ khác.

### 8.2. Danh Mục Chi (EXPENSE)
1. **Chi phí tạm ứng công tác**: Tạm ứng đi đo đạc thực địa, cắm mốc, dẫn mốc ranh.
2. **Chi ngoại giao & Xử lý hồ sơ**: Chi phí quan hệ công việc, giải quyết nhanh thủ tục hồ sơ địa chính.
3. **Bồi dưỡng thẩm định & Hiện trường**: Bồi dưỡng cán bộ thẩm định hiện trường, cán bộ địa chính dẫn ranh mốc.
4. **Chi thụ lý bản vẽ & Trích lục**: Lệ phí trích lục bản đồ địa chính, lấy bản vẽ nội nghiệp.
5. **Công chứng, Lệ phí & Nghĩa vụ thuế**: Lệ phí nộp ngân sách, công chứng vi bằng, trước bạ.
6. **Chi tiếp khách & Giao tế**: Chi phí cà phê, tiếp đối tác, mở rộng khách hàng của phòng Kinh doanh.
7. **Chi lương, Thù lao & Hoa hồng 3P**: Chi lương văn phòng, lương khoán kỹ thuật viên đo vẽ và hoa hồng kinh doanh.
8. **Công tác phí & Di chuyển hiện trường**: Tiền xăng xe, thuê xe đo đạc, bưu chính chuyển phát nhanh bản đồ.
9. **Văn phòng phẩm & In ấn kỹ thuật**: Mua giấy in A0, A3, mực máy plotter, ghim, bìa hồ sơ địa chính.
10. **Điện - Nước - Internet**: Chi phí điện sinh hoạt, nước văn phòng, đường truyền cáp quang.
11. **Sửa chữa, Kiểm định máy đo & Thiết bị**: Chi phí hiệu chuẩn, kiểm định trạm Total Station, máy GPS RTK, sửa chữa máy tính.
12. **Chi hoàn trả khách hàng**: Hoàn trả tiền thừa hợp đồng hoặc tiền cọc cho khách.
13. **Chi điều chỉnh hủy phiếu (Hủy phiếu thu)**: Bút toán đảo giảm quỹ khi hủy phiếu thu sai.
14. **Chi chênh lệch kiểm kê quỹ**: Hạch toán khoản thiếu hụt tiền mặt sau khi kiểm kê két.
15. **Chi phí hành chính & Khác**: Các chi phí lặt vặt văn phòng khác.

---

## 9. NGUYÊN TẮC AN TOÀN TÀI CHÍNH & GIẢI ĐÁP THẮC MẮC (FAQ)

### 9.1. Các Rào Chắn Kiểm Soát Tự Động (Hard Rules)
- 🛡️ **Quy tắc 1 - Chống âm quỹ tiền mặt**: Khi Kế toán hoặc Giám đốc duyệt chi bất kỳ khoản tiền nào, nếu `Số dư quỹ tiền mặt < Số tiền chi`, hệ thống sẽ lập tức chặn đứng giao dịch và báo lỗi: `"Âm quỹ tiền mặt! Số dư: ...₫ < ...₫ cần chi"`.
- 🛡️ **Quy tắc 2 - Khóa bất biến kỳ đã chốt**: Bất kỳ chứng từ nào có ngày giao dịch trước hoặc bằng ngày chốt sổ quỹ gần nhất đều bị từ chối chỉnh sửa hoặc hủy bỏ.
- 🛡️ **Quy tắc 3 - Không trừ nợ trên phiếu chờ duyệt**: Chỉ các phiếu thu có trạng thái `Hoàn thành (COMPLETED)` mới được tính vào số tiền khách đã trả. Phiếu ở trạng thái `Chờ duyệt (PENDING)` tuyệt đối không làm giảm công nợ hợp đồng.
- 🛡️ **Quy tắc 4 - Không tạo lương khoán thủ công**: Hệ thống đã bỏ hoàn toàn tính năng thêm phiếu lương khoán bằng tay. Toàn bộ tiền khoán 3P bắt buộc phải sinh tự động từ các Checklist công việc đã được nghiệm thu hoàn thành trong Workflow.

---

### 9.2. Giải Đáp Thắc Mắc Thường Gặp (FAQ)

#### ❓ Câu hỏi 1: Vì sao tài khoản Kế toán của tôi không thấy nút `[+ Thu Tiền]`?
> **Giải đáp**: Để ngăn ngừa thất thoát dòng tiền, hệ thống thiết lập nguyên tắc phân định trách nhiệm (SoD): **Chỉ Ban Giám Đốc mới có quyền lập và duyệt Phiếu Thu**. Kế toán phụ trách kiểm soát các khoản chi, tạm ứng và đối soát công nợ.

#### ❓ Câu hỏi 2: Tại sao số dư tiền mặt của tôi hiển thị khác với số tiền thực tế đếm trong két?
> **Giải đáp**: Có 2 nguyên nhân phổ biến:
> 1. Có phiếu chi đang ở trạng thái **`Chờ duyệt`**: Hệ thống chưa trừ tiền quỹ cho đến khi Giám đốc bấm Duyệt.
> 2. Kế toán chưa thực hiện **Chốt Sổ Quỹ** kỳ trước: Vào tab *Thiết lập tài chính*, đối chiếu lại số dư đầu kỳ và bấm chốt sổ quỹ định kỳ.

#### ❓ Câu hỏi 3: Nếu nhân viên làm mất hóa đơn khi đi hiện trường thì xử lý quyết toán thế nào?
> **Giải đáp**: Kế toán yêu cầu nhân viên lập "Bản tường trình kiêm Giấy cam đoan thanh toán không có hóa đơn" có chữ ký phê duyệt của Giám đốc. Khi nhập quyết toán tại tab *Quyết Toán Hoàn Ứng*, Kế toán nhập đúng số tiền Giám đốc đã chuẩn chi và đính kèm ảnh chụp bản tường trình có chữ ký lên hệ thống.

#### ❓ Câu hỏi 4: Khách hàng chuyển khoản nộp thừa tiền hợp đồng, làm sao để hoàn lại?
> **Giải đáp**: Ban Giám Đốc vào tab **Công Nợ Phải Thu** $\rightarrow$ Tìm hợp đồng có huy hiệu tím **`Nộp thừa`** $\rightarrow$ Bấm nút **`[Hoàn tiền thừa]`** $\rightarrow$ Hệ thống sẽ tự động lập phiếu chi xuất trả cho khách và cân đối lại giá trị công nợ hợp đồng về 0.

#### ❓ Câu hỏi 5: Tôi lỡ nhập sai một Phiếu Chi đã được duyệt tuần trước, làm sao để sửa?
> **Giải đáp**: Không thể sửa đè trực tiếp lên phiếu đã duyệt để bảo đảm tính toàn vẹn của sổ sách. Bạn mở chi tiết phiếu $\rightarrow$ Bấm **`[Hủy phiếu]`** $\rightarrow$ Nhập lý do (Ví dụ: "Nhập sai số tiền, lập lại phiếu mới"). Hệ thống sẽ tạo bút toán đảo phục hồi quỹ, sau đó bạn lập lại phiếu chi mới với thông tin chính xác để Giám đốc duyệt lại.

---
**TÀI LIỆU LƯU HÀNH NỘI BỘ — CÔNG TY TNHH KIẾN TRÚC XÂY DỰNG VÀ ĐO ĐẠC BẢN ĐỒ BÁCH KHOA**  
*Mọi thay đổi về quy chế tài chính và nghiệp vụ hệ thống phải được Tổng Giám Đốc phê duyệt.*
