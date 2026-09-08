-- LÙI migration 20260824111000_dossier_document_links.
--
-- Chạy TRƯỚC bản lùi của 20260824110000.
--
-- Bảng nối là toàn bộ kết quả phân loại của K01. Xoá nó đi là hồ sơ mất phân
-- loại, dù tệp vẫn còn trong kho. Sao lưu là bắt buộc, không phải tuỳ chọn.
create table if not exists public.dossier_document_links_backup_20260824 as
select * from public.dossier_document_links;

alter table public.dossier_document_links
  drop constraint if exists dossier_document_links_slot_fk,
  drop constraint if exists dossier_document_links_document_fk;

drop table if exists public.dossier_document_links;

-- Hai unique ghép chỉ tồn tại để phục vụ khoá ngoại ghép ở trên; khoá ngoại đi
-- rồi thì chúng cũng hết việc.
alter table public.dossier_documents
  drop constraint if exists uq_dossier_documents_id_contract;
alter table public.dossier_document_slots
  drop constraint if exists uq_dossier_document_slots_id_contract;
