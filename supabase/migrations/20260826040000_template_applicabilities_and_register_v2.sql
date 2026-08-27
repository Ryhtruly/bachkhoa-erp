-- Bộ giấy tờ: phạm vi áp dụng nhiều-nhiều, và sổ giấy neo theo HẠNG MỤC.
--
-- Bốn phần độc lập nhưng phải đi cùng một đợt vì phần 4 (phiếu miễn) chỉ đúng
-- phạm vi khi phần 1 (đánh dấu phiên bản sổ) đã có mặt.

-- ── 1. Dấu hiệu phân biệt mô hình cũ / mới ───────────────────────────────────
-- Không được đọc UNION mù quáng ô cấp Hợp đồng (cũ) với ô cấp Hạng mục (mới):
-- CCCD sẽ bị đếm hai lần. Mỗi Hạng mục phải tự khai mình đang ở mô hình nào.
--
-- Cũng KHÔNG được suy ra phiên bản từ created_at hay từ "đã có slot chưa" —
-- một Hạng mục hợp lệ hoàn toàn có thể chọn 0 loại giấy, lúc đó "chưa có slot"
-- là kết quả đúng chứ không phải dấu hiệu của mô hình cũ.
--
-- default 1: mọi dòng đang chạy giữ nguyên cách đọc cũ. Hạng mục mới phải được
-- mã nguồn ghi 2 một cách TƯỜNG MINH — không mặc định 2 để tránh cảnh dữ liệu
-- cũ bỗng đổi cách đọc chỉ vì migration chạy qua.
alter table public.service_lines
  add column if not exists document_register_version smallint not null default 1;

alter table public.service_lines
  drop constraint if exists service_lines_document_register_version_check;
alter table public.service_lines
  add constraint service_lines_document_register_version_check
  check (document_register_version in (1, 2));

comment on column public.service_lines.document_register_version is
  '1 = đọc bộ ô giấy cấp Hợp đồng (legacy); 2 = chỉ đọc slot đã materialize riêng cho Hạng mục';


-- ── 2. Phạm vi áp dụng của một loại giấy ─────────────────────────────────────
-- Một loại giấy dùng được cho nhiều gói, nhiều loại Hạng mục, hoặc toàn hệ
-- thống. Một FK duy nhất trên bảng mẫu không diễn tả nổi quan hệ đó.
--
-- Dùng hai cột FK THẬT thay vì cặp (type, id) đa hình: đa hình thì Postgres
-- không kiểm được id có tồn tại hay không, xoá một Dạng hồ sơ là để lại phạm vi
-- trỏ vào hư không mà không ai biết.
create table if not exists public.document_template_applicabilities (
  id                  varchar primary key default gen_random_uuid()::text,
  template_id         varchar not null
                        references public.document_checklist_templates(id) on delete cascade,
  applicability_type  varchar not null,
  service_package_id  varchar references public.service_packages(id),
  task_type_id        varchar references public.task_types(id),
  -- Có nằm trong phạm vi là một chuyện, có được tick sẵn lúc soạn hợp đồng hay
  -- không là chuyện khác: giấy "nếu có" nên xuất hiện trong danh sách mà không
  -- tự bật.
  is_default          boolean not null default true,
  created_by          varchar,
  created_at          timestamptz not null default now()
);

alter table public.document_template_applicabilities
  drop constraint if exists document_template_applicabilities_shape_check;
alter table public.document_template_applicabilities
  add constraint document_template_applicabilities_shape_check
  check (
    (applicability_type = 'GLOBAL'
      and service_package_id is null and task_type_id is null)
    or (applicability_type = 'PACKAGE'
      and service_package_id is not null and task_type_id is null)
    or (applicability_type = 'TASK_TYPE'
      and task_type_id is not null and service_package_id is null)
  );

-- Mỗi phạm vi chỉ được khai một lần cho một mẫu. Khai trùng thì lúc gợi ý sẽ
-- đổ ra hai dòng giống hệt nhau và người dùng tưởng là hai loại giấy khác nhau.
create unique index if not exists ux_tpl_app_global
  on public.document_template_applicabilities (template_id)
  where applicability_type = 'GLOBAL';

create unique index if not exists ux_tpl_app_package
  on public.document_template_applicabilities (template_id, service_package_id)
  where applicability_type = 'PACKAGE';

create unique index if not exists ux_tpl_app_task_type
  on public.document_template_applicabilities (template_id, task_type_id)
  where applicability_type = 'TASK_TYPE';

-- Tra ngược "gói/hạng mục này có những mẫu nào" là truy vấn nóng của màn soạn
-- hợp đồng, chạy mỗi lần đổi Hạng mục.
create index if not exists ix_tpl_app_package
  on public.document_template_applicabilities (service_package_id)
  where applicability_type = 'PACKAGE';
create index if not exists ix_tpl_app_task_type
  on public.document_template_applicabilities (task_type_id)
  where applicability_type = 'TASK_TYPE';

-- Chuyển dữ liệu sẵn có sang mô hình mới. Cột document_checklist_templates
-- .task_type_id được GIỮ NGUYÊN và ngừng đọc — expand–contract, gỡ ở một đợt
-- riêng sau khi mã nguồn đã đọc hẳn từ bảng này.
insert into public.document_template_applicabilities
    (template_id, applicability_type, task_type_id, is_default)
select t.id, 'TASK_TYPE', t.task_type_id, true
from public.document_checklist_templates t
where t.task_type_id is not null
on conflict do nothing;

insert into public.document_template_applicabilities
    (template_id, applicability_type, is_default)
select t.id, 'GLOBAL', true
from public.document_checklist_templates t
where t.task_type_id is null
on conflict do nothing;


-- ── 3. Luồng đề xuất dùng chung cho tài liệu ĐẦU RA và ĐẦU VÀO ───────────────
-- Không dựng luồng đề xuất thứ hai: cùng một hành vi (nhân viên khai thứ chưa
-- được cấu hình, sếp duyệt) thì phải cùng một bảng, cùng một màn duyệt.
alter table public.document_slot_creation_requests
  add column if not exists kind varchar not null default 'OUTPUT';

alter table public.document_slot_creation_requests
  drop constraint if exists document_slot_creation_requests_kind_check;
alter table public.document_slot_creation_requests
  add constraint document_slot_creation_requests_kind_check
  check (kind in ('OUTPUT', 'INPUT'));

-- 'needs_more' = Giám đốc trả lại để bổ sung. Khác 'rejected' ở chỗ phiếu còn
-- sống: nhân viên sửa/thêm tệp rồi gửi lại chính phiếu đó, không phải khai lại
-- từ đầu và không làm mất dấu vết lần gửi trước.
alter table public.document_slot_creation_requests
  drop constraint if exists document_slot_creation_requests_status_check;
alter table public.document_slot_creation_requests
  add constraint document_slot_creation_requests_status_check
  check (status in ('draft', 'pending', 'needs_more', 'approved', 'rejected'));

comment on column public.document_slot_creation_requests.kind is
  'OUTPUT = tài liệu đầu ra của checklist; INPUT = loại giấy phát sinh thiếu trong sổ';


-- ── 4. Phiếu miễn phải neo đúng Hạng mục ─────────────────────────────────────
-- Slot cấp Hợp đồng (legacy) được nhiều Hạng mục dùng chung. Miễn theo slot_id
-- không thôi thì miễn cho Hạng mục đo vẽ sẽ làm Hạng mục pháp lý hết đòi giấy
-- luôn — hồ sơ nộp lên cơ quan bị trả về mà không ai hiểu vì sao.
alter table public.document_slot_change_requests
  add column if not exists service_line_id varchar
    references public.service_lines(id);

-- CHƯA bắt buộc WAIVE phải có service_line_id ở đợt này: mã nguồn đang chạy
-- (request_slot_waiver viết ở bước trước) chưa truyền cột đó, siết ngay là gãy
-- ngay giây migration chạy xong. Ràng buộc nằm ở đợt CONTRACT, sau khi mã nguồn
-- đã ghi đủ và preflight xác nhận không còn dòng thiếu.
-- Xem supabase/pending/CHUA_DUYET_waive_service_line_not_null.sql

-- Một ô + một Hạng mục chỉ có ĐÚNG MỘT phiếu miễn còn hiệu lực. coalesce để
-- phiếu chưa neo Hạng mục (dữ liệu cũ) vẫn nằm trong quy tắc chứ không lọt.
drop index if exists public.ux_slot_waive_active;
create unique index if not exists ux_slot_waive_active
  on public.document_slot_change_requests (slot_id, coalesce(service_line_id, ''))
  where kind = 'WAIVE' and status = 'approved' and revoked_at is null;

create index if not exists ix_slot_change_requests_service_line
  on public.document_slot_change_requests (service_line_id)
  where kind = 'WAIVE';

comment on column public.document_slot_change_requests.service_line_id is
  'Hạng mục mà quyết định này có hiệu lực. Bắt buộc với phiếu WAIVE — miễn cho Hạng mục A không được ảnh hưởng Hạng mục B';
