# Contract Workflow — Handoff

Ngày: 2026-08-28  
Branch: `feature/accounting-module`

## Kết luận bàn giao

Đã hoàn tất và kiểm tra các lỗi thuộc phạm vi contract workflow:

- Preview file trong modal hoạt động với DOCX và PDF; DOCX có fallback khi renderer không đọc được nội dung.
- Upload nhiều file hoạt động: đã kiểm tra 6 file khách gửi, cả 6 file được đăng ký lên storage; cùng với file hợp đồng sinh ra là 7 file nguồn.
- Realtime ContractWorkspace đã sửa auth token và cleanup subscription.
- Kích hoạt workflow đã có blocker/warning rõ ràng cho checklist chưa phân bổ và hạng mục khoán chưa mapping.
- Validation nhận việc và claim UI đã xử lý đúng các business response dự kiến.
- Employee portal đã giới hạn API theo phase/task, tránh gọi nhầm Legal/Handover endpoint.
- Avatar private storage đã đi qua authenticated proxy; không còn gọi trực tiếp MinIO từ browser.

## Thay đổi đã tích hợp

- Lane A: `d44166a`, `9fd6ffe`, `0591d42`
- Lane B: `830418e`, `f22bcdd`, `c10c1f2`
- Lane C: `033b4ee`, `191328b`, `898c58b`, `acbfd69`, `6de0c83`, `903815d`

## Bằng chứng kiểm thử

- Frontend: `npm test` — 72 files, 307 tests passed.
- Frontend build: `npm run build` passed.
- Backend focused workflow tests: 11 passed.
- Playwright authenticated flow:
  - Admin mở được đầy đủ module.
  - Tạo hợp đồng `017/BK-2026` thành công.
  - 6 file khách gửi được upload thành công.
  - Preview lần lượt đủ 7 file sau khi lưu.
  - `POST /api/contracts/generate` trả 200; 6 request source-document đều trả 200.
- Docker backend không có `ERROR`, `Traceback`, `NoSuchKey` hoặc `addressLocation` trong luồng acceptance.

## Blocker ngoài phạm vi hiện tại

Full backend suite trên database test mới còn 12 failure thuộc nhóm fixture/schema/migration:

1. Thiếu `service_lines.document_register_version` trong test schema.
2. Thiếu bảng `task_nodes` trong customer API fixture.
3. Hai test SQL của Hồ sơ Đo vẽ/Hồ sơ Pháp lý thiếu schema migration tương ứng.
4. Một test Employee Portal phụ thuộc fixture/schema chưa đầy đủ.
5. Bảy test survey live-status/SQL phụ thuộc fixture/schema chưa đầy đủ.

Các lỗi này cần người phụ trách backend/database đồng bộ migration và test bootstrap. Không tự ý sửa database trong handoff này.

## Việc người nhận cần làm tiếp

- [ ] Đồng bộ test database bootstrap với toàn bộ migration hiện hành.
	- [ ] Bổ sung bảng/cột còn thiếu vào migration hoặc fixture đúng nguồn.
	- [ ] Chạy lại full backend suite trên database sạch.
- [ ] Xác nhận policy product cho workflow thiếu mapping/checklist.
- [ ] Bổ sung QA cho lịch riêng của `tuongvy` và `myhang`.
- [ ] Quyết định xử lý placeholder trong DOCX preview.
- [ ] Cân nhắc trạng thái từng file và retry riêng khi batch upload có file lỗi.

## Lưu ý commit

Không commit/push nếu chưa kiểm tra lại diff cuối cùng và `gitnexus detect_changes`. Full backend suite hiện chưa xanh do blocker database nêu trên; nếu team chấp nhận bàn giao với blocker này, commit chỉ nên chứa thay đổi contract workflow và tài liệu QA/handoff, không chứa thay đổi database.
