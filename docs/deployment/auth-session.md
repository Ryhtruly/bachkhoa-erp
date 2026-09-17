# Cấu hình phiên đăng nhập production

Backend dùng access token ngắn hạn và refresh session lưu trong PostgreSQL.
Refresh token chỉ xuất hiện trong cookie `HttpOnly`; database chỉ lưu SHA-256
hash và mỗi lần refresh sẽ xoay token.

## Cấu hình bắt buộc

Trong `dev/backend/.env` trên máy chủ, đặt tối thiểu:

```dotenv
ENV=production
SECRET_KEY=<secret-ngau-nhien-dai-va-rieng-biet>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
REFRESH_TOKEN_IDLE_HOURS=24
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_DOMAIN=
```

`CORS_ORIGINS` phải là danh sách origin chính xác, phân tách bằng dấu phẩy;
không dùng `*` khi dùng cookie credentials. Ví dụ:

```dotenv
CORS_ORIGINS=https://erp.example.com,https://bachkhoa-erp.netlify.app
```

### Kiến trúc triển khai & Xử lý Safari / macOS

Trình duyệt Safari trên macOS/iOS có cơ chế bảo vệ ITP (Intelligent Tracking Prevention) tự động chặn hoặc cô lập cookie cross-site (`SameSite=None`). Do đó, nếu Frontend nằm ở domain khác Backend (ví dụ frontend trên Netlify và backend trên server riêng), Safari có thể không gửi refresh cookie khi access token hết hạn, dẫn đến phiên đăng nhập bị ngắt bất ngờ và user bị đẩy về màn hình đăng nhập (mặc dù token và refresh session trên server vẫn hợp lệ).

Để khắc phục triệt để, có 2 phương án cấu hình:

#### Phương án 1: Same-Origin / Reverse Proxy (Khuyến nghị cao nhất)
Chuyển Frontend và Backend về chung origin, hoặc dùng Reverse Proxy (Nginx, Netlify Proxy) để map đường dẫn `/api/*` về backend:
- Trong Netlify `_redirects`:
  ```text
  /api/*  https://api.yourdomain.com/api/:splat  200
  /*      /index.html                            200
  ```
- Hoặc cấu hình Nginx reverse proxy cùng domain `https://erp.yourdomain.com`.
- Khi đó, trình duyệt coi cookie là **First-Party** (`SameSite=Lax`), hoàn toàn không bị Safari ITP chặn:
  ```dotenv
  AUTH_COOKIE_SECURE=true
  AUTH_COOKIE_SAMESITE=lax
  AUTH_COOKIE_DOMAIN=
  ```

#### Phương án 2: Cross-Site (Frontend Netlify riêng, Backend riêng biệt)
Nếu tạm thời chưa gom domain và gọi trực tiếp `https://bendbk.wiai.vn`:
- Bắt buộc phải cấu hình:
  ```dotenv
  CORS_ORIGINS=https://bachkhoa-erp.netlify.app
  AUTH_COOKIE_SECURE=true
  AUTH_COOKIE_SAMESITE=none
  AUTH_COOKIE_DOMAIN=
  ```
- *Lưu ý*: Với thiết lập này, người dùng Safari cần bảo đảm không bật chế độ chặn toàn bộ third-party cookie trong cài đặt trình duyệt, và nên sớm chuyển sang Phương án 1.

## Migration và rollout

1. Apply migration `20260912000000_auth_refresh_sessions.sql` vào đúng database
   production trước khi bật backend mới.
2. Deploy/restart backend với các biến môi trường trên.
3. Đăng nhập thử bằng trình duyệt ẩn danh; kiểm tra cookie chỉ có `HttpOnly`,
   `Secure` (production), `Path=/api/auth`, và không xuất hiện trong
   `localStorage` hay response JSON.
4. Gọi hoặc chờ access token hết hạn, sau đó tải lại một màn hình có API bảo
   vệ. Request phải tự gọi `/api/auth/refresh`, nhận cookie mới và không đưa
   người dùng về màn hình login.
5. Đăng xuất rồi tải lại trang. `/api/auth/refresh` phải trả `401` và cookie
   phải bị xóa.

Các phiên cũ phát hành trước khi tính năng này được triển khai không có refresh
cookie tương ứng; người dùng chỉ cần đăng nhập lại một lần sau rollout.
