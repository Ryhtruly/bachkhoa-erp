# QA report: Contract workflow

- Ngày: 2026-08-27
- URL: `http://127.0.0.1:3000/`
- Workspace shell: `T:\\github\\bachkhoa-erp_alias`
- Phạm vi: UI, Playwright snapshot/console/network, backend Docker log, MinIO object list.
- Không sửa code hoặc database. Chỉ thực hiện thao tác QA trên dữ liệu test.

## Lỗi đã xác nhận

| ID | Mức độ | Luồng | Kết quả / bằng chứng |
|---|---|---|---|
| BUG-001 | Cao | Admin mở workflow | Console lặp `ReferenceError: getAccessToken is not defined` tại `ContractWorkspace.jsx:335`; workspace vẫn hiển thị nhưng subscription realtime không chạy đúng. |
| BUG-002 | Trung bình | Kích hoạt workflow | Có cảnh báo K02 chưa gắn hạng mục khoán nhưng vẫn kích hoạt được; POST `/api/contracts/workflow/.../activate` trả `200` và chuyển sang `Đang vận hành`. Cần xác nhận policy chặn hay cho phép. |
| BUG-003 | Trung bình | Checklist workflow | Node hiển thị `Đã phân bổ 0 / Chưa phân bổ 31`; nhân viên mở HĐ `002/BK-2026` thấy thiếu `11/11` giấy bắt buộc. Workflow vẫn được kích hoạt, tạo rủi ro không thể hoàn tất. |
| BUG-004 | Trung bình | Nhân viên Đo Vẽ mở task | Màn hình gọi API không thuộc phase: legal dossier/submission trả `403`, handover trả `400`. Đã xác nhận cả trên browser network và Docker log. |
| BUG-005 | Thấp | Nhận việc | Bấm `Nhận trọn` khi đang có việc trả `422` và console error dù UI đã hiển thị thông báo nghiệp vụ. |
| BUG-006 | Thấp | Avatar | Request ảnh avatar từ `localhost:9000` bị `ERR_BLOCKED_BY_ORB`, khả năng CORS/ORB. |
| BUG-007 | Trung bình | Nộp nghiệm thu K01 | UI báo `Không thể nộp K01` do thiếu giấy nhưng nút `Nộp nghiệm thu` vẫn mở modal và cho phép `Vẫn nộp nghiệm thu`; thông điệp và hành vi không nhất quán. |

## Đã kiểm tra đạt

- `nguyenvana`: chỉ thấy `Lịch trình`, `Hồ Sơ Đo Vẽ`, `Lương`; task Đo Vẽ tải được.
- `tuongvy`: chỉ thấy `Lịch trình`, `Hồ Sơ Pháp Lý`, `Lương`; cả ba tab tải được, không có console error mới.
- `myhang`: chỉ thấy `Lịch trình`, `Hồ Sơ Pháp Lý`, `Lương`; cả ba tab tải được, không có console error mới.
- Admin tải được các module: Tổng Quan, CRM, Khách Hàng, Hồ Sơ Đo Vẽ, Hồ Sơ Pháp Lý, Hợp Đồng, Timeline, Hàng Chờ Duyệt, Mẫu Giấy Tờ, Thu Chi Sổ Quỹ, KPI, Nhân Sự & Đào Tạo, Cấu Hình.
- Modal preview file hợp đồng mở được. Modal preview file khách gửi mở được: PDF có iframe/link mở tab mới/tải xuống; DOCX hiển thị nội dung preview/fallback mà không phát sinh lỗi mới.
- MinIO bucket `wiki-files` xác nhận cơ chế nhiều file đang lưu được: HĐ 014 có 3 file nguồn, HĐ 015 có 4 file nguồn, HĐ 016 có 6 file nguồn.
- Backend container `bachkhoa-erp-dev-backend-1` đang `healthy`; các API module đã kiểm tra trả `200` theo Docker log. Các lỗi `403/400/422` ở trên cũng xuất hiện trong log tương ứng.

## Ghi chú

- BUG-002 và BUG-003 cần product owner chốt policy, nhưng trạng thái hiện tại nên được xem là rủi ro logic quy trình.
- Có thao tác kích hoạt workflow test 016 và các yêu cầu miễn/sửa đã có sẵn trong dữ liệu test; không chạy migration hay chỉnh DB thủ công.

## Verification after implementation - 2026-08-28

### Automated verification

- Frontend npm test: 72 files, 307 tests passed.
- Frontend npm run build: passed; only the standard Vite large-chunk warning.
- Backend focused workflow tests: 11 passed.
- Backend full suite on a fresh disposable DB: 524 passed, 35 skipped, 12 failed, 1 warning. The 12 failures are baseline test-fixture/schema gaps for migration-only tables or columns; no unrelated fixes were added.

### Playwright acceptance evidence

- Admin saw all 13 modules; no getAccessToken reference error.
- The form retained 6 customer files in browser cache; DOCX and PDF preview worked before save.
- Contract 017/BK-2026 was created with one generate 200 response and six source-document upload requests, all 200.
- UI/storage showed 7 source files; all 7 were opened sequentially after save and each preview modal showed the correct file.
- nguyenvana had Lich trinh, Ho So Do Ve, Luong. tuongvy and myhang had Lich trinh, Ho So Phap Ly, Luong.
- Backend Docker logs during acceptance had no ERROR, Traceback, NoSuchKey, or addressLocation entries.

### Residual findings

- Some employee avatar metadata points to missing MinIO objects, so the application-origin proxy returns 404. No direct localhost:9000, ORB, or CORS issue remains.
- Activation/K01/claim focused regression tests pass; the current UI dataset has no safe conflict/mandatory-mapping fixture for a complete browser replay.
- GitNexus is stale and FTS is unavailable; detect_changes still maps CRITICAL/300 flows incorrectly to unrelated abort flows. The changed files and symbols were manually reviewed.
