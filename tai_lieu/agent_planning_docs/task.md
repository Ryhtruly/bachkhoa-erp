# Danh Sách Nhiệm Vụ: Triển Khai OpenClaw ERP Bách Khoa

- [x] Cài đặt các thư viện Python cần thiết (`pandas`, `openpyxl`, `fastapi`, `uvicorn`, `python-docx`)
- [x] Tạo thư mục ứng dụng `app/` và thư mục con `app/static/`, `app/templates/`, `backups/`
- [x] Tạo tệp mẫu hợp đồng cơ bản `app/templates/mau_hop_dong.docx`
- [x] Xây dựng mô-đun thao tác Excel `app/excel_db.py` (CRUD cho Hồ sơ, Tác nghiệp, Hợp đồng, Thu chi, Lương khoán)
- [x] Xây dựng mô-đun xuất hợp đồng `.docx` từ template `app/doc_generator.py`
- [x] Xây dựng API Server với FastAPI `app/main.py`
- [x] Thiết kế giao diện Frontend HTML5 `app/static/index.html` (SPA với cấu trúc tab hiện đại)
- [x] Thiết kế phong cách CSS Glassmorphism Premium `app/static/styles.css` (Dark Mode, chuyển động mượt mà)
- [x] Lập trình logic điều khiển Frontend `app/static/main.js` (Call API, hiển thị biểu đồ, thao tác bảng biểu)
- [x] Chạy thử nghiệm hệ thống và kiểm tra khả năng ghi nhận dữ liệu vào file Excel gốc
- [x] Sửa lỗi typo trong main.js (Loại_dịch_ vụ → Loại_dịch_vụ)
- [x] Sửa lỗi đọc sheet THIET_LAP (column alignment với None headers)
- [x] Kiểm thử toàn bộ API endpoints (Dashboard, Hồ sơ, Hợp đồng, Thu chi, Lương, Cấu hình)
- [x] Kiểm thử tạo hợp đồng .docx tự động
- [x] Verify dữ liệu ghi vào file Excel Master thành công
