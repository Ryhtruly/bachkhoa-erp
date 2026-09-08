-- LÙI migration 20260825090000_checklist_result_document_links.
--
-- Chạy TRƯỚC bản lùi của 20260825085000.
--
-- Bảng này là quan hệ, không giữ tệp: xoá nó thì object trên MinIO/R2 và mọi
-- dòng dossier_documents vẫn còn nguyên. Cái mất là thông tin "checklist nào đã
-- nộp tài liệu nào" — nên vẫn sao lưu trước.
create table if not exists public.checklist_result_document_links_backup_20260825 as
select * from public.checklist_result_document_links;

alter table public.checklist_result_document_links
  drop constraint if exists checklist_result_document_links_checklist_fk;
alter table public.checklist_result_document_links
  drop constraint if exists checklist_result_document_links_document_fk;

drop table if exists public.checklist_result_document_links;
