# Thiết kế phiên đăng nhập có refresh token

## Mục tiêu

Cho phép người dùng Bách Khoa ERP tiếp tục làm việc sau khi access token ngắn hạn hết hạn hoặc sau khi refresh trang, miễn là refresh session còn hợp lệ; đồng thời không biến access token thành token dài hạn và không lưu refresh token trong JavaScript storage.

## Bối cảnh hiện tại

- Backend đang phát một JWT access token duy nhất với thời hạn 24 giờ.
- Frontend đang lưu access token trong `localStorage` và mọi `401` đều xóa token rồi đưa người dùng về màn hình đăng nhập.
- Model `AuthToken` hiện có trong code nhưng không được luồng đăng nhập sử dụng.
- Backend đã bật CORS credentials, nhưng cookie production cần cấu hình rõ `Secure`, `SameSite` và origin frontend.
- Bách Khoa ERP có dữ liệu tài chính, tiền lương và quyền hạn nhạy cảm; không chấp nhận phiên vô thời hạn.

## Quyết định kiến trúc

### Access token

- JWT HS256 chỉ chứa `sub` và `exp`.
- Thời hạn mặc định: 30 phút, cấu hình được qua `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Frontend giữ access token trong memory của module API, không tiếp tục sử dụng `localStorage` làm nguồn xác thực.
- `localStorage` key cũ được xóa khi logout; không dùng để khôi phục session mới.

### Refresh session

- Refresh token là chuỗi ngẫu nhiên opaque, chỉ lưu bản băm SHA-256 ở backend.
- Raw refresh token chỉ được gửi cho browser qua cookie:
  - `HttpOnly`.
  - `Secure` ở production.
  - `SameSite` và `Domain` cấu hình được theo topology frontend/backend.
  - `Path=/api/auth`.
- Mỗi lần refresh sẽ rotate token: token cũ bị revoke và token mới được cấp trong cùng một token family.
- Backend lưu session trong bảng riêng `auth_refresh_sessions`, gồm user, token hash, family, thời hạn tuyệt đối, thời hạn idle, user-agent, IP và trạng thái revoke.
- Refresh session mặc định có thời hạn tuyệt đối 7 ngày và idle timeout 24 giờ; chế độ ghi nhớ thiết bị tùy chọn có thể dùng thời hạn tuyệt đối 30 ngày.
- Khi phát hiện refresh token đã bị rotate nhưng bị sử dụng lại, revoke toàn bộ token family.

### Luồng frontend

- Khi khởi động ứng dụng, gọi `/api/auth/me`; nếu access token chưa có hoặc hết hạn, API helper gọi `/api/auth/refresh` một lần rồi retry request ban đầu.
- Khi nhiều request cùng nhận `401`, dùng chung một refresh promise, không tạo nhiều refresh session song song.
- Chỉ logout khi refresh cũng thất bại bằng `401`, hoặc người dùng chủ động logout.
- Timeout/network/5xx vẫn giữ session hiện tại và dùng cơ chế retry session đã bổ sung.
- Login, reset password và hoàn tất invite đều nhận refresh cookie qua `credentials: include`.
- Logout gọi endpoint revoke session và luôn xóa state local.

### Tác vụ nhạy cảm

Refresh session không thay thế authorization backend. Mỗi endpoint vẫn kiểm tra user active và quyền hiện tại từ database. Các thao tác tài chính rủi ro cao như chốt lương hoặc duyệt chi có thể bổ sung step-up authentication ở phase riêng; không mở rộng scope vào plan này.

## Cấu hình production bắt buộc

- `SECRET_KEY` phải được đặt bằng secret mạnh; không dùng giá trị fallback.
- `CORS_ORIGINS` phải là allowlist origin frontend, không dùng `*` khi có credentials.
- `AUTH_COOKIE_SECURE=true` ở production.
- Nếu frontend và backend khác site, dùng `AUTH_COOKIE_SAMESITE=none` cùng HTTPS; nếu cùng site, ưu tiên `lax`.
- `AUTH_COOKIE_DOMAIN` chỉ đặt khi cần chia sẻ cookie giữa các subdomain được kiểm soát.
- Khi frontend dùng reverse proxy cùng origin (như Netlify proxy `/api/*`),
  `lax` vẫn phù hợp; nếu gọi trực tiếp backend khác site thì bắt buộc giữ
  `none` và `secure`.

## Không nằm trong scope

- Không thay đổi các rule nghiệp vụ, RBAC hoặc quyền xem lương.
- Không đổi cơ chế phân quyền của từng route.
- Không thêm “remember username” thành “remember session” một cách âm thầm; nếu cần UI lựa chọn, dùng trường `remember_me` riêng.
- Không thêm cơ chế tự động gia hạn vô hạn hoặc bỏ kiểm tra `exp`.

## Tiêu chí nghiệm thu

1. Access token hết hạn nhưng refresh session còn hạn: request được refresh và retry, người dùng không thấy màn hình login.
2. Refresh session hết hạn, bị revoke hoặc user bị vô hiệu hóa: frontend xóa session và yêu cầu login.
3. Refresh token cũ sau rotation không dùng lại được; reuse làm revoke token family.
4. Logout revoke session server-side và xóa cookie.
5. F5/reload sau login vẫn khôi phục session qua refresh cookie.
6. Hai hoặc nhiều request đồng thời bị `401` chỉ tạo một lượt refresh.
7. Không có raw refresh token trong response JSON, localStorage, log hoặc test snapshot.
8. Toàn bộ backend auth tests, frontend API/session tests và production build đều pass.
