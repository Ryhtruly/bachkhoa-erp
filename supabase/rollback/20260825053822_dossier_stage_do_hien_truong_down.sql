-- LÙI migration 20260825091000_dossier_stage_do_hien_truong.
--
-- CẢNH BÁO: lệnh này THẤT BẠI nếu còn dòng nào mang stage 'do-hien-truong'.
-- Đó là cố ý — tự động đổi chúng sang giai đoạn khác là đoán hộ người dùng tài
-- liệu K02 thuộc về đâu. Kiểm trước:
--
--   select count(*) from public.dossier_documents where stage = 'do-hien-truong';
--
-- Khác 0 thì phải quyết định chuyển chúng đi đâu trước khi chạy file này.

alter table public.dossier_documents
  drop constraint if exists dossier_documents_stage_check;
alter table public.dossier_documents
  add constraint dossier_documents_stage_check
  check (stage in ('ho-so-goc', 'chuan-hoa-ky-thuat', 'soan-ho-so',
                   'nop-co-quan', 'ket-qua'));
