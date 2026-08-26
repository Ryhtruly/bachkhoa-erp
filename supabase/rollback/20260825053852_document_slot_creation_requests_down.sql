-- LÙI migration 20260825094000_document_slot_creation_requests.
--
-- Hai bảng này chỉ giữ QUAN HỆ và quyết định duyệt. Xoá chúng KHÔNG mất tệp:
-- object trên MinIO/R2 và dòng dossier_documents vẫn còn nguyên, các ô giấy đã
-- được duyệt tạo ra cũng ở lại (chúng đã là một phần của sổ giấy tờ).
--
-- Cái mất là LỊCH SỬ ĐỀ XUẤT: ai xin thêm loại giấy gì, vì sao, ai duyệt hay từ
-- chối với lý do nào. Nên sao lưu trước.
create table if not exists public.document_slot_creation_requests_backup_20260825 as
select * from public.document_slot_creation_requests;

create table if not exists public.document_slot_creation_request_documents_backup_20260825 as
select * from public.document_slot_creation_request_documents;

-- Bảng nối đi trước: khoá ngoại ghép của nó trỏ vào unique (id, contract_id) của
-- bảng đề xuất, còn nó thì bảng kia không drop được.
alter table public.document_slot_creation_request_documents
  drop constraint if exists slot_creation_request_documents_request_fk,
  drop constraint if exists slot_creation_request_documents_document_fk;

drop table if exists public.document_slot_creation_request_documents;

alter table public.document_slot_creation_requests
  drop constraint if exists document_slot_creation_requests_checklist_fk;

drop table if exists public.document_slot_creation_requests;
