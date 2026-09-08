-- Hoàn tác 20260825124500_document_slot_waiver.sql
--
-- CẢNH BÁO: gỡ cột kind/revoked_at làm MẤT toàn bộ lịch sử miễn giấy — các hồ
-- sơ đang dựa vào một phiếu miễn đã duyệt sẽ đòi lại giấy đó ngay lập tức và
-- không còn chỗ nào đọc được lý do vì sao trước đó nó được bỏ. Chỉ chạy khi
-- chưa có phiếu WAIVE nào được duyệt.

do $$
declare so_phieu int;
begin
  select count(*) into so_phieu
  from public.document_slot_change_requests
  where kind = 'WAIVE';
  if so_phieu > 0 then
    raise exception 'Đang có % phiếu miễn giấy. Gỡ cột sẽ mất lịch sử — xử lý xong rồi mới hoàn tác.', so_phieu;
  end if;
end $$;

drop index if exists public.ux_slot_waive_active;
drop index if exists public.ix_slot_change_requests_slot_kind;

alter table public.document_slot_change_requests
  drop constraint if exists document_slot_change_requests_kind_check;
alter table public.document_slot_change_requests
  drop constraint if exists document_slot_change_requests_revoke_check;

alter table public.document_slot_change_requests
  drop column if exists kind,
  drop column if exists revoked_at,
  drop column if exists revoked_by;

alter table public.dossier_document_slots
  drop column if exists confirmed_by,
  drop column if exists confirmed_at;
