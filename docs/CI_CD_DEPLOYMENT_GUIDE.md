# 🚀 Hướng Dẫn Triển Khai CI/CD — BachKhoa ERP

## Tổng Quan

```
Máy dev (git push main)
       ↓
GitHub Actions (tự động)
       ├─ 1. Chạy test Vitest
       ├─ 2. Build Docker images (backend + frontend)
       ├─ 3. Push images lên GHCR (GitHub Container Registry)
       └─ 4. SSH vào VPS → pull images mới → restart containers
       ↓
VPS công ty (đã cập nhật bản mới)
```

**Bạn chỉ cần `git push` — mọi thứ còn lại tự động.**

---

## Kiến Trúc

### Docker Images

| Image | Nguồn | Mô tả |
|---|---|---|
| `ghcr.io/ryhtruly/bachkhoa-erp-backend` | **GHCR** (mình build) | Python FastAPI + Uvicorn |
| `ghcr.io/ryhtruly/bachkhoa-erp-frontend` | **GHCR** (mình build) | React (Vite build) + Nginx |
| `redis:7.4.9-alpine` | Docker Hub (công khai) | Cache, dùng nguyên không sửa |
| `minio/minio` | Docker Hub (công khai) | Object storage, dùng nguyên không sửa |

### Docker Compose Files

| File | Mục đích | Dùng ở đâu |
|---|---|---|
| `docker-compose.dev.yml` | Dev mode, mount code, hot reload | Máy dev |
| `docker-compose.yml` | Build & chạy local (test production) | Máy dev |
| `docker-compose.prod.yml` | Pull image từ GHCR, không build | **VPS công ty** |

---

## Thiết Lập (Chỉ Làm 1 Lần)

### 1. Cài Docker trên VPS

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Đăng xuất rồi đăng nhập lại, kiểm tra:
docker --version           # cần 24+
docker compose version     # cần v2.20+
```

### 2. Tạo SSH Key cho GitHub Actions

```bash
# Trên máy bất kỳ — tạo key pair dành riêng cho deploy
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/bachkhoa_deploy

# Kết quả:
#   ~/.ssh/bachkhoa_deploy       ← PRIVATE KEY → đưa vào GitHub Secrets
#   ~/.ssh/bachkhoa_deploy.pub   ← PUBLIC KEY  → đưa lên VPS
```

Đưa public key lên VPS:

```bash
# Cách 1: Tự động
ssh-copy-id -i ~/.ssh/bachkhoa_deploy.pub user@VPS_IP

# Cách 2: Thủ công — SSH vào VPS rồi chạy:
echo "nội_dung_public_key" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 3. Chuẩn bị thư mục trên VPS

```bash
# SSH vào VPS
ssh user@VPS_IP

# Tạo thư mục project
sudo mkdir -p /opt/bachkhoa-erp/dev/backend
cd /opt/bachkhoa-erp

# Copy file docker-compose.prod.yml lên VPS (từ máy local)
# scp docker-compose.prod.yml user@VPS_IP:/opt/bachkhoa-erp/
```

### 4. Tạo file `.env` trên VPS

```bash
nano /opt/bachkhoa-erp/dev/backend/.env
```

Nội dung mẫu:

```ini
# Database
DATABASE_URL=postgresql+psycopg2://user:pass@db-host:5432/bachkhoa_erp

# Supabase (nếu dùng)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key

# MinIO
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=your_minio_secret

# Environment & App Secret (TỰ ĐẶT CHUỖI BÍ MẬT BẤT KỲ)
ENV=production
SECRET_KEY=chuoi_bi_mat_ngau_nhien_dai_it_nhat_32_ky_tu
```

> ⚠️ **KHÔNG commit file `.env` lên Git.** File này đã được ignore trong `.gitignore`.

### 5. Tạo GitHub Secrets

Vào GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Giá trị | Ví dụ |
|---|---|---|
| `VPS_HOST` | IP hoặc domain VPS | `203.0.113.50` |
| `VPS_USER` | User SSH trên VPS | `root` hoặc `deploy` |
| `VPS_SSH_KEY` | Toàn bộ nội dung file private key | `-----BEGIN OPENSSH PRIVATE KEY-----`... |
| `VPS_DEPLOY_PATH` | Thư mục project trên VPS | `/opt/bachkhoa-erp` |

> ⚠️ Copy **toàn bộ** nội dung private key, bao gồm dòng BEGIN và END. Thiếu 1 ký tự sẽ lỗi.

---

## Sử Dụng

### Deploy tự động (mỗi lần push)

```bash
# Merge feature vào main rồi push
git checkout main
git merge feature/your-branch
git push origin main

# Workflow tự chạy! Kiểm tra tại:
# https://github.com/Ryhtruly/bachkhoa-erp/actions
```

Pipeline mất khoảng **~4 phút** (test ~1 phút + build ~3 phút + deploy ~30 giây).

### Deploy thủ công (không cần push code)

1. Vào GitHub → tab **Actions**
2. Chọn **Deploy BachKhoa ERP**
3. Click **Run workflow** → chọn branch `main` → **Run**

Hữu ích khi VPS bị restart mà code không thay đổi.

### Kiểm tra sau deploy

```bash
# SSH vào VPS
ssh user@VPS_IP

# Kiểm tra containers
docker ps

# Xem logs
docker compose -f docker-compose.prod.yml logs -f --tail=50

# Kiểm tra frontend
curl http://localhost:3000

# Kiểm tra backend
curl http://localhost:8080/
```

---

## Rollback (Quay về bản cũ)

Mỗi lần build, image được tag thêm git commit SHA. Để rollback:

```bash
# SSH vào VPS
cd /opt/bachkhoa-erp

# Xem các image đang có
docker images | grep bachkhoa

# Pull bản cũ theo commit SHA
docker pull ghcr.io/ryhtruly/bachkhoa-erp-backend:<commit-sha>
docker pull ghcr.io/ryhtruly/bachkhoa-erp-frontend:<commit-sha>

# Tag lại thành latest
docker tag ghcr.io/ryhtruly/bachkhoa-erp-backend:<commit-sha> ghcr.io/ryhtruly/bachkhoa-erp-backend:latest
docker tag ghcr.io/ryhtruly/bachkhoa-erp-frontend:<commit-sha> ghcr.io/ryhtruly/bachkhoa-erp-frontend:latest

# Restart
docker compose -f docker-compose.prod.yml up -d
```

---

## Xử Lý Lỗi Thường Gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| Test failed | Code lỗi test | Fix test → push lại |
| `denied: permission denied` khi push GHCR | Repo chưa cho phép Actions ghi packages | GitHub → Settings → Actions → General → "Read and write permissions" |
| SSH connection refused | Sai key, sai IP, hoặc firewall chặn port 22 | Kiểm tra lại Secrets và firewall VPS |
| `docker: command not found` trên VPS | VPS chưa cài Docker | Cài Docker theo hướng dẫn trên |
| `no space left on device` | Ổ cứng VPS đầy | `docker system prune -af` rồi deploy lại |
| Container unhealthy | Backend không kết nối được DB/Redis | Kiểm tra file `.env` và logs: `docker compose logs backend` |

---

## Checklist

- [ ] VPS đã cài Docker + Docker Compose v2
- [ ] Đã tạo SSH key pair (ed25519)
- [ ] Public key đã thêm vào VPS `authorized_keys`
- [ ] Thư mục `/opt/bachkhoa-erp` đã tạo trên VPS
- [ ] File `docker-compose.prod.yml` đã copy lên VPS
- [ ] File `dev/backend/.env` đã tạo trên VPS
- [ ] 4 GitHub Secrets đã tạo (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH`)
- [ ] Test push vào `main` và kiểm tra tab Actions
- [ ] Truy cập `http://VPS_IP:3000` thành công
