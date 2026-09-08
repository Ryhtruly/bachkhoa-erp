-- Bảng nối "tệp nguồn ↔ ô giấy": tách CHỖ CHỨA khỏi PHÂN LOẠI.
--
-- CCCD của một chủ đất là MỘT tờ. Hợp đồng ba hạng mục thì tờ đó nằm trong cả ba
-- bộ hồ sơ, nhưng chỉ được nạp lên đúng một lần. Cột dossier_documents.slot_id
-- (một tệp — một ô) không diễn tả được điều đó: nó buộc phải nhân bản tệp, đúng
-- thứ nghiệp vụ đã cấm.
--
-- Cột slot_id cũ KHÔNG bị xoá trong migration này. Giai đoạn 1 ghi cả hai, chạy
-- ổn rồi mới bỏ ở một migration sau — bỏ ngay thì không còn đường lùi.

create table if not exists public.dossier_document_links (
  id varchar primary key default gen_random_uuid()::text,
  contract_id varchar not null references public.contracts(id) on delete restrict,
  document_id varchar not null,
  slot_id varchar not null,

  -- Gỡ nối là hành vi có chủ ý, không phải xoá dòng: hồ sơ từng có tờ đó thì
  -- vẫn phải đọc lại được là ai gỡ, gỡ lúc nào.
  link_status varchar not null default 'DANG_DUNG',
  note text,
  linked_by varchar,
  linked_at timestamptz not null default now(),
  unlinked_by varchar,
  unlinked_at timestamptz,

  constraint dossier_document_links_status_check
    check (link_status in ('DANG_DUNG', 'DA_GO')),
  constraint dossier_document_links_unlinked_check
    check (
      (link_status = 'DANG_DUNG' and unlinked_at is null)
      or (link_status = 'DA_GO' and unlinked_at is not null)
    )
);

-- Một cặp (tệp, ô) chỉ có đúng một dòng. Nối lại sau khi gỡ là UPDATE dòng cũ
-- về DANG_DUNG, không phải INSERT dòng mới; lịch sử nối/gỡ nhiều lần nằm ở
-- audit_log, không nhân bản ở đây.
create unique index if not exists uq_dossier_document_links_pair
  on public.dossier_document_links (document_id, slot_id);

create index if not exists dossier_document_links_slot_idx
  on public.dossier_document_links (slot_id, link_status);
create index if not exists dossier_document_links_document_idx
  on public.dossier_document_links (document_id, link_status);

-- ── Chốt chặn nối chéo hợp đồng — bằng cấu trúc, không bằng trigger ──────────
--
-- Hai khoá ngoại ghép dưới đây dùng CHUNG cột contract_id. Nên một dòng chỉ tồn
-- tại được khi tệp VÀ ô giấy cùng thuộc đúng hợp đồng đó; lệch một cái là
-- Postgres từ chối ngay. Không có trigger nào để viết sai, không có đường lách
-- qua ngả INSERT thẳng vào DB.
--
-- Hai unique bên dưới trùng nghĩa với khoá chính (id vốn đã duy nhất) — chúng chỉ
-- ở đây vì khoá ngoại ghép bắt buộc phải có, không thêm ràng buộc nghiệp vụ nào.
--
-- Thêm bằng DO chứ không drop-rồi-add: một khi khoá ngoại ghép đã trỏ vào, lệnh
-- drop sẽ bị Postgres từ chối vì có đối tượng phụ thuộc. Chạy lại migration lần
-- hai mà chết giữa chừng là kiểu hỏng khó gỡ nhất.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_dossier_documents_id_contract'
  ) then
    alter table public.dossier_documents
      add constraint uq_dossier_documents_id_contract unique (id, contract_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uq_dossier_document_slots_id_contract'
  ) then
    alter table public.dossier_document_slots
      add constraint uq_dossier_document_slots_id_contract unique (id, contract_id);
  end if;
end $$;

-- on delete restrict cả hai phía: xoá ô giấy hay xoá tệp mà kéo theo mối nối là
-- âm thầm làm mỏng hồ sơ. Muốn xoá thì gỡ nối trước — một thao tác có người ký.
alter table public.dossier_document_links
  drop constraint if exists dossier_document_links_document_fk;
alter table public.dossier_document_links
  add constraint dossier_document_links_document_fk
  foreign key (document_id, contract_id)
  references public.dossier_documents (id, contract_id) on delete restrict;

alter table public.dossier_document_links
  drop constraint if exists dossier_document_links_slot_fk;
alter table public.dossier_document_links
  add constraint dossier_document_links_slot_fk
  foreign key (slot_id, contract_id)
  references public.dossier_document_slots (id, contract_id) on delete restrict;
