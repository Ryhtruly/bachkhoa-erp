-- audit_log đang ghi được LOẠI đối tượng mà không ghi được ĐỐI TƯỢNG NÀO.
--
-- object_type='dossier_document' rồi phải mò id trong payload_json dạng text —
-- không lọc được, không đánh chỉ mục được. Câu hỏi "tờ giấy này ai từng đụng
-- vào" hiện phải quét toàn bảng và tự parse chuỗi.
--
-- Cột nullable, không default, không đụng 442 dòng cũ: dòng cũ vẫn null và vẫn
-- đọc được như trước.

alter table public.audit_log
  add column if not exists object_id varchar;

comment on column public.audit_log.object_id is
  'Id của đối tượng bị tác động, đi kèm object_type. Null với dòng ghi trước 2026-08.';

create index if not exists audit_log_object_idx
  on public.audit_log (object_type, object_id, created_at desc)
  where object_id is not null;
