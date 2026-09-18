# Hướng dẫn deploy BachKhoa ERP Backend lên VPS

Tài liệu này mô tả cấu hình **backend-only**:

- Backend FastAPI chạy bằng Docker.
- Redis riêng của BachKhoa ERP chạy bằng Docker Compose.
- MinIO dùng instance đã có trên VPS, với bucket riêng `bachkhoa-erp-files`.
- Frontend deploy riêng, ví dụ trên Netlify.
- Push vào nhánh `main` sẽ kích hoạt GitHub Actions.

Không xóa hoặc sửa các container khác như `n8n`, `OpenClaw`, `dk_app` hoặc bucket MinIO của hệ thống khác.

## 0. Tóm tắt nhanh

Đây là luồng triển khai đã được kiểm chứng:

1. Frontend được build và host riêng, ví dụ trên Netlify.
2. Frontend gọi Backend qua `https://bendbk.wiai.vn`.
3. aaPanel/Nginx nhận HTTPS cho `bendbk.wiai.vn` rồi chuyển tiếp tới `127.0.0.1:8080`.
4. Backend chạy trong Docker, chỉ bind port `8080` trên chính VPS.
5. Backend dùng Redis riêng trong Compose, PostgreSQL của Supabase và MinIO có sẵn trên VPS.
6. GitHub Actions build image backend, push lên GHCR, SSH vào VPS qua port `2025`, rồi pull và khởi động lại backend.

| Mục đích | Giá trị | Ai sử dụng |
|---|---|---|
| Frontend public | URL Netlify của frontend | Người dùng trình duyệt |
| Backend public | `https://bendbk.wiai.vn` | Frontend và client API |
| Backend nội bộ | `http://127.0.0.1:8080` | Nginx trên VPS |
| SSH deploy | VPS port `2025` | GitHub Actions và quản trị viên |
| MinIO S3 API | VPS port `19000` | Backend |
| MinIO Console | VPS port `19001` | Quản trị viên |
| Redis | `redis-contracts:6379` | Backend trong Docker network |

Không dùng `localhost` trong URL frontend production. Trong trình duyệt, `localhost` là máy của người dùng, không phải VPS.

## 1. Kiến trúc

```text
Frontend (Netlify)
        |
        | HTTPS
        v
bendbk.wiai.vn
        |
        | reverse proxy
        v
127.0.0.1:8080
        |
        v
Docker backend
        |
        +--> redis-contracts:6379
        +--> MinIO VPS API:19000
        +--> Supabase PostgreSQL:6543
```

| Thành phần | Nơi chạy | Ghi chú |
|---|---|---|
| Backend | Docker Compose | App chạy cổng 8080 |
| Redis | Docker Compose | Service `redis-contracts`, không mở public port |
| MinIO | MinIO có sẵn trên VPS | Dùng bucket `bachkhoa-erp-files` |
| Database | Supabase | Dùng PostgreSQL pooler |
| Frontend | Netlify/host khác | Phải khai báo URL trong CORS |

### Ý nghĩa của từng thành phần

- **Frontend**: giao diện React/Vite, được build thành file tĩnh và deploy độc lập.
- **Nginx/aaPanel**: điểm vào public; xử lý HTTPS, certificate và reverse proxy.
- **Backend**: API FastAPI; không mở trực tiếp ra Internet vì chỉ bind vào `127.0.0.1`.
- **Redis**: cache/hàng đợi nội bộ cho project; không publish port ra Internet.
- **MinIO**: lưu file S3; dùng bucket riêng để không ảnh hưởng dữ liệu hệ thống khác.
- **Supabase PostgreSQL**: database production bên ngoài VPS.
- **GHCR**: nơi lưu Docker image private mà GitHub Actions build.

## 2. File deploy

Các file quan trọng:

```text
.github/workflows/deploy.yml
docker-compose.backend.prod.yml
dev/backend/Dockerfile.prod
dev/backend/requirements.txt
```

`docker-compose.backend.prod.yml` tạo Backend + Redis. Nó **không tạo MinIO mới**; Backend kết nối MinIO hiện tại bằng:

```env
MINIO_ENDPOINT=...
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=bachkhoa-erp-files
```

## 3. Chuẩn bị VPS

### 3.1. Kiểm tra Docker

```bash
docker --version
docker compose version
```

### 3.2. Tạo thư mục riêng

```bash
mkdir -p /www/dk_project/bachkhoa-erp/dev/backend
```

Cấu trúc:

```text
/www/dk_project/
├── dk_app/                         # Hệ thống khác, không đụng vào
└── bachkhoa-erp/
    ├── docker-compose.backend.prod.yml
    └── dev/backend/.env
```

### 3.3. Upload Compose file

Qua aaPanel Files, upload:

```text
docker-compose.backend.prod.yml
```

vào:

```text
/www/dk_project/bachkhoa-erp
```

Kiểm tra:

```bash
ls -l /www/dk_project/bachkhoa-erp/docker-compose.backend.prod.yml
```

Không upload `.env` lên GitHub.

## 4. Cấu hình MinIO

MinIO hiện tại thường có:

```text
19000 -> S3 API
19001 -> MinIO Console
```

Backend dùng API port (ví dụ 19000 hoặc qua reverse proxy), không dùng Console port 19001:

```env
# Nếu chạy cùng VPS qua mạng nội bộ Docker:
MINIO_ENDPOINT=http://minio:9000
# Nếu kết nối MinIO ngoại vi qua Internet công cộng, BẮT BUỘC dùng HTTPS qua Reverse Proxy/TLS:
# MINIO_ENDPOINT=https://minio.yourdomain.com
```

Trong MinIO Console tạo bucket riêng:

```text
bachkhoa-erp-files
```

Để quyền bucket là:

```text
Private
```

Không dùng chung bucket `nhadatbachkhoa` hoặc `test`.

Các biến `MINIO_*_FILE` chỉ là tên file secret của container MinIO, không phải giá trị access key để dán vào Backend `.env`.

## 5. Tạo production .env

Tạo file:

```text
/www/dk_project/bachkhoa-erp/dev/backend/.env
```

Khóa quyền:

```bash
chown root:root /www/dk_project/bachkhoa-erp/dev/backend/.env
chmod 600 /www/dk_project/bachkhoa-erp/dev/backend/.env
```

Mẫu:

```env
PORT=8080
ENV=production
SEED_ADMIN_ENABLED=false
BACKEND_IMAGE_TAG=latest

# Supabase PostgreSQL
PG_HOST=CHANGE_ME_POOLER_HOST
PG_PORT=6543
PG_DATABASE=postgres
PG_USER=CHANGE_ME_POOLER_USER
PG_PASSWORD=CHANGE_ME_NEW_DATABASE_PASSWORD

# Có thể dùng DATABASE_URL thay cho PG_*.
# Nếu khai báo, URI phải hợp lệ và dùng mật khẩu mới.
# DATABASE_URL=postgresql://USER:PASSWORD@HOST:6543/postgres

# Supabase API
SUPABASE_URL=https://CHANGE_ME.supabase.co
SUPABASE_PUBLISHABLE_KEY=CHANGE_ME
SUPABASE_SECRET_KEY=CHANGE_ME

# App security
SECRET_KEY=CHANGE_ME_LONG_RANDOM_SECRET

# URL frontend, không có dấu / cuối
FRONTEND_BASE_URL=https://CHANGE_ME_FRONTEND_DOMAIN
CORS_ORIGINS=https://CHANGE_ME_FRONTEND_DOMAIN

# Redis riêng của project
REDIS_URL=redis://redis-contracts:6379/0

# MinIO có sẵn trên VPS
MINIO_ENDPOINT=http://CHANGE_ME_VPS_OR_INTERNAL_IP:19000
MINIO_ACCESS_KEY=CHANGE_ME_MINIO_ACCESS_KEY
MINIO_SECRET_KEY=CHANGE_ME_MINIO_SECRET_KEY
MINIO_BUCKET=bachkhoa-erp-files
MINIO_PUBLIC_URL=http://CHANGE_ME_VPS_OR_INTERNAL_IP:19000
OBJECT_STORAGE_BUCKET=bachkhoa-erp-files

# Tích hợp tùy chọn
PAYOS_CLIENT_ID=CHANGE_ME
PAYOS_API_KEY=CHANGE_ME
PAYOS_CHECKSUM_KEY=CHANGE_ME
GEMINI_API_KEY=CHANGE_ME

# Email
EMAIL_PROVIDER=gmail_smtp
GMAIL_ADDRESS=CHANGE_ME_EMAIL
GMAIL_APP_PASSWORD=CHANGE_ME_NEW_APP_PASSWORD
EMAIL_FROM=Bach Khoa ERP <CHANGE_ME_EMAIL>
```

Quy tắc:

- Không dùng `localhost` trong production.
- Không dùng Markdown `[url](url)` trong `.env`; dùng URL thuần.
- `CORS_ORIGINS` là origin frontend, ví dụ `https://app.example.com`, không có path và không có dấu `/` cuối.
- Nếu password có ký tự đặc biệt, cần URL-encode khi đặt trong `DATABASE_URL`.
- Không thêm `TEST_DATABASE_URL` vào production.
- Không để `CHANGE_ME` hoặc `your_` trong cấu hình thật.

## 6. Kiểm tra Compose trước khi chạy

Lệnh này chỉ phân tích và validate file Compose; nó chưa tạo hoặc restart container. Đây là bước an toàn để phát hiện sai đường dẫn `.env`, thiếu biến bắt buộc hoặc YAML lỗi.

```bash
cd /www/dk_project/bachkhoa-erp

docker compose \
  --env-file dev/backend/.env \
  -f docker-compose.backend.prod.yml \
  config --quiet
```

Không có output nghĩa là Compose đọc được cấu hình.

Kiểm tra service:

```bash
docker compose \
  --env-file dev/backend/.env \
  -f docker-compose.backend.prod.yml \
  config --services
```

Kết quả mong đợi:

```text
redis-contracts
backend
```

Nếu có service `minio`, đó là file Compose cũ hoặc upload nhầm file.

## 7. Kiểm tra MinIO

```bash
curl -i --max-time 5 \
  http://CHANGE_ME_VPS_OR_INTERNAL_IP:19000/minio/health/live
```

Kết quả thường là HTTP `200 OK`.

## 8. SSH key cho GitHub Actions

### Ý nghĩa của cặp SSH key

- **Private key** nằm trong GitHub Secret `VPS_SSH_KEY`; không đưa lên VPS và không commit vào Git.
- **Public key** nằm trong `/root/.ssh/authorized_keys` trên VPS.
- Server của người khác vẫn dùng được key riêng cho project này; thêm key không xóa hay thay đổi key đang có.
- Workflow hiện dùng SSH port `2025`, vì VPS không lắng nghe ở port mặc định `22`.

GitHub Actions không dùng phiên aaPanel trên trình duyệt. Nó cần private key để SSH vào VPS.

### 8.1. Tạo key trên Mac

```bash
ssh-keygen -t ed25519 \
  -C "github-actions-bachkhoa-erp" \
  -f ~/.ssh/bachkhoa_erp_deploy
```

Tạo hai file:

```text
~/.ssh/bachkhoa_erp_deploy       # private key
~/.ssh/bachkhoa_erp_deploy.pub   # public key
```

Không gửi private key qua chat hoặc commit vào repository.

### 8.2. Cài public key lên VPS

Trên Mac:

```bash
pbcopy < ~/.ssh/bachkhoa_erp_deploy.pub
```

Trong aaPanel Terminal:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
nano /root/.ssh/authorized_keys
```

Dán public key thành một dòng, lưu bằng `Ctrl+O`, Enter, `Ctrl+X`.

```bash
chmod 600 /root/.ssh/authorized_keys
```

Test từ Mac:

```bash
ssh -i ~/.ssh/bachkhoa_erp_deploy root@CHANGE_ME_VPS_IP
```

Lệnh kiểm tra đúng với cấu hình production:

```bash
ssh -p 2025 -o IdentitiesOnly=yes \
  -i ~/.ssh/bachkhoa_erp_deploy \
  root@CHANGE_ME_VPS_IP
```

## 9. GitHub Actions Secrets

Vào:

```text
Repository Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

Tạo chính xác:

| Name | Giá trị |
|---|---|
| `VPS_HOST` | IP/hostname VPS |
| `VPS_USER` | User SSH, ví dụ `root` |
| `VPS_SSH_KEY` | Toàn bộ private key, gồm BEGIN và END |
| `VPS_DEPLOY_PATH` | `/www/dk_project/bachkhoa-erp` |

Không gửi private key hoặc runtime secrets qua chat.

## 10. CI/CD hoạt động thế nào?

```text
Push main
  -> Check Python syntax
  -> Build backend Docker image
  -> Push image lên GHCR
  -> SSH vào VPS
  -> Login GHCR
  -> Pull backend + Redis
  -> docker compose up -d
  -> In trạng thái service
```

### Ý nghĩa từng công đoạn

| Công đoạn | Ý nghĩa |
|---|---|
| Check Backend | Biên dịch thử Python để bắt lỗi cú pháp trước khi build image. |
| Build & Push Backend | Đóng gói backend thành image và lưu trên GHCR. |
| SSH vào VPS | Actions dùng key riêng để chạy lệnh deploy từ xa qua port 2025. |
| Login GHCR | Cho VPS quyền pull image private. |
| Compose pull | Tải image `latest` mới nhất về VPS. |
| Compose up | Tạo/cập nhật backend và Redis; `--no-build` đảm bảo VPS không tự build source. |
| Compose ps | In trạng thái để xác nhận container đã khởi động. |

Workflow **không** build frontend, không tạo MinIO mới và không đụng tới container Compose khác trên VPS.

Workflow không build frontend và không tạo MinIO mới.

## 11. Commit và push workflow

Trên Mac:

```bash
git status --short
git diff --check
```

Kiểm tra hai file:

```text
.github/workflows/deploy.yml
docker-compose.backend.prod.yml
```

Commit:

```bash
git add .github/workflows/deploy.yml docker-compose.backend.prod.yml
git commit -m "ci: deploy backend with external MinIO"
```

Chỉ push sau khi đã chuẩn bị VPS, `.env`, bucket, SSH key và GitHub Secrets:

```bash
git push origin main
```

## 12. Theo dõi Actions

Vào:

```text
Actions
→ Deploy BachKhoa ERP
```

Ba job cần thành công:

```text
Check Backend
Build & Push Backend
Deploy to VPS
```

## 13. Kiểm tra sau deploy

Kiểm tra theo thứ tự từ trong ra ngoài. Nếu bước trước chưa đạt, chưa cần kiểm tra bước sau.

Trên VPS:

```bash
cd /www/dk_project/bachkhoa-erp

docker compose \
  --env-file dev/backend/.env \
  -f docker-compose.backend.prod.yml \
  ps
```

Mong đợi:

```text
redis-contracts   running (healthy)
backend           running
```

`healthy` quan trọng hơn việc container chỉ hiện `Up`: healthcheck đã gọi được API trong container.

Kiểm tra API:

```bash
curl -i http://127.0.0.1:8080/
```

Xem log:

```bash
docker compose \
  --env-file dev/backend/.env \
  -f docker-compose.backend.prod.yml \
  logs --tail=100 backend
```

## 14. Reverse proxy domain

Trong aaPanel, cấu hình:

```text
Domain: bendbk.wiai.vn
Proxy target: http://127.0.0.1:8080
```

Không trỏ tới `0.0.0.0:2004`.

Kiểm tra API docs:

```text
https://bendbk.wiai.vn/docs
```

Nếu `curl http://127.0.0.1:8080/` trả `200` nhưng domain trả `502`, backend vẫn tốt và lỗi nằm ở reverse proxy. Target phải là `http://127.0.0.1:8080`, không phải `http://0.0.0.0:2004`.

## 15. SSL/HTTPS

Trước khi cấp SSL:

1. DNS A record của `bendbk.wiai.vn` trỏ đúng IP VPS.
2. Cổng 80 và 443 được mở.
3. Reverse proxy đang hoạt động.

Trong aaPanel:

```text
Website/Domains
→ bendbk.wiai.vn
→ SSL
→ Let's Encrypt
→ Obtain
→ Force HTTPS
```

Kiểm tra:

```text
https://bendbk.wiai.vn/docs
```

Kiểm tra từ VPS:

```bash
curl -i https://bendbk.wiai.vn/
```

Kết quả đúng là HTTP `200` và JSON tương tự:

```json
{"message":"OpenClaw ERP API is running"}
```

Frontend phải gọi API bằng HTTPS:

```env
VITE_API_URL=https://bendbk.wiai.vn
```

Trong frontend hiện tại, tên biến là `VITE_API_URL`. Sau khi đổi biến trên Netlify phải trigger deploy lại vì Vite nhúng biến môi trường vào bundle lúc build.

Frontend và backend có hai lần deploy độc lập:

- Sửa backend hoặc workflow: push `main` để GitHub Actions deploy backend.
- Sửa màn hình frontend hoặc `VITE_API_URL`: commit/push để Netlify build lại frontend.

## 16. Deploy các lần sau

Không cần upload source code lên VPS mỗi lần. VPS chỉ cần giữ Compose file và `.env`.

### Khi thay đổi backend hoặc workflow

```bash
git diff --check
git add dev/backend .github/workflows/deploy.yml docker-compose.backend.prod.yml
git commit -m "update backend"
git push origin main
```

GitHub Actions sẽ tự chạy ba job. Chỉ coi là thành công khi `Check Backend`, `Build & Push Backend` và `Deploy to VPS` đều xanh.

### Khi thay đổi frontend

```bash
git diff --check
git add dev/frontend
git commit -m "update frontend"
git push origin main
```

Netlify sẽ build lại nếu repository đã được liên kết. Nếu không tự chạy, vào Netlify → **Deploys** → **Trigger deploy** → **Deploy site**.

## 17. Rollback

Workflow push tag `latest` và commit SHA. Có thể rollback bằng:

```bash
cd /www/dk_project/bachkhoa-erp

BACKEND_IMAGE_TAG=COMMIT_SHA \
docker compose \
  --env-file dev/backend/.env \
  -f docker-compose.backend.prod.yml \
  pull backend

BACKEND_IMAGE_TAG=COMMIT_SHA \
docker compose \
  --env-file dev/backend/.env \
  -f docker-compose.backend.prod.yml \
  up -d --no-build backend
```

Thay `COMMIT_SHA` bằng SHA cần chạy lại.

## 18. Lỗi thường gặp

### GitHub Actions báo `ssh: no key found`

`VPS_SSH_KEY` không phải public key và không phải mật khẩu VPS. Dùng toàn bộ file private key:

```bash
pbcopy < ~/.ssh/bachkhoa_erp_deploy
```

Dán nguyên văn, bao gồm cả hai dòng:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
-----END OPENSSH PRIVATE KEY-----
```

### GitHub Actions báo `connect: connection refused` ở port 22

VPS dùng port SSH `2025`. Kiểm tra trên VPS:

```bash
ss -ltnp | grep ssh
grep -E '^[[:space:]]*Port ' /etc/ssh/sshd_config
```

Workflow phải có:

```yaml
with:
  port: 2025
```

### GitHub Actions báo `unable to authenticate`

Port đã đúng nhưng public key chưa khớp private key. Thêm nội dung của `~/.ssh/bachkhoa_erp_deploy.pub` vào `/root/.ssh/authorized_keys`, không xóa các dòng key cũ, rồi đặt quyền:

```bash
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh
```

Kiểm tra từ Mac:

```bash
ssh -p 2025 -o IdentitiesOnly=yes \
  -i ~/.ssh/bachkhoa_erp_deploy \
  root@VPS_IP
```

### Không tìm thấy .env

```text
couldn't find env file: /root/dev/backend/.env
```

Bạn đang đứng sai thư mục:

```bash
cd /www/dk_project/bachkhoa-erp
```

### Backend healthcheck fail

```bash
docker compose \
  --env-file dev/backend/.env \
  -f docker-compose.backend.prod.yml \
  logs --tail=200 backend
```

Nguyên nhân thường gặp:

- `DATABASE_URL` còn placeholder.
- Sai database password.
- MinIO endpoint không truy cập được từ container.
- Access key không có quyền bucket.
- Thiếu `SECRET_KEY`.

### Domain 502

```bash
curl -i http://127.0.0.1:8080/
docker compose --env-file dev/backend/.env -f docker-compose.backend.prod.yml ps
```

Nếu curl nội bộ chạy nhưng domain 502, kiểm tra reverse proxy hoặc SSL.

Target aaPanel đúng:

```text
http://127.0.0.1:8080
```

Không dùng `0.0.0.0:2004`; đó là cấu hình proxy cũ hoặc sai của domain.

### SSL sai certificate

Nếu curl báo `no alternative certificate subject name matches target host name`, vào aaPanel → website `bendbk.wiai.vn` → SSL → Let's Encrypt và cấp certificate đúng cho chính domain này. DNS A record phải trỏ về IP VPS trước khi cấp.

### Frontend báo 404 hoặc gọi `localhost`

Mở DevTools → Network và kiểm tra Request URL. Production phải gọi dạng:

```text
https://bendbk.wiai.vn/api/...
```

Nếu thấy `localhost:8080` hoặc `127.0.0.1:8080`, đổi trên Netlify:

```env
VITE_API_URL=https://bendbk.wiai.vn
```

Sau đó redeploy frontend.

### CORS error

```env
CORS_ORIGINS=https://frontend-domain.example
```

Origin phải khớp chính xác domain frontend, gồm scheme `https`, không có path và không có dấu `/` cuối.

## 19. Bảo mật

- Không commit `.env`.
- Không gửi database password, Supabase secret key, MinIO secret key, Gmail App Password hoặc SSH private key.
- Nếu secret bị lộ, thu hồi và tạo lại ngay.
- Không dùng `docker compose down -v` trên production.
- Không dùng `docker system prune -a` khi chưa hiểu ảnh hưởng rollback.
- Không bấm `Clear DB`, `Clear Container` hoặc `Delete` trên hệ thống khác.
- Nên tạo service account MinIO riêng thay vì dùng root credentials lâu dài.

## 20. Checklist

- [ ] Code ở nhánh `main`.
- [ ] Workflow chỉ build/deploy backend.
- [ ] Compose dùng Redis riêng và MinIO external.
- [ ] VPS có Compose file mới nhất.
- [ ] VPS có `.env` quyền `600`.
- [ ] Bucket `bachkhoa-erp-files` tồn tại và private.
- [ ] MinIO API port 19000 truy cập được.
- [ ] SSH public key đã cài trên VPS.
- [ ] GitHub có đủ 4 Secrets.
- [ ] Actions chạy xanh cả ba job.
- [ ] `redis-contracts` healthy.
- [ ] Backend healthcheck passed.
- [ ] Proxy trỏ tới `127.0.0.1:8080`.
- [ ] SSL hoạt động.
- [ ] Frontend gọi đúng `https://bendbk.wiai.vn`.

Sau mỗi lần deploy, kiểm tra endpoint public:

```bash
curl -i https://bendbk.wiai.vn/
```

Kết quả mong đợi là HTTP `200`, backend container `healthy` và frontend gọi đúng domain API.

