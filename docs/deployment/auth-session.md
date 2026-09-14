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

Nếu trình duyệt gọi trực tiếp `https://bendbk.wiai.vn` từ một frontend khác
site, đổi `AUTH_COOKIE_SAMESITE=none` và giữ `AUTH_COOKIE_SECURE=true`. Nếu
frontend gọi `/api/*` qua reverse proxy Netlify cùng origin, `lax` là lựa chọn
phù hợp hơn.

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
