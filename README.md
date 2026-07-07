# Bách Khoa ERP System

Hệ thống Quản trị Doanh nghiệp (ERP) thiết kế chuyên biệt cho Công ty Đo đạc Bách Khoa.
Dự án được xây dựng với kiến trúc API hiện đại, giao diện React tương tác thời gian thực và tự động hóa quy trình nghiệp vụ (CRM, Kế toán, Sản xuất, AI).

## Công nghệ sử dụng
- **Backend:** FastAPI (Python), SQLAlchemy, PostgreSQL
- **Frontend:** React (Vite), Lucide Icons, CSS Vanilla

## Chạy toàn bộ hệ thống bằng Docker

### 1. Kiến trúc khi chạy Docker

```text
Trình duyệt
    │
    ├── http://127.0.0.1:3000
    ▼
Frontend (Nginx + React)
    │
    ├── /api/* ───────────► Backend FastAPI:8080 ───► Supabase PostgreSQL
    ├── /static/* ────────► Backend FastAPI:8080
    └── React/CSS/JS
                              │
                              └──► Redis:6379
                                   (cache Hợp đồng & Công nợ)
```

Supabase PostgreSQL là nguồn dữ liệu chuẩn. Redis chỉ giữ read model/cache để
tăng tốc màn Hợp đồng & Công nợ.

### 2. Các file Docker và tác dụng

| File | Tác dụng |
|---|---|
| `docker-compose.yml` | Khởi tạo và kết nối `frontend`, `backend`, `redis-contracts` cùng volume lưu hợp đồng |
| `dev/backend/Dockerfile` | Tạo image Python 3.11, cài `requirements.txt` và chạy FastAPI bằng Uvicorn |
| `dev/backend/.dockerignore` | Không đưa `.env`, `venv`, cache Python và database cục bộ vào backend image |
| `dev/frontend/Dockerfile` | Dùng Node để build React, sau đó dùng Nginx phục vụ bản production |
| `dev/frontend/nginx.conf` | Phục vụ React và reverse proxy `/api`, `/static`, `/docs` sang backend |
| `dev/frontend/.dockerignore` | Không đưa `node_modules`, `dist`, `.env` và log vào frontend image |
| `docker-compose.dev.yml` | Chạy môi trường lập trình với backend auto reload và frontend hot reload |
| `dev/frontend/Dockerfile.dev` | Tạo frontend development image chạy Vite thay vì Nginx |
| `docker-compose.redis.yml` | Chỉ chạy Redis riêng khi phát triển thủ công; không chạy đồng thời với compose chính |

### 3. Các service trong `docker-compose.yml`

| Service | Chức năng | Cổng trên máy |
|---|---|---|
| `frontend` | Giao diện React production và Nginx reverse proxy | `3000` |
| `backend` | FastAPI, nghiệp vụ ERP và kết nối Supabase | `8080` |
| `redis-contracts` | Cache/read model Hợp đồng & Công nợ | `6379` |

Compose đợi Redis khỏe trước khi chạy backend, sau đó đợi backend khỏe trước
khi chạy frontend.

### 4. Yêu cầu trước khi chạy

- Cài và mở Docker Desktop.
- Clone repository về máy.
- Các cổng `3000`, `8080`, `6379` chưa bị chương trình khác sử dụng.
- Có thông tin kết nối Supabase PostgreSQL.

### 5. Chuẩn bị biến môi trường

Tại thư mục gốc repository:

```bash
cp dev/backend/.env.example dev/backend/.env
```

Điền thông tin thật vào `dev/backend/.env`, tối thiểu:

```env
PG_HOST=db.your-project-ref.supabase.co
PG_PORT=5432
PG_DATABASE=postgres
PG_USER=postgres
PG_PASSWORD=your_database_password

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SECRET_KEY=your_secret_key
```

Compose tự ghi đè `REDIS_URL` thành:

```env
REDIS_URL=redis://redis-contracts:6379/0
```

Không commit `dev/backend/.env` lên GitHub vì file chứa mật khẩu và secret key.
Người khác clone dự án phải tự tạo file `.env` của họ.

### 6. Khởi chạy lần đầu

Nếu trước đó đã chạy Redis bằng file riêng:

```bash
docker compose -f docker-compose.redis.yml down
```

Build image và chạy nền toàn bộ hệ thống:

```bash
docker compose up --build -d
```

Kiểm tra trạng thái:

```bash
docker compose ps
```

Kết quả đúng là ba service đều ở trạng thái `Up`; backend và Redis có trạng
thái `healthy`.

### 7. URL sau khi chạy

| Nội dung | URL |
|---|---|
| Giao diện ERP | http://127.0.0.1:3000 |
| Backend FastAPI | http://127.0.0.1:8080 |
| Swagger API qua Nginx | http://127.0.0.1:3000/docs |
| Swagger API trực tiếp | http://127.0.0.1:8080/docs |
| OpenAPI JSON | http://127.0.0.1:3000/openapi.json |

Redis không có giao diện web. Redis lắng nghe tại `127.0.0.1:6379`.

### 8. Các lệnh vận hành thường dùng

Chạy các container đã build:

```bash
docker compose up -d
```

Build lại sau khi thay đổi code hoặc dependency:

```bash
docker compose up --build -d
```

Xem trạng thái:

```bash
docker compose ps
```

Xem log backend:

```bash
docker compose logs -f backend
```

Xem log frontend/Nginx:

```bash
docker compose logs -f frontend
```

Xem log Redis:

```bash
docker compose logs -f redis-contracts
```

Khởi động lại một service:

```bash
docker compose restart backend
```

Dừng và xóa container/network, vẫn giữ file hợp đồng trong volume:

```bash
docker compose down
```

Dừng và xóa cả volume chứa file hợp đồng:

```bash
docker compose down -v
```

Chỉ dùng `down -v` khi chắc chắn không cần các file hợp đồng đã sinh.

### 9. Lưu trữ dữ liệu

- Dữ liệu nghiệp vụ nằm trên Supabase PostgreSQL, không nằm trong container.
- File hợp đồng sinh ra được giữ trong Docker volume `contract-files`.
- Redis tắt persistence vì chỉ là cache; khi Redis khởi động lại, backend sẽ
  nạp lại read model từ Supabase.
- `docker compose down` không xóa volume.
- `docker compose down -v` xóa volume `contract-files`.

### 10. Xử lý lỗi thường gặp

#### Cổng đã được sử dụng

Ví dụ lỗi:

```text
bind: address already in use
```

Tắt backend/frontend/Redis đang chạy thủ công hoặc đổi cổng bên trái trong
`docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:8081:8080"
```

#### Backend không khỏe

```bash
docker compose logs --tail=200 backend
```

Kiểm tra lại `PG_HOST`, `PG_USER`, `PG_PASSWORD` và kết nối internet.

#### Frontend trả lỗi 502

```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose restart frontend
```

Lỗi này thường xảy ra khi backend chưa khởi động được hoặc Nginx chưa kết nối
được tới service `backend`.

#### Code mới chưa xuất hiện

Source code được đóng vào Docker image. Sau khi sửa code cần build lại:

```bash
docker compose up --build -d
```

### 11. Quy trình cho người nhận code từ GitHub

```bash
git clone <repository-url>
cd bachkhoa-erp
cp dev/backend/.env.example dev/backend/.env
# Điền thông tin Supabase vào dev/backend/.env
docker compose up --build -d
```

Sau đó mở http://127.0.0.1:3000.

## Phát triển bằng Docker với hot reload

Môi trường development dùng `docker-compose.dev.yml` và có hành vi khác bản
production:

| Thành phần | Development |
|---|---|
| Frontend | Vite dev server, hot reload tại `http://127.0.0.1:3000` |
| Backend | Uvicorn `--reload` tại `http://127.0.0.1:8080` |
| Source code | Mount trực tiếp từ máy vào container |
| Redis | Chạy trong Docker tại `127.0.0.1:6379` |

Khi sửa và lưu code frontend hoặc backend, container tự nhận thay đổi. Không
cần build lại image sau mỗi lần sửa.

### 1. Dừng bản production trước

Hai môi trường sử dụng chung cổng `8080` và `6379`, vì vậy không chạy đồng thời:

```bash
docker compose down
```

Nếu Redis riêng đang chạy:

```bash
docker compose -f docker-compose.redis.yml down
```

### 2. Khởi chạy development

```bash
docker compose -f docker-compose.dev.yml up --build
```

Không dùng `-d` nếu muốn xem log và thông báo reload trực tiếp trong terminal.

Mở:

- Giao diện development: http://127.0.0.1:3000
- Backend FastAPI: http://127.0.0.1:8080
- Swagger API: http://127.0.0.1:8080/docs

### 3. Chạy development dưới nền

```bash
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f
```

### 4. Sau khi thay đổi dependency

Nếu sửa `requirements.txt`, `package.json` hoặc `package-lock.json`, cần build
lại image:

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Nếu frontend báo thiếu package sau khi đổi dependency, tạo lại volume
`node_modules`:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build
```

Lệnh `down -v` của compose development chỉ xóa volume `frontend-node-modules`;
source code vẫn nằm trên máy.

### 5. Dừng development

```bash
docker compose -f docker-compose.dev.yml down
```

## Chạy thủ công để phát triển

### 1. Chạy Redis cho Hợp đồng & Công nợ

Redis chỉ là read model tăng tốc cho màn Hợp đồng & Công nợ. Supabase vẫn là nguồn dữ liệu chuẩn.

```bash
docker compose -f docker-compose.redis.yml up -d
docker compose -f docker-compose.redis.yml ps
docker exec bachkhoa-redis-contracts redis-cli ping
```

Kết quả kiểm tra phải là `PONG`.

### 2. Cài đặt Backend
1. Cài đặt Python 3.11
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
