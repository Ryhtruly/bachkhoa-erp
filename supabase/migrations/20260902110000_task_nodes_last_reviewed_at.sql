-- Migration C1 — mốc duyệt gần nhất của bước, để gom thông báo theo đợt.
--
-- Tách khỏi phần còn lại của migration C (tạm dừng ở cấp bước) vì thông báo gộp
-- cần đúng cột này và không cần gì thêm. Gộp cả cụm lại chỉ để apply một lần là
-- buộc phần chưa viết xong phải lên cùng phần đã xong.
--
-- ── Cột này nghĩa là gì ──────────────────────────────────────────────────────
-- KHÔNG phải "lần duyệt gần nhất trong lịch sử". Nó là **cờ còn tồn đọng**:
--
--   not null  →  có phán quyết đã ghi mà CHƯA gom vào thông báo nào
--   null      →  không còn gì để gom
--
-- Duyệt một tờ thì đặt mốc; chốt đợt thì xoá mốc. Nhờ vậy lượt quét chốt lười
-- chỉ phải nhìn đúng những bước còn nợ thông báo, thay vì mỗi lần bấm chuông là
-- quét cả bảng giấy tờ tìm max(reviewed_at) — mà chuông thì được gọi liên tục.
--
-- Lịch sử "ai duyệt tờ nào lúc nào" vẫn nằm nguyên ở
-- checklist_result_document_links.reviewed_at, không mất đi đâu.

begin;

alter table public.task_nodes
  add column if not exists last_reviewed_at timestamp with time zone;

-- Chỉ bước đang chờ nghiệm thu VÀ còn phán quyết chưa gom mới phải quét. Index
-- từng phần giữ cho lượt quét rẻ kể cả khi bảng bước đã rất dài.
create index if not exists task_nodes_pending_review_flush_idx
  on public.task_nodes (last_reviewed_at)
  where status = 'submitted' and last_reviewed_at is not null;

comment on column public.task_nodes.last_reviewed_at is
  'Cờ CÒN TỒN ĐỌNG: có phán quyết từng tờ chưa gom vào thông báo đợt nào. Duyệt '
  'một tờ thì đặt, chốt đợt thì xoá. Không phải lịch sử duyệt — lịch sử nằm ở '
  'checklist_result_document_links.reviewed_at.';

commit;
