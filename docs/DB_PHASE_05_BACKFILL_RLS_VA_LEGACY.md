# DB Phase 05 — Backfill, RLS và xử lý Legacy

Trạng thái: **Legacy cleanup đã hoàn thành; RLS toàn hệ thống còn mở**

> Chủ hệ thống xác nhận 1.683 `projects_tasks` là dữ liệu cũ/rác và yêu cầu xóa thay vì backfill. Migration `20260806162743` đã hoàn tất. Supabase MCP ngày 07/08/2026 vẫn cảnh báo 33 bảng public tắt RLS; không được bật hàng loạt nếu chưa có policy/test vai trò.

## 1. Mục tiêu

- ghi nhận quyết định không backfill 1.683 Task legacy;
- triển khai RLS theo vai trò;
- loại bỏ `projects_tasks` khỏi schema vận hành an toàn;
- không làm sai lịch sử lương hoặc trạng thái hồ sơ.

## 2. Quyết định cuối về Task legacy

Phân nhóm L1–L6 dưới đây là phương án lịch sử trước khi chủ hệ thống xác nhận dữ liệu cũ/rác. Không còn áp dụng backfill:

| Nhóm | Điều kiện | Xử lý |
|---|---|---|
| L1 | Có Contract + xác định được Gói/Hạng mục đáng tin cậy | Có thể tạo Service Line sau review |
| L2 | Có Contract nhưng Hạng mục mơ hồ | Đưa hàng đợi mapping thủ công |
| L3 | Hoàn thành nhưng thiếu ngày/nghiệm thu | Giữ lịch sử, không tự sinh Pay Event |
| L4 | Nộp thành công/chờ kết quả | Ưu tiên mapping hồ sơ pháp lý đang mở |
| L5 | Hủy | Giữ legacy, chỉ migrate nếu cần báo cáo thống nhất |
| L6 | Không đủ khóa tham chiếu | Không tự đoán; cần quyết định nghiệp vụ |

## 3. Quy tắc backfill — lưu lịch sử, không còn thực thi

- Không backfill bằng tên gần giống nếu không có bảng mapping được duyệt.
- Mỗi record phải ghi `migration_batch_id`, nguồn và confidence/reviewer.
- Không tạo acceptance giả cho Task đã hoàn thành.
- Không tạo entitlement hồi tố nếu không có bằng chứng nghiệm thu và người thực hiện đáng tin cậy.
- Workflow lịch sử có thể tạo Instance trạng thái `completed` với provenance rõ, nhưng không giả lập toàn bộ event nếu dữ liệu nguồn không có.
- Có báo cáo trước/sau theo Contract, trạng thái và số lượng.

## 4. RLS theo vai trò

Ma trận mục tiêu:

| Vai trò | Quyền chính |
|---|---|
| Giám đốc | Toàn bộ workflow, assignment, acceptance và payroll |
| Kế toán | Xem entitlement/điều chỉnh toàn công ty, lập kỳ lương; không mặc định nghiệm thu chuyên môn |
| Sales | Hợp đồng/Hạng mục và tiến độ tổng quan; không xem khoán cá nhân |
| Pháp Lý | Node/giấy tờ/Submission được giao |
| Đo Vẽ | Node kỹ thuật được giao |
| Nhân viên | Chỉ xem lương cá nhân |

Triển khai theo từng nhóm bảng, test bằng JWT/role thật. Không dùng `TO authenticated` đơn lẻ làm authorization.

## 5. Index và advisors

- xử lý FK chưa có index theo truy vấn thật;
- dùng partial index cho Node đang mở;
- chạy security advisor;
- chạy performance advisor;
- không xóa index chỉ vì advisor báo `unused` khi hệ thống mới chưa có traffic.

## 6. Kết quả đóng legacy

1. Luồng ghi mới đã chuyển sang Service Line/Workflow Instance.
2. Các phụ thuộc legacy rỗng được kiểm tra trước khi DROP.
3. `projects_tasks`, `task_submissions`, `task_pay_records`, `payroll_adjustments`, `kpi_payroll`, `stake_rates`, `task_type_rates` đã bị xóa.
4. Hai cột nullable thuộc tài chính/chat được giữ lại nhưng FK tới ProjectTask đã gỡ để tránh làm hỏng API độc lập.
5. Không còn dual-read hoặc thời hạn lưu bảng legacy.

## 7. Điều kiện hoàn tất

- [x] Chủ hệ thống đã quyết định không backfill dữ liệu ProjectTask cũ.
- [x] Không tạo entitlement hồi tố từ ProjectTask legacy.
- [ ] RLS được test cho mọi vai trò.
- [x] Không còn bảng/API ghi `projects_tasks`.
- [ ] Báo cáo hợp đồng, tiến độ và lương đã đối soát.
- [x] Không áp dụng thời hạn giữ bảng legacy vì chủ hệ thống đã phê duyệt xóa trực tiếp.
