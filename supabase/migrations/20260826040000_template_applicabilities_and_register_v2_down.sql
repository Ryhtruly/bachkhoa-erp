-- Hoàn tác 20260826040000_template_applicabilities_and_register_v2.sql
--
-- CẢNH BÁO: gỡ document_template_applicabilities làm MẤT mọi phạm vi PACKAGE và
-- GLOBAL do Giám đốc khai tay — cột task_type_id cũ chỉ giữ lại được phạm vi
-- TASK_TYPE. Gỡ document_register_version làm mọi Hạng mục version 2 quay về
-- đọc bộ ô cấp Hợp đồng, tức đếm trùng CCCD/Sổ đỏ.
-- Chỉ chạy khi chưa có Hạng mục nào ở version 2 và chưa khai phạm vi mới nào.

do $$
declare so_v2 int; so_pham_vi_moi int; so_input int;
begin
  select count(*) into so_v2
  from public.service_lines where document_register_version = 2;
  if so_v2 > 0 then
    raise exception 'Có % Hạng mục đang ở version 2. Gỡ cột sẽ làm chúng đếm trùng ô giấy.', so_v2;
  end if;

  -- Phạm vi sinh ra từ backfill thì gỡ được (task_type_id cũ còn giữ);
  -- phạm vi PACKAGE hoặc GLOBAL khai thêm sau đó thì không tái tạo được.
  select count(*) into so_pham_vi_moi
  from public.document_template_applicabilities a
  where a.applicability_type = 'PACKAGE'
     or (a.applicability_type = 'GLOBAL'
         and exists (select 1 from public.document_checklist_templates t
                     where t.id = a.template_id and t.task_type_id is not null));
  if so_pham_vi_moi > 0 then
    raise exception 'Có % phạm vi khai tay không nằm trong cột cũ — gỡ là mất hẳn.', so_pham_vi_moi;
  end if;

  select count(*) into so_input
  from public.document_slot_creation_requests
  where kind = 'INPUT' or status = 'needs_more';
  if so_input > 0 then
    raise exception 'Có % phiếu INPUT hoặc needs_more. Xử lý xong rồi mới hoàn tác.', so_input;
  end if;
end $$;

drop index if exists public.ix_slot_change_requests_service_line;
drop index if exists public.ux_slot_waive_active;
create unique index if not exists ux_slot_waive_active
  on public.document_slot_change_requests (slot_id)
  where kind = 'WAIVE' and status = 'approved' and revoked_at is null;

alter table public.document_slot_change_requests
  drop column if exists service_line_id;

alter table public.document_slot_creation_requests
  drop constraint if exists document_slot_creation_requests_status_check;
alter table public.document_slot_creation_requests
  add constraint document_slot_creation_requests_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected'));
alter table public.document_slot_creation_requests
  drop constraint if exists document_slot_creation_requests_kind_check;
alter table public.document_slot_creation_requests
  drop column if exists kind;

drop table if exists public.document_template_applicabilities;

alter table public.service_lines
  drop constraint if exists service_lines_document_register_version_check;
alter table public.service_lines
  drop column if exists document_register_version;
