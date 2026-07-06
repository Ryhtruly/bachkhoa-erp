# Bách Khoa ERP System

Hệ thống Quản trị Doanh nghiệp (ERP) thiết kế chuyên biệt cho Công ty Đo đạc Bách Khoa.
Dự án được xây dựng với kiến trúc API hiện đại, giao diện React tương tác thời gian thực và tự động hóa quy trình nghiệp vụ (CRM, Kế toán, Sản xuất, AI).

## Công nghệ sử dụng
- **Backend:** FastAPI (Python), SQLAlchemy, PostgreSQL
- **Frontend:** React (Vite), Lucide Icons, CSS Vanilla

## Hướng dẫn Cài đặt

### 1. Chạy Redis cho Hợp đồng & Công nợ

Redis chỉ là read model tăng tốc cho màn Hợp đồng & Công nợ. Supabase vẫn là nguồn dữ liệu chuẩn.

```bash
docker compose -f docker-compose.redis.yml up -d
docker compose -f docker-compose.redis.yml ps
docker exec bachkhoa-redis-contracts redis-cli ping
```

Kết quả kiểm tra phải là `PONG`.

### 2. Cài đặt Backend
1. Cài đặt Python 3.10+
2. Mở terminal, di chuyển vào thư mục backend: `cd dev/backend`
3. Cài đặt các thư viện cần thiết: `pip install -r requirements.txt`
4. Copy file cấu hình: `cp .env.example .env` và điền cấu hình Database (PostgreSQL) của bạn vào file `.env`.
5. Chạy server:
   ```bash
   uvicorn src.index:app --reload --port 8080
   ```
   *(Khi chạy lệnh này, hệ thống sẽ tự động tạo bảng trong Database)*

Khi backend khởi động, toàn bộ read model Hợp đồng & Công nợ được nạp từ Supabase vào Redis. Kiểm tra:

```bash
curl http://127.0.0.1:8080/api/hopdong/cache/status
curl -I http://127.0.0.1:8080/api/hopdong/
```

Header `X-Contract-Read-Source: redis` xác nhận API đang đọc Redis. Nếu Redis dừng, API tự fallback về Supabase.

### 3. Tạo Dữ liệu mẫu (Tùy chọn)
Nếu muốn có sẵn dữ liệu test (Khách hàng, Hợp đồng, Hồ sơ), hãy chạy lệnh sau ở thư mục backend:
```bash
python scripts/seed_fake_data.py
```

### 4. Cài đặt Frontend
1. Cài đặt Node.js
2. Mở một terminal khác, di chuyển vào thư mục frontend: `cd dev/frontend`
3. Cài đặt các package: `npm install`
4. Khởi chạy giao diện web:
   ```bash
   npm run dev
   ```
5. Mở trình duyệt và truy cập vào đường link hiển thị trên terminal (thường là `http://localhost:5173`).
