# Bách Khoa ERP — Frontend

Frontend của Bách Khoa ERP, hệ thống quản trị doanh nghiệp cho Công ty TNHH Kiến trúc Xây dựng và Đo đạc Bản đồ Bách Khoa.

## Công nghệ

- React và Vite
- React Flow cho thiết kế quy trình
- Recharts cho biểu đồ và trực quan hóa dữ liệu
- Vitest và Testing Library cho kiểm thử giao diện

## Chạy local

```powershell
npm ci
npm run dev
```

Mặc định Vite chạy tại `http://localhost:5173`. Khi chạy local, các request `/api/*` và `/static/*` được proxy tới Backend tại `http://127.0.0.1:8080`.

Nếu Backend chạy ở địa chỉ khác, thiết lập biến môi trường trước khi khởi động Vite:

```powershell
$env:VITE_BACKEND_TARGET = "http://127.0.0.1:8080"
npm run dev
```

## Kiểm thử và build

```powershell
npm test
npm run build
```

Thư mục build production là `dist/`.

## Triển khai Netlify

Cấu hình Netlify nằm ở [`../../netlify.toml`](../../netlify.toml). Site sử dụng `dev/frontend` làm thư mục build, chạy `npm run build` và publish `dist/`.

Các rule trong [`public/_redirects`](public/_redirects) chuyển tiếp:

- `/api/*` tới Backend production `https://bendbk.wiai.vn/api/*`.
- `/static/*` tới Backend production `https://bendbk.wiai.vn/static/*`.
- Các route còn lại tới `index.html` để hỗ trợ SPA routing.

Khi thay đổi domain Backend, cập nhật `public/_redirects` trước khi deploy lại Frontend.

## Cấu trúc chính

- `src/App.jsx`: shell và điều hướng chính của ứng dụng.
- `src/pages/`: các màn hình nghiệp vụ.
- `src/components/`: thành phần giao diện dùng chung.
- `src/features/`: các nhóm tính năng chuyên biệt.
- `src/lib/api.js`: client gọi API và cache dữ liệu ngắn hạn.
- `public/`: asset tĩnh được giữ nguyên khi Vite build.
