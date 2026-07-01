# 📊 Tổng hợp Chức năng Tài chính - Thu Chi (Finance)

Phân hệ Tài chính (Finance) quản lý toàn bộ dòng tiền, công nợ, tạm ứng, lương thưởng và báo cáo lợi nhuận của hệ thống. Dưới đây là chi tiết các chức năng đã được xây dựng trong hệ thống Bách Khoa ERP:

## 1. 💵 Quản Lý Dòng Tiền (Cashflow)
- **Nhật Ký Thu Chi:** Xem toàn bộ lịch sử giao dịch dòng tiền (Thu/Chi). 
- **Quỹ Tiền Mặt & Quỹ Ngân Hàng:** Phân tách và hiển thị số dư quỹ theo thời gian thực (realtime) dựa trên phương thức thanh toán (Tiền mặt / Chuyển khoản).
- **Tính toán Tự động:** Tự động tính toán Tổng Thu, Tổng Chi và Số dư cuối.
- **Tạo & Cập nhật Phiếu:** 
  - Lập Phiếu Thu / Phiếu Chi với nhiều hạng mục chi tiết.
  - Tự động điền thông tin (Auto-mapping) người nhận/người duyệt/phòng ban theo hạng mục (ví dụ: *Chi thụ lý bản vẽ*, *Văn phòng phẩm*...).
  - Có cảnh báo khi xuất tiền mặt vượt số dư, hoặc khi chọn hạng mục nhạy cảm (bắt buộc gắn hợp đồng/dự án như *Chi thụ lý bản vẽ*).
  - Cập nhật, chỉnh sửa phiếu và gắn/đối chiếu phiếu với mã Hợp đồng/Hồ sơ.
- **Hủy phiếu an toàn (Anti Hard-Delete):** Tuyệt đối không xóa dữ liệu. Khi hủy phiếu, hệ thống sẽ chuyển trạng thái sang "Đã hủy", tự sinh phiếu ngược chiều (Reverse Entry) để cân bằng quỹ, và lưu vết lý do/người hủy. Phiếu nằm trong kỳ đã chốt sổ sẽ bị khóa cứng.

## 2. 🧾 Chứng Từ & Công Nợ (Invoices & Debt)
- **Hợp Đồng & Hóa Đơn:** Quản lý danh sách hợp đồng xây dựng/bất động sản, theo dõi tổng giá trị, số tiền đã thu và số tiền nợ còn lại.
- **Công Nợ Phải Thu:**
  - Theo dõi chi tiết công nợ khách hàng theo từng hợp đồng (còn nợ bao nhiêu, đã thu đủ chưa).
  - Đánh dấu và cảnh báo trực quan các khoản nợ **quá hạn** (Overdue).
- **Công Nợ Phải Trả:** Thống kê tổng hợp các khoản chi chuyển khoản chưa được gắn vào hợp đồng (theo dõi dòng tiền trả cho Nhà cung cấp / Nhà thầu phụ).

## 3. ⏳ Chi Phí Tạm Ứng (Advances)
- **Đề Xuất Tạm Ứng:**
  - Lập phiếu tạm ứng tiền mặt cho kỹ sư/chỉ huy trưởng trước khi ra công trường.
  - Hiển thị tổng số tiền tạm ứng đã chi ra nhưng chưa được quyết toán hoàn lại.
- **Quyết Toán Hoàn Ứng:**
  - Đối chiếu số tiền đã tạm ứng với chi phí mua sắm/thi công thực tế (từ hóa đơn).
  - **Tự động hóa thông minh:** Hệ thống tự động sinh ra **Phiếu Thu** (nếu nhân viên hoàn lại tiền thừa) hoặc **Phiếu Chi** (nếu công ty chi bù tiền thiếu) ngay sau khi chốt quyết toán.

## 4. 🖨️ Chứng Từ Thu/Chi (Print Vouchers)
- Cung cấp giao diện chuyên dụng để lập, xem và in ấn các chứng từ: **Phiếu Thu, Phiếu Chi, Phiếu Tạm Ứng, Phiếu Hoàn Ứng**.
- Định dạng in chuẩn biểu mẫu kế toán, đầy đủ chữ ký (Người lập, Kế toán, Người duyệt, Người nhận/nộp).
- Tích hợp hàm **đọc số tiền thành chữ tiếng Việt** chuẩn xác.

## 5. 📈 Báo Cáo & Lợi Nhuận (Analytics Dashboard)
- **Dashboard Tổng Quan:**
  - Hiển thị nhanh 3 chỉ số sinh tử: Số dư Quỹ Tiền Mặt, Số dư Ngân Hàng, và Tổng Tạm Ứng Chưa Hoàn.
  - Biểu đồ xu hướng (Bar Chart) trực quan đối chiếu Tổng Thu và Tổng Chi theo từng tháng.
- **Lợi Nhuận Dự Án (Profit):**
  - Thống kê kết quả kinh doanh chi tiết theo từng Hợp đồng/Dự án.
  - Công thức chuẩn: `Lợi nhuận = Tổng Thu - Tổng Chi - Lương Khoán`.
  - Trực quan hóa Biên lợi nhuận (Profit Margin %) bằng thanh tiến trình (progress bar), phân định màu sắc rõ ràng (xanh lãi, đỏ lỗ).

## 6. 🛠️ Backend API & Kiến Trúc Dữ Liệu (Finance CRUD & Routes)
Toàn bộ logic nghiệp vụ (business logic) xử lý luồng tiền được tách biệt và xử lý tập trung tại Backend (Sử dụng FastAPI & SQLAlchemy), nhằm đảm bảo tính toàn vẹn dữ liệu, chống thất thoát và tối ưu hiệu suất.

### A. Core Finance Services (`crud_finance.py`)
File chứa các hàm thao tác DB nền tảng, thực thi các quy tắc kế toán nghiêm ngặt:
- **`_check_closed_period` (Khóa kỳ kế toán):** Truy xuất mốc chốt sổ (`FundOpeningBalance`) mới nhất. Bất kỳ lệnh Thêm/Sửa/Hủy nào có mốc thời gian nằm trong kỳ đã đóng đều bị Exception 400 chặn đứng.
- **`get_running_balance` (Tính số dư chốt chặn):** Thuật toán tối ưu tính toán số dư theo thời gian thực. Bằng cách tìm mốc chốt quỹ (`FundOpeningBalance`) gần nhất, sau đó chỉ cộng trừ các giao dịch phát sinh *sau* mốc đó. (Tránh phải query toàn bộ lịch sử từ đầu).
- **`_check_cash` (Bảo vệ âm quỹ):** Hàm kiểm tra chặn (guard) chạy trước mỗi lệnh chi Tiền mặt. Nếu số tiền xuất quỹ lớn hơn số dư tồn thực tế, hệ thống sẽ throw Exception chặn giao dịch để chống âm quỹ tiền mặt.
- **`_sync_receivables` (Đồng bộ Công nợ & Due Date):** Sử dụng trigger logic ngầm định. Cập nhật giảm `remaining_amount` và tăng `paid_amount` trong `Receivable`. Lần đầu ghi nợ sẽ tự động tính hạn chót thanh toán (`due_date` = ngày ký + 30 ngày).
- **`crud_create_cashflow` (Khởi tạo & Toàn vẹn dữ liệu):** 
  - **Auto-mapping chặt chẽ:** Phân loại tự động chi phí vận hành và dự án. Bắt buộc user tự chọn Hợp đồng/Hồ sơ nếu có sự nhập nhằng (không tự động gán bừa).
  - **Chặn thu lố:** Quét công nợ còn lại (remaining_amount) hoặc tổng hợp đồng, nếu lập phiếu thu vượt quá số này -> ném lỗi ngay.
  - **Atomic Transaction:** Toàn bộ khối code đặt trong `try...except...db.rollback()`. Nếu có 1 tiến trình nhỏ thất bại, toàn bộ rác dữ liệu sẽ bị rollback không tì vết.
- **`crud_update_cashflow` (Sửa đổi dòng tiền):** Xử lý luồng sửa đổi phiếu. Nếu đổi số tiền hoặc phương thức, rollback số dư cũ và apply số dư mới. Wrap trong Atomic Transaction và có chốt chặn kỳ kế toán cho cả ngày cũ lẫn ngày mới.
- **`crud_void_cashflow` (Hủy phiếu & Reverse Entry):**
  - Chống xóa cứng (No hard-delete). Phiếu bị đánh dấu `Đã hủy`, cập nhật `voided_reason` và `voided_at`.
  - Tự động đảo ngược (sync backward) công nợ `Receivable` nếu hủy Phiếu Thu.
  - Sinh một phiếu **Reverse Entry** tự động (Thu -> Chi, hoặc Chi -> Thu) mang nhãn "Hoàn tác (Hủy phiếu)" để điều chỉnh chuẩn số dư cuối.
- **`_voucher_id` (Cấp mã chứng từ):** Tự động sinh mã chứng từ tuần tự theo quy chuẩn kế toán `[PT/PC]-[MM]/[YYYY]-[001]` và đảm bảo tính Unique (Không trùng lặp).

### B. RESTful API Endpoints (`routes_finance.py`)
Mở các endpoints cho giao diện Web/App tương tác, chia thành các nhóm chính:
- **Nhóm Dòng Tiền (Cashflow):** 
  - `GET /api/finance/cashflow...`: Lấy dữ liệu dòng tiền Tổng hợp, Tiền mặt, Ngân hàng, hỗ trợ bộ lọc đa chiều (Tháng, Phương thức, Dự án).
  - `POST /api/finance/cashflow/{transaction_id}/void`: Endpoint cực kỳ quan trọng cho phép thực thi thao tác Hủy Phiếu và sinh phiếu ngược (Reverse Entry) an toàn.
  - `GET /api/finance/cashflow/by-contract/{id}` hoặc `by-project/{id}`: Trích xuất lịch sử dòng tiền cụ thể cho từng Hợp đồng hoặc Dự án để tính lợi nhuận độc lập.
- **Nhóm Công Nợ (Receivables & Payables):** 
  - `GET /api/finance/contracts` & `/receivables`: Trả về danh sách nợ phải thu, tự động gắn cờ `overdue` (Quá hạn) nếu trễ thời hạn thanh toán.
  - `GET /api/finance/payables`: Thống kê các khoản công nợ dự kiến phải trả (Các phiếu chi chưa gắn hợp đồng).
- **Nhóm Tạm Ứng (Advances):** 
  - `POST /api/finance/advance/clear`: Thuật toán quyết toán hoàn ứng đa luồng, tự động tính toán khoản chênh lệch (diff). Nếu nhân viên tiêu lố -> đẻ 1 phiếu Chi bù; Nếu nhân viên thừa tiền -> đẻ 1 phiếu Thu hoàn tiền. Cả 2 phiếu đều tự động link reference tới phiếu Tạm ứng gốc.
- **Nhóm Chốt Quỹ & Thiết Lập (Settings & Balances):** 
  - `POST /api/finance/fund-balances/close`: Lệnh chốt quỹ vào cuối kỳ. Tính chênh lệch số dư thực tế đếm tay và số dư hệ thống, bắt buộc lưu giải trình, và thiết lập mốc Số dư đầu kỳ (Opening Balance) mới.
- **Nhóm Báo Cáo Thống Kê (Analytics):**
  - `GET /api/finance/monthly-dashboard`: Trả về khối liệu Pivot tổng hợp doanh thu/chi phí theo từng Hạng mục và Phòng ban để vẽ biểu đồ Bar Chart.
  - `GET /api/finance/summary`: Tính 3 chỉ số sinh tử (Cash, Bank, Tạm ứng ròng) và lợi nhuận của toàn bộ Hợp đồng trên dashboard tổng.
