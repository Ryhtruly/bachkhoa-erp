-- CHƯA DUYỆT — CHƯA ĐƯỢC ĐƯA VÀO supabase/migrations/
--
-- Nới uq_document_slot_change_one_pending để phiếu CHỜ DUYỆT cũng khoá theo
-- (ô giấy, Hạng mục) thay vì chỉ theo ô giấy.
--
-- Vì sao cần: đợt EXPAND 20260826 đã sửa chỉ số cho phiếu ĐÃ DUYỆT
--
--   ux_slot_waive_active  ON (slot_id, coalesce(service_line_id, ''))
--
-- nhưng bỏ sót chỉ số song song cho phiếu CHỜ DUYỆT, vẫn đang là
--
--   uq_document_slot_change_one_pending  ON (slot_id) WHERE status = 'pending'
--
-- Hậu quả với ô giấy cấp Hợp đồng (mô hình sổ V1) — loại ô mà nhiều Hạng mục
-- dùng chung: Hạng mục A gửi phiếu xin bỏ giấy X, thì Hạng mục B KHÔNG gửi được
-- phiếu cho chính giấy X nữa cho tới khi phiếu của A được quyết. Hai Hạng mục
-- độc lập nhau mà chặn nhau — đúng loại rò mà cả thiết kế neo phiếu theo
-- service_line_id sinh ra để tránh.
--
-- Mã nguồn hiện đã chặn trước bằng 409 có lời giải thích (register.py,
-- request_slot_waiver) nên không ai gặp 500, nhưng đó là băng dán: giới hạn
-- nghiệp vụ vẫn còn nguyên cho tới khi chạy migration này.
--
-- Mức rủi ro: THẤP. Đây là nới lỏng thuần tuý — mọi trạng thái đang hợp lệ với
-- chỉ số cũ đều hợp lệ với chỉ số mới. Không đụng dữ liệu, không đụng cột.
--
-- Chỉ chạy sau khi:
--   1. Người dùng duyệt
--   2. Preflight bên dưới trả 0

-- ── PREFLIGHT: phải trả 0 ─────────────────────────────────────────────────────
-- Nếu > 0 nghĩa là đang tồn tại trạng thái mà chỉ số MỚI cũng cấm — phải xử lý
-- tay trước, vì tạo chỉ số sẽ thất bại.
-- select count(*) from (
--   select slot_id, coalesce(service_line_id, '') as sl
--   from public.document_slot_change_requests
--   where status = 'pending'
--   group by 1, 2 having count(*) > 1
-- ) t;

drop index if exists public.uq_document_slot_change_one_pending;

create unique index if not exists uq_document_slot_change_one_pending
  on public.document_slot_change_requests (slot_id, coalesce(service_line_id, ''))
  where status = 'pending';

comment on index public.uq_document_slot_change_one_pending is
  'Mỗi (ô giấy, Hạng mục) chỉ có một phiếu chờ duyệt. Ô cấp Hợp đồng dùng chung nhiều Hạng mục nên KHÔNG được khoá theo slot_id đơn thuần.';
