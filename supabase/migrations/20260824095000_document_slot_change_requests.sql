-- Phiếu xin sửa TÀI LIỆU CHUYỂN GIAO của bộ phận khác.
-- Cùng khuôn với workflow_rollback_requests: nhân viên nêu lý do, Giám đốc duyệt
-- mới mở khoá. Duyệt xong ô giấy mở 24 giờ rồi tự đóng lại, tránh mở một lần
-- rồi sửa mãi về sau.
create table if not exists public.document_slot_change_requests (
  id varchar primary key default gen_random_uuid()::text,
  slot_id varchar not null
    references public.dossier_document_slots(id) on delete cascade,
  requested_by varchar not null,
  reason text not null,
  status varchar not null default 'pending',
  reviewed_by varchar,
  reviewed_at timestamptz,
  review_note text,
  unlocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_slot_change_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists document_slot_change_requests_slot_idx
  on public.document_slot_change_requests (slot_id, status);

create unique index if not exists uq_document_slot_change_one_pending
  on public.document_slot_change_requests (slot_id)
  where status = 'pending';
