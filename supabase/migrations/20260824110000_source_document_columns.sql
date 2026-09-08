-- Kho nguồn: bốn cột cho việc "một tờ giấy có nhiều đời".
--
-- Vì sao cần: khách đưa lại bản scan rõ hơn, hoặc cơ quan trả hồ sơ bắt làm lại
-- giấy. Ghi đè lên tệp cũ là mất dấu — bộ hồ sơ đã nộp tuần trước dùng bản nào
-- thì không ai truy lại được nữa. Nạp bản mới thành MỘT dòng riêng, trỏ ngược về
-- bản nó thay, thì cả hai đời cùng còn và tra được.
--
-- dossier_documents hiện có 0 dòng nên không có backfill. Mọi cột vẫn để default
-- an toàn để lần chạy sau trên môi trường đã có dữ liệu cũng không hỏng.

alter table public.dossier_documents
  add column if not exists checksum_sha256 varchar(64),
  add column if not exists revision_no integer not null default 1,
  add column if not exists supersedes_id varchar,
  add column if not exists doc_status varchar not null default 'DANG_DUNG';

comment on column public.dossier_documents.checksum_sha256 is
  'SHA-256 của nội dung tệp. Dùng để CẢNH BÁO trùng, không dùng để chặn.';
comment on column public.dossier_documents.revision_no is
  'Đời thứ mấy của cùng một tờ giấy. Bản đầu là 1.';
comment on column public.dossier_documents.supersedes_id is
  'Trỏ về bản mà dòng này thay thế. Null nghĩa là bản đầu tiên.';
comment on column public.dossier_documents.doc_status is
  'DANG_DUNG | DA_THAY_THE (có bản mới) | KHONG_HOP_LE (mờ, sai giấy) | DA_GO (gỡ khỏi hồ sơ, vẫn giữ tệp).';

-- Ràng buộc thêm sau, dùng drop-rồi-add để chạy lại được nhiều lần.
alter table public.dossier_documents
  drop constraint if exists dossier_documents_supersedes_fk;
alter table public.dossier_documents
  add constraint dossier_documents_supersedes_fk
  foreign key (supersedes_id) references public.dossier_documents(id) on delete set null;

alter table public.dossier_documents
  drop constraint if exists dossier_documents_supersedes_self_check;
alter table public.dossier_documents
  add constraint dossier_documents_supersedes_self_check
  check (supersedes_id is null or supersedes_id <> id);

alter table public.dossier_documents
  drop constraint if exists dossier_documents_revision_no_check;
alter table public.dossier_documents
  add constraint dossier_documents_revision_no_check
  check (revision_no >= 1);

alter table public.dossier_documents
  drop constraint if exists dossier_documents_doc_status_check;
alter table public.dossier_documents
  add constraint dossier_documents_doc_status_check
  check (doc_status in ('DANG_DUNG', 'DA_THAY_THE', 'KHONG_HOP_LE', 'DA_GO'));

-- Tra trùng trong phạm vi một hợp đồng: cùng tờ CCCD nạp hai lần thì báo, không
-- cấm. Cố tình nạp lại là chuyện có thật (bản scan lần hai rõ hơn), nên KHÔNG
-- đặt unique ở đây — một ràng buộc unique sẽ chặn đúng thao tác hợp lệ đó.
create index if not exists dossier_documents_checksum_idx
  on public.dossier_documents (contract_id, checksum_sha256)
  where checksum_sha256 is not null;

-- Câu hỏi thường gặp nhất của kho nguồn: "hợp đồng này còn giấy nào đang dùng".
create index if not exists dossier_documents_contract_status_idx
  on public.dossier_documents (contract_id, doc_status, uploaded_at desc);

-- Một bản chỉ được đúng một bản kế thay nó: cấm rẽ nhánh đời tài liệu, vì rẽ
-- nhánh rồi thì câu "bản mới nhất của tờ này là bản nào" hết có câu trả lời.
create unique index if not exists uq_dossier_documents_supersedes
  on public.dossier_documents (supersedes_id)
  where supersedes_id is not null;
