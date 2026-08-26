-- ĐỢT CONTRACT — CHƯA DUYỆT, CHƯA ĐƯỢC ĐƯA VÀO supabase/migrations/
--
-- Siết: phiếu miễn (WAIVE) bắt buộc phải neo vào một Hạng mục.
--
-- Chỉ chạy sau khi ĐỦ ba điều kiện:
--   1. Đợt EXPAND (20260826040000) đã apply và chạy ổn định
--   2. Mã nguồn đã deploy: request_slot_waiver tự suy service_line_id ở SERVER,
--      mọi nơi đọc/ghi phiếu miễn đã dùng cặp (service_line_id, slot_id)
--   3. Preflight bên dưới trả 0 dòng
--
-- Vì sao không gộp vào EXPAND: mã nguồn đang chạy chưa truyền service_line_id,
-- siết cùng lúc là hỏng ngay giây migration chạy xong — người dùng đang thao tác
-- sẽ ăn lỗi 500 trước khi kịp deploy code mới.

-- ── PREFLIGHT: phải trả 0 ─────────────────────────────────────────────────────
-- select count(*) as thieu_hang_muc
-- from public.document_slot_change_requests
-- where kind = 'WAIVE' and service_line_id is null;

-- ── BACKFILL cho dòng phát sinh trong khoảng chuyển tiếp ─────────────────────
-- Chỉ suy được khi ô giấy thuộc đúng MỘT Hạng mục. Ô cấp Hợp đồng (legacy) dùng
-- chung nhiều Hạng mục nên KHÔNG suy bừa — dòng nào không suy được phải để người
-- xử lý tay, vì đoán sai là miễn nhầm cho Hạng mục không liên quan.
do $$
declare khong_suy_duoc int;
begin
  update public.document_slot_change_requests r
  set service_line_id = s.service_line_id
  from public.dossier_document_slots s
  where s.id = r.slot_id
    and r.kind = 'WAIVE'
    and r.service_line_id is null
    and s.scope = 'SERVICE_LINE'
    and s.service_line_id is not null;

  select count(*) into khong_suy_duoc
  from public.document_slot_change_requests
  where kind = 'WAIVE' and service_line_id is null;

  if khong_suy_duoc > 0 then
    raise exception
      'Còn % phiếu miễn trên ô cấp Hợp đồng không suy được Hạng mục. Xử lý tay rồi mới siết.',
      khong_suy_duoc;
  end if;
end $$;

-- ── SIẾT ──────────────────────────────────────────────────────────────────────
alter table public.document_slot_change_requests
  drop constraint if exists document_slot_change_requests_waive_scope_check;
alter table public.document_slot_change_requests
  add constraint document_slot_change_requests_waive_scope_check
  check (kind <> 'WAIVE' or service_line_id is not null);
