-- Thêm giai đoạn 'nop-noi-nghiep' cho đầu ra của bước K05a.
--
-- K05a ("Nộp hồ sơ") nộp hồ sơ nội nghiệp trong công ty (chưa ra cơ quan nhà nước).
-- references.py ánh xạ K05a sang stage 'nop-noi-nghiep'.
-- Bổ sung 'nop-noi-nghiep' vào check constraint của dossier_documents để tránh CheckViolation.

alter table public.dossier_documents
  drop constraint if exists dossier_documents_stage_check;
alter table public.dossier_documents
  add constraint dossier_documents_stage_check
  check (stage in ('ho-so-goc', 'do-hien-truong', 'chuan-hoa-ky-thuat',
                   'soan-ho-so', 'nop-noi-nghiep', 'nop-co-quan', 'ket-qua'));
