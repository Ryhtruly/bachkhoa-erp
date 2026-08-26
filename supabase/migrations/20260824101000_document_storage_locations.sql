-- Danh mục NƠI LƯU bản cứng.
--
-- Trước đây là ô gõ tự do: "Tủ 1", "tủ A", "kệ 2 ngăn 3" thành ba nơi khác nhau
-- của cùng một chỗ, và sáu tháng sau không ai tra được tờ giấy nằm đâu.
--
-- Quan trọng hơn: nơi lưu KHÔNG chỉ là cái tủ. Bản chính sổ đỏ có thể đang nằm
-- ở cơ quan, đã trả khách, hoặc nhân viên đang cầm đi nộp. Ô text làm mất hẳn
-- phân biệt đó — mà đó mới là thứ cần biết khi khách gọi hỏi giấy tờ của họ.
create table if not exists public.document_storage_locations (
  id varchar primary key default gen_random_uuid()::text,
  name varchar not null unique,
  kind varchar not null default 'TAI_CHO',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_storage_locations_kind_check
    check (kind in ('TAI_CHO', 'BEN_NGOAI'))
);

alter table public.dossier_document_slots
  add column if not exists storage_location_id varchar
    references public.document_storage_locations(id) on delete set null;

insert into public.document_storage_locations (name, kind, sort_order) values
  ('Tủ hồ sơ A',            'TAI_CHO',   10),
  ('Tủ hồ sơ B',            'TAI_CHO',   20),
  ('Tủ hồ sơ C',            'TAI_CHO',   30),
  ('Két sắt (bản chính)',   'TAI_CHO',   40),
  ('Kho lưu trữ',           'TAI_CHO',   50),
  ('Nhân viên đang giữ',    'BEN_NGOAI', 110),
  ('Đang ở cơ quan',        'BEN_NGOAI', 120),
  ('Đã trả khách',          'BEN_NGOAI', 130)
on conflict (name) do nothing;
