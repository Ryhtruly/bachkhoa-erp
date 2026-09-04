# Design Spec: Nâng cấp Giao diện Chi tiết Tiến độ Node Thực thi (EmployeeItemWorkspace)

## 1. Bối cảnh & Mục tiêu
- **Mục tiêu**: Thay thế toàn bộ giao diện cũ (Hình 1 - bảng viền cứng, màu sắc gắt) của màn hình "Chi tiết Tiến độ Node thực thi" (`EmployeeItemWorkspace.jsx`) sang giao diện thẻ phẳng, hiện đại chuẩn SaaS (Hình 2 từ prototype `t:\New folder`).
- **Nguyên tắc bất khả xâm phạm**: **Tuyệt đối không can thiệp hoặc làm thay đổi logic nghiệp vụ**:
  - Giữ nguyên toàn bộ props, state, event handlers, API fetch, private storage viewer, modal controls, permission checks (`isDirector`).
  - Đảm bảo 100% test suites (`vitest`) trong `dev/frontend` tiếp tục `PASS` (tất cả 89 test files, 604 tests).
  - Không thêm dependency bên ngoài (không ép cài Tailwind gây nguy cơ vỡ layout 50+ màn hình khác). Toàn bộ styling được chuẩn hóa bằng Vanilla CSS vào `employeeWorkspace.css`.

---

## 2. Kiến trúc & Phân rã Giao diện mới

### 2.1. Khung chứa chính (`main.eiw`) & Header
- **Container**: Card trắng nổi `border-radius: 24px`, nền trắng `#ffffff`, viền nhẹ `1px solid #e2e8f0`, đổ bóng mềm `box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05)`, padding `28px 32px`. Nền tổng thể `#f0f4f9`.
- **Top Header (`.eiw-module-head`)**:
  - Badge `MODULE QUY TRÌNH`: Pill bo tròn `border-radius: 9999px`, nền `#eff6ff`, viền `#bfdbfe`, chữ `#2563eb`, font-weight 700.
  - Tiêu đề: `Chi tiết Tiến độ Node thực thi` (font Inter, 22px, đậm).
  - Khối công cụ: `Giai đoạn: <strong>...</strong>`, nút `JSON/API` (`#94a3b8`), và nút `RefreshCw` làm mới dữ liệu.
- **Dải chuỗi bước (`NodeChain.jsx`)**:
  - Đóng gói trong khung bo góc `rounded-2xl` (`border-radius: 16px`, nền `#f8fafc`).
  - Các bước dạng card nhỏ (`border-radius: 12px`), bước đang chọn/đang chạy có viền nổi bật (emerald/orange), số thứ tự trong vòng tròn nhỏ, chấm pulse nhấp nháy cho bước đang thực hiện, mũi tên nối `>` giữa các bước.

---

### 2.2. Khung lưới 2 cột (`.eiw-grid`)
Thay thế bảng 2 cột cứng nhắc cũ bằng Grid phân bổ tỷ lệ vàng `5fr 7fr` (khoảng 42% - 58%), khoảng cách `gap: 24px`, căn mép trên `align-items: start`:

#### Cột Trái (Left Column - Chi tiết tiến độ & tài chính)
1. **Banner Node hiện tại (`NodeInfoCard` / `.eiw-node-banner`)**:
   - Card nền vàng hổ phách nhạt (`background: #fffdf5`, viền `1px solid #fde68a`, bo góc `16px`).
   - Icon thư mục `FolderKanban` / `FolderOpen` trong hộp màu hổ phách bo góc `40x40px`.
   - Nhãn `TÊN NODE HIỆN TẠI` (chữ hoa màu hổ phách đậm) + Tên bước hiện tại.
   - Tag mã bước (`Mã: K01`, ...) nền trắng viền hổ phách.
2. **Card Thời gian còn lại (`EiwTimingClock.jsx`)**:
   - Card bo góc `16px`, viền và nền hổ phách nhẹ `#fffdf5`.
   - Icon `Clock` trong hộp hổ phách.
   - Nhãn `THỜI GIAN CÒN LẠI` + Đồng hồ đếm ngược số to rõ nét (e.g. `12 ngày 4 giờ`).
   - Badge trạng thái hạn (`Đúng hạn`, `Sắp trễ`, `Đồng hồ đã dừng`). Giữ nguyên 100% logic countdown tự động cập nhật mỗi phút.
3. **Card Mô tả nhiệm vụ (`EiwTaskDescription.jsx`)**:
   - Card trắng bo góc `16px`, viền `slate-200`, shadow nhẹ.
   - Tiêu đề `MÔ TẢ NHIỆM VỤ` (slate-700 in hoa).
   - Nội dung mô tả chi tiết công việc.
   - Dòng ngăn cách mảnh + Icon `User` + Người phụ trách `(chức danh)`.
4. **Card Tủ hồ sơ đính kèm (`EiwAttachmentsCard.jsx`)**:
   - Card trắng bo góc `16px`, viền `slate-200`.
   - Tiêu đề `TỦ HỒ SƠ ĐÍNH KÈM` + nút bấm `+ Tải file lên` (màu xanh dương).
   - Danh sách tệp đính kèm kế thừa: Card con bo góc `12px`, hover chuyển màu xanh nhạt.
   - Icon tự động đổi màu theo đuôi file (PDF: xanh dương, ZIP/RAR: xanh lá, DWG/CAD: vàng cam).
   - Tên file + dung lượng + nút `Xem` (mở modal FilePreviewModal) + nút `Mở tủ hồ sơ theo bước` (mở Drawer).
5. **Card Chi phí & Khoán nhiệm vụ (`EiwMoneyBreakdown.jsx`)**:
   - Card nền vàng nhạt hổ phách (`background: rgba(254, 243, 199, 0.25)`, viền `1px solid #fde68a`).
   - Header có icon tròn `đ` + `CHI PHÍ & KHOÁN NHIỆM VỤ` + `Đơn vị: VNĐ`.
   - Dòng "Khoán nhiệm vụ" (bullet tròn, số tiền in đậm).
   - Dòng "Thưởng hoàn thành đúng hạn" (kèm badge `+50%` hoặc `Thưởng dự kiến`).
   - Đường gạch đứt đoạn `border-dashed`.
   - Dòng `TỔNG THANH TOÁN DỰ KIẾN` ("Sau khi hoàn thành và nghiệm thu") với số tiền in to đậm nổi bật.

---

#### Cột Phải (Right Column - Ô nghiệp vụ & Danh mục checklist đầu ra)
1. **Thanh Ô Nghiệp vụ (`.eiw-band--slot` & Top bar)**:
   - Thanh card bo góc `16px`, nền hổ phách nhạt.
   - Badge `Ô NGHIỆP VỤ` màu cam đậm nổi bật.
   - Tên nghiệp vụ của bước (e.g. `Kho giấy tờ khách gửi & Kết quả đầu ra`).
   - Badge số lượng giấy tờ liên kết / danh mục.
2. **Ô Nghiệp vụ chuyên biệt (`NodeBusinessSlot.jsx`)**:
   - Tích hợp liền mạch: K01 Kho giấy tờ khách gửi (`DocumentRegister`), K05a/K05b Tạm dừng/Tiếp tục, K05b Theo dõi nộp hồ sơ cơ quan (`SubmissionReceiptPanel`), K06 Thanh công nợ (`DebtBand`) + Lập phiếu nợ (`HandoverPanel`).
   - Khung viền và padding tinh chỉnh hiện đại, bỏ các đường viền bảng thô cũ.
3. **Danh mục Checklist đầu ra (`NodeOutputList.jsx` & `ChecklistEvidenceItem.jsx`)**:
   - Tiêu đề cột: `DANH MỤC CHECKLIST ĐẦU RA` & `TRẠNG THÁI KIỂM ĐỊNH`.
   - Từng mục checklist được hiển thị dưới dạng Card độc lập bo góc `16px` (viền `slate-200` nếu hợp lệ, viền hồng `rose-200` nếu bị từ chối):
     - **Header mục checklist**:
       - Icon trạng thái tròn `32px`: Xanh lá có dấu check (Hợp lệ), Đỏ hồng có dấu X (Từ chối), Xanh dương (Chờ duyệt).
       - Tiêu đề mục checklist (e.g. `Sơ đồ hiện trạng vị trí`) + Badge trạng thái (`Hợp lệ`, `Bị từ chối`, `Chờ duyệt`).
       - Dòng thông tin người phụ trách & thời gian cập nhật.
       - Badge số lượng giấy tờ con (`3 giấy tờ`).
       - Nút `+ Thêm giấy tờ` (khi được phép đề xuất `canPropose`).
       - Nút mở rộng/thu gọn `ChevronDown` / `ChevronUp`.
     - **Danh sách giấy tờ con bên trong**:
       - Tiêu đề `DANH SÁCH GIẤY TỜ ĐÍNH KÈM (X):` kèm hướng dẫn nhỏ.
       - Từng tệp giấy tờ là sub-card bo tròn `12px`:
         - Icon định dạng tệp trong ô vuông trắng bo góc `32px` (màu theo đuôi CAD/PDF/XLSX/DOC).
         - Tên giấy tờ + Badge trạng thái kiểm định (`Hợp lệ`, `Chờ duyệt`, `Bị từ chối`).
         - Mã tên file monospace, dung lượng, ngày cập nhật, ghi chú xác nhận kỹ thuật.
         - Nút hành động: `Xem` (mở preview file) và icon `Tải lên / Thay thế tệp`.
     - **Hộp cảnh báo từ chối (Rejection reason callout)**:
       - Nếu mục bị từ chối: Hộp nền hồng phấn `bg-rose-50`, viền `border-rose-200`, hiển thị rõ `Nguyên nhân từ chối:` và nội dung ghi chú từ chối của cấp duyệt.
4. **Chân trang & Thanh hành động (`.eiw-foot`)**:
   - Cảnh báo trạng thái:
     - Nếu còn mục thiếu/lỗi: Chấm cam nhấp nháy `animate-pulse` + thông báo lý do (`gate?.blockers`).
     - Nếu hoàn thành: Icon xanh lá xác nhận tất cả giấy tờ đã hợp lệ.
   - Nút hành động chính:
     - Nút `Rút lời nhờ` / `Nhờ hỗ trợ`.
     - Thanh `NodeActionBar` (nút `Nộp nghiệm thu K01`, chuyển tiếp...) với kiểu dáng nút bo góc `12px`, màu xanh chủ đạo đậm nét.

---

## 3. Kế hoạch Kiểm thử & Xác minh
1. **Kiểm thử tự động**:
   - Chạy toàn bộ test suites hiện có: `npm test` trong `dev/frontend`.
   - Xác nhận 100% các file test liên quan (`EmployeeItemWorkspace.test.jsx`, `NodeOutputList.test.jsx`, `NodeChain.test.jsx`, `EiwAttachmentsCard.test.jsx`, `EiwMoneyBreakdown.test.jsx`, `EiwNodeHeader.test.jsx`, `EiwTaskDescription.test.jsx`, `EiwTimingClock.test.jsx`, `NodeBusinessSlot.test.jsx`) đều PASS.
2. **Kiểm tra trực quan**:
   - Đối chiếu từng chi tiết trực quan với Hình 2 (màu sắc, khoảng cách, icon, font chữ, hiệu ứng hover).
