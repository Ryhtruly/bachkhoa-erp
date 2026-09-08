# Cấu trúc Module Thu Chi (Finance)

Module Thu Chi ban đầu được viết gộp toàn bộ trong file `src/pages/Thuchi.jsx`. Để dễ bảo trì, mở rộng và debug, hệ thống đã được tách nhỏ thành các file và thư mục chuyên biệt bên trong `src/components/finance/`. 

Dưới đây là tổng hợp vai trò của từng file để bạn dễ dàng tra cứu và sửa lỗi.

## 1. File Gốc (Entry Point)
- **`src/pages/Thuchi.jsx`**: Hiện tại đóng vai trò là "lớp vỏ" chính. File này chỉ dùng để quản lý layout bọc ngoài và trạng thái chuyển đổi giữa các Tab (Giao dịch, Tổng quan, Cài đặt).

## 2. Thư mục `screens/` (Các màn hình chính)
Đại diện cho nội dung của từng Tab trên giao diện:
- **`CashflowScreen.jsx`**: Màn hình **Quản lý Giao Dịch**. Chứa danh sách thu chi, bộ lọc, xử lý tìm kiếm, phân trang và xuất Excel.
- **`MonthlyDashboardScreen.jsx`**: Màn hình **Tổng Quan Tháng** (Bảng điều khiển). Hiển thị số liệu tổng kết, bảng thống kê và biểu đồ phân tích Hạng mục/Phòng ban.
- **`SettingsScreen.jsx`**: Màn hình **Cài Đặt**. Chứa danh sách để thêm/sửa/xóa các Hạng mục thu chi và Phòng ban/Dự án.
- **`PrintVoucherScreen.jsx`**: Giao diện **In Phiếu**. Chỉ chứa code định dạng layout giấy A5 để in phiếu thu/chi.

## 3. Thư mục `modals/` (Các Popup / Form)
- **`CashflowModal.jsx`**: Form nhập liệu dùng chung cho chức năng **Thêm mới** và **Cập nhật** giao dịch. Nếu cần thêm/bớt trường dữ liệu (ví dụ: thêm ô ghi chú mới), bạn sửa file này.
- **`CashflowDetailModal.jsx`**: Popup **Xem chi tiết** một giao dịch (chỉ đọc) khi người dùng bấm vào dòng dữ liệu.
- **`PrintVoucherModal.jsx`**: Popup hiển thị bản xem trước của phiếu in (chứa nút "In phiếu").

## 4. Thư mục `ui/` (Các UI Component độc lập)
Chứa các thành phần giao diện "ngu" (dumb components) có thể tái sử dụng:
- **`index.js`**: File gom các export để code chỗ khác có thể import ngắn gọn: `import { Modal, Dropdown } from '../ui'`.
- **`DataTable.jsx`**: Component cấu trúc Bảng.
- **`Modal.jsx`**: Khung sườn nền đen, viền trắng cho các popup.
- **`FormGrid.jsx` & `FormRow.jsx`**: Khung bố cục lưới cho Form nhập liệu.
- **`Dropdown.jsx`, `Badge.jsx`, `SubTabs.jsx`, `FilterBar.jsx`**: Các ô select, thẻ tag màu, thanh công cụ.

## 5. Các File Tiện Ích & Dùng Chung
- **`utils.js`**: Chứa toàn bộ các hàm xử lý logic tách biệt khỏi giao diện. Ví dụ: `fmt` (định dạng tiền tệ), `getLocalISOTime` (chỉnh giờ địa phương), `docSoTiengViet` (đọc số thành chữ).
- **`financeConstants.jsx`**: Nơi lưu các hằng số cấu hình. Chứa đường dẫn `API` và biến `CF_COLS` (cấu hình các cột khi xuất file Excel).
- **`SharedFinanceUI.jsx`**: Các cụm giao diện được chia sẻ chung giữa các màn hình (như tiêu đề `FinanceScreenHeader`, thẻ số dư `BalanceCard`).

---
💡 **Mẹo khi debug (sửa lỗi):**
- **Lỗi giao diện chung hoặc không chuyển tab được?** -> Kiểm tra `Thuchi.jsx`.
- **Lỗi hiển thị danh sách, phân trang, filter?** -> Kiểm tra `CashflowScreen.jsx`.
- **Lỗi ở khung popup điền thông tin thu chi?** -> Kiểm tra `CashflowModal.jsx`.
- **Lỗi khi tính toán số tiền, sai ngày tháng?** -> Kiểm tra `utils.js`.
