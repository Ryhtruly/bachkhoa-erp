-- LÙI migration 20260824110000_source_document_columns.
--
-- Thứ tự: chạy SAU bản lùi của 20260824111000 nếu migration đó đã lên, vì bảng
-- nối trỏ vào dossier_documents.
--
-- Xoá cột là MẤT dữ liệu trong cột đó. Nên sao lưu trước, không phải để dùng
-- ngay mà để lúc quyết định làm lại còn có cái đối chiếu.
create table if not exists public.dossier_documents_backup_20260824 as
select id, checksum_sha256, revision_no, supersedes_id, doc_status
  from public.dossier_documents;

drop index if exists public.uq_dossier_documents_supersedes;
drop index if exists public.dossier_documents_contract_status_idx;
drop index if exists public.dossier_documents_checksum_idx;

alter table public.dossier_documents
  drop constraint if exists dossier_documents_doc_status_check,
  drop constraint if exists dossier_documents_revision_no_check,
  drop constraint if exists dossier_documents_supersedes_self_check,
  drop constraint if exists dossier_documents_supersedes_fk;

alter table public.dossier_documents
  drop column if exists doc_status,
  drop column if exists supersedes_id,
  drop column if exists revision_no,
  drop column if exists checksum_sha256;
