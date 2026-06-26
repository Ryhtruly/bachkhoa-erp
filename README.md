# Bách Khoa ERP System

Hệ thống Quản trị Doanh nghiệp (ERP) thiết kế chuyên biệt cho Công ty Đo đạc Bách Khoa.
Dự án được xây dựng với kiến trúc API hiện đại, giao diện React tương tác thời gian thực và tự động hóa quy trình nghiệp vụ (CRM, Kế toán, Sản xuất, AI).

## Công nghệ sử dụng
- **Backend:** FastAPI (Python), SQLAlchemy, PostgreSQL
- **Frontend:** React (Vite), Lucide Icons, CSS Vanilla

## Hướng dẫn Cài đặt

### 1. Cài đặt Backend
1. Cài đặt Python 3.10+
2. Mở terminal, di chuyển vào thư mục backend: `cd dev/backend`
3. Cài đặt các thư viện cần thiết: `pip install -r requirements.txt`
4. Copy file cấu hình: `cp .env.example .env` và điền cấu hình Database (PostgreSQL) của bạn vào file `.env`.
5. Chạy server:
   ```bash
   uvicorn src.index:app --reload --port 8000
   ```
   *(Khi chạy lệnh này, hệ thống sẽ tự động tạo bảng trong Database)*

### 2. Tạo Dữ liệu mẫu (Tùy chọn)
Nếu muốn có sẵn dữ liệu test (Khách hàng, Hợp đồng, Hồ sơ), hãy chạy lệnh sau ở thư mục backend:
```bash
python scripts/seed_fake_data.py
```

### 3. Cài đặt Frontend
1. Cài đặt Node.js
2. Mở một terminal khác, di chuyển vào thư mục frontend: `cd dev/frontend`
3. Cài đặt các package: `npm install`
4. Khởi chạy giao diện web:
   ```bash
   npm run dev
   ```
5. Mở trình duyệt và truy cập vào đường link hiển thị trên terminal (thường là `http://localhost:5173`).
