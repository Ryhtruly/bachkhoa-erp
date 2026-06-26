# Kế Hoạch Triển Khai Hệ Thống OpenClaw ERP - Bách Khoa

Hệ thống sẽ được xây dựng dưới dạng một **Ứng dụng Web cục bộ (Local Web Application)** chạy trên máy tính của người dùng. Hệ thống sẽ sử dụng tệp Excel **`BACHKHOA_FULL_AUTO_2026_migrated.xlsx`** làm cơ sở dữ liệu chính, đảm bảo dữ liệu luôn được lưu trữ an toàn và trực quan trong OneDrive của bạn, đồng thời cung cấp giao diện Web Premium vô cùng hiện đại để nhân viên và Giám đốc thao tác.

---

## User Review Required

> [!IMPORTANT]
> **Về việc Lưu trữ Dữ liệu**:
> - Hệ thống sẽ đọc và ghi trực tiếp vào tệp `BACHKHOA_FULL_AUTO_2026_migrated.xlsx`. Khi bạn cập nhật trên Web Dashboard, dữ liệu trong file Excel cũng sẽ thay đổi theo thời gian thực (real-time).
> - Để đảm bảo an toàn dữ liệu, mỗi khi hệ thống khởi động hoặc thực hiện chỉnh sửa lớn, một bản sao lưu (backup) của file Excel sẽ được tạo tự động trong thư mục `backups/`.

> [!WARNING]
> **Thư viện yêu cầu cài đặt**:
> Hệ thống sẽ cần cài đặt thêm một số thư viện Python bổ sung: `fastapi`, `uvicorn`, `pandas`, `openpyxl`, `python-docx`, `jinja2`.

---

## Open Questions

> [!IMPORTANT]
> 1. **Về Giao diện ứng dụng**: Bạn muốn sử dụng giao diện web thiết kế tùy chỉnh bằng **HTML/JS kết hợp CSS Glassmorphism** (cực kỳ hiện đại, trực quan, hỗ trợ tối đa việc wowing giao diện) hay bạn thích giao diện nhanh bằng **Streamlit** (như các dự án dashboard trước đây của bạn)?
> 2. **Tích hợp thông báo**: Bạn có muốn cấu hình gửi thông báo thử nghiệm qua Telegram/Zalo OA khi có hồ sơ mới hoặc hồ sơ bị trễ hạn ngay trong phiên bản này không? Nếu có, bạn có sẵn mã Token Telegram Bot chưa?
> 3. **Mẫu hợp đồng**: Bạn có mẫu hợp đồng `.docx` nào sẵn không, hay để tôi tạo một mẫu hợp đồng chuẩn dựa trên dịch vụ đo đạc để hệ thống tự động điền thông tin?

---

## Proposed Changes

Tôi đề xuất cấu trúc dự án trong thư mục `c:\Users\vanqu\OneDrive\Máy tính\BachKhoa` như sau:

```
c:\Users\vanqu\OneDrive\Máy tính\BachKhoa/
├── app/
│   ├── main.py                 # Backend FastAPI (API xử lý dữ liệu Excel, xuất file)
│   ├── excel_db.py             # Lớp kết nối & thao tác CRUD với file Excel Master
│   ├── doc_generator.py        # Logic tạo hợp đồng Docx/PDF từ template
│   ├── templates/              # Thư mục chứa template Hợp đồng (.docx)
│   └── static/                 # Giao diện Frontend Web
│       ├── index.html          # Trang chủ Dashboard điều hành
│       ├── styles.css          # CSS Glassmorphism & Premium UI (Dark Mode)
│       └── main.js             # Logic gọi API backend & render UI động
├── backups/                    # Thư mục lưu trữ các bản sao lưu tự động Excel
└── requirements.txt            # Danh sách thư viện Python cần cài đặt
```

### [Backend Engine]

#### [NEW] [main.py](file:///c:/Users/vanqu/OneDrive/Máy tính/BachKhoa/app/main.py)
- Khởi tạo FastAPI app.
- Định nghĩa các endpoint API:
  - `GET /api/dashboard`: Lấy thông tin thống kê chung cho Giám đốc (số hồ sơ, công nợ, doanh thu, cảnh báo quá hạn).
  - `GET/POST/PUT /api/hoso`: Quản lý hồ sơ đo vẽ.
  - `GET/POST /api/hopdong`: Quản lý hợp đồng, công nợ.
  - `POST /api/hopdong/generate`: Tạo hợp đồng mẫu từ biểu mẫu.
  - `GET/POST /api/thuchi`: Quản lý nhật ký thu chi.
  - `GET /api/luong`: Tính lương khoán 3P cho nhân sự dựa trên trạng thái hoàn thành.

#### [NEW] [excel_db.py](file:///c:/Users/vanqu/OneDrive/Máy tính/BachKhoa/app/excel_db.py)
- Sử dụng thư viện `openpyxl` và `pandas` để đọc/ghi tệp `BACHKHOA_FULL_AUTO_2026_migrated.xlsx`.
- Cơ chế ghi an toàn (Safe write): Ghi vào file tạm trước khi thay thế file gốc và tự động sao lưu định kỳ.

#### [NEW] [doc_generator.py](file:///c:/Users/vanqu/OneDrive/Máy tính/BachKhoa/app/doc_generator.py)
- Sử dụng `python-docx` để đọc file mẫu hợp đồng, thay thế các placeholder (như `{{TEN_KHACH_HANG}}`, `{{GIA_TRI}}`) bằng thông tin nhập từ web.
- Xuất file `.docx` và link tải về trực tiếp.

### [Frontend Web UI]

#### [NEW] [index.html](file:///c:/Users/vanqu/OneDrive/Máy tính/BachKhoa/app/static/index.html)
- Giao diện Single Page Application (SPA) hiện đại.
- Menu điều hướng nhanh giữa các Tab: **Dashboard CEO**, **Quản lý Hồ sơ**, **Hợp đồng & Công nợ**, **Sổ quỹ Thu chi**, và **Tính Lương Khoán**.
- Form thêm hồ sơ mới, biểu mẫu điền hợp đồng.

#### [NEW] [styles.css](file:///c:/Users/vanqu/OneDrive/Máy tính/BachKhoa/app/static/styles.css)
- Sử dụng hệ màu sắc cao cấp (Deep Indigo, Dark Violet, Golden Accent).
- Thiết kế Glassmorphism (hiệu ứng kính mờ cho các thẻ Card).
- Thiết kế Responsive hoàn toàn (hiển thị đẹp mắt trên cả PC và Điện thoại của Giám đốc).
- Các hiệu ứng micro-animations khi rê chuột (hover) qua nút bấm hoặc bảng biểu.

#### [NEW] [main.js](file:///c:/Users/vanqu/OneDrive/Máy tính/BachKhoa/app/static/main.js)
- Xử lý tương tác giao diện người dùng.
- Fetch dữ liệu từ backend FastAPI và cập nhật giao diện bằng JS thuần mà không cần tải lại trang.

---

## Verification Plan

### Automated & Manual Tests
1. **Kiểm thử Đọc/Ghi Excel**: Chạy thử script Python để thêm 1 hồ sơ giả lập vào `DATABASE_HOSO`, kiểm tra xem file Excel có ghi nhận đúng dòng mới và các công thức Excel tự động chạy chính xác không.
2. **Kiểm thử API FastAPI**: Chạy server cục bộ bằng lệnh `uvicorn app.main:app --reload` và truy cập vào trang tài liệu tự động `/docs` của FastAPI để test các cổng API.
3. **Kiểm thử Giao diện Web**: Mở giao diện trên trình duyệt thông qua địa chỉ `http://localhost:8000`, thực hiện các hành động:
   - Tra cứu tìm kiếm hồ sơ.
   - Thêm hồ sơ đo đạc mới.
   - Tạo thử 1 hợp đồng PDF/Docx.
   - Xem bảng lương 3P được tính tự động của nhân viên Lê Văn Dựng.
