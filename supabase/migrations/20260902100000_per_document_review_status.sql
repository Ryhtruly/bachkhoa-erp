-- Migration B — trạng thái duyệt theo TỪNG TỜ GIẤY.
--
-- ── Vì sao đặt ở checklist_result_document_links ─────────────────────────────
-- Ứng viên còn lại là dossier_document_slots, và đó là chỗ SAI. Ô giấy thuộc
-- phạm vi HỢP ĐỒNG: cùng một tờ sổ đỏ được dùng lại ở K01, K04 rồi K07. Đặt phán
-- quyết ở đó thì duyệt một lần là duyệt cho mọi bước, và kéo K03 về sửa sẽ hạ
-- luôn trạng thái tờ giấy mà K01 đã duyệt xong từ lâu.
--
-- Bảng nối này gắn giấy vào TỪNG mục checklist của TỪNG bước, nên mỗi bước có
-- phán quyết riêng — đúng thứ nghiệp vụ cần, và rollback một bước chỉ chạm đúng
-- các dòng của bước đó.
--
-- ── Không thêm is_adhoc ──────────────────────────────────────────────────────
-- Đặc tả có nhắc cột này cho "giấy phát sinh do Giám đốc thêm". Việc đó ĐÃ CÓ
-- bảng riêng: document_slot_creation_requests (kèm lý do, tên đề xuất, cờ
-- required_before_submit, needs_director_approval, và created_slot_id). Duyệt
-- một đề xuất là tạo thẳng ô giấy với is_required = required_before_submit, nên
-- "node không đóng được cho tới khi bổ sung" đã chạy sẵn qua cổng giấy bắt buộc.
-- Thêm một cờ boolean song song chỉ tạo ra nguồn sự thật thứ hai, nghèo hơn.
--
-- ── Không có trạng thái EMPTY ────────────────────────────────────────────────
-- "Chưa có giấy" là KHÔNG CÓ DÒNG NỐI, không phải một dòng mang trạng thái rỗng.
-- Dựng giá trị EMPTY là mời người ta tạo dòng nối trỏ vào hư không.

begin;

alter table public.checklist_result_document_links
  add column if not exists review_status    text not null default 'pending_review',
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by      character varying(50),
  add column if not exists reviewed_at      timestamp with time zone;

alter table public.checklist_result_document_links
  drop constraint if exists checklist_result_document_links_review_status_check,
  drop constraint if exists checklist_result_document_links_rejection_reason_check,
  drop constraint if exists checklist_result_document_links_reviewed_check,
  drop constraint if exists checklist_result_document_links_reviewed_by_fkey;

alter table public.checklist_result_document_links
  add constraint checklist_result_document_links_review_status_check
    check (review_status in ('pending_review', 'approved', 'rejected')),
  -- Từ chối mà không nêu lý do là bắt nhân viên đoán mình sai chỗ nào. Chặn ở
  -- ràng buộc chứ không chỉ ở giao diện: gọi thẳng API là qua mặt được giao diện.
  add constraint checklist_result_document_links_rejection_reason_check
    check (review_status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) >= 5),
  -- Đã có phán quyết thì phải biết AI quyết và quyết LÚC NÀO. Thiếu hai vế này
  -- thì lúc tranh chấp không truy được về đâu.
  add constraint checklist_result_document_links_reviewed_check
    check (review_status = 'pending_review'
           or (reviewed_by is not null and reviewed_at is not null)),
  add constraint checklist_result_document_links_reviewed_by_fkey
    foreign key (reviewed_by) references public.users(id) on delete set null;

-- Cổng đóng bước hỏi "còn tờ nào chưa duyệt xong không" trên MỖI lần đọc chi
-- tiết bước. Index từng phần vì chỉ dòng chưa xử mới phải quét.
create index if not exists checklist_result_document_links_pending_idx
  on public.checklist_result_document_links (checklist_result_id)
  where review_status = 'pending_review';

-- Gom một đợt duyệt theo mốc thời gian (thông báo tổng kết ở mục 6b) cần đọc
-- theo reviewed_at.
create index if not exists checklist_result_document_links_reviewed_idx
  on public.checklist_result_document_links (checklist_result_id, reviewed_at)
  where reviewed_at is not null;

comment on column public.checklist_result_document_links.review_status is
  'Phán quyết của Giám đốc cho tờ giấy này TẠI BƯỚC NÀY: pending_review | approved '
  '| rejected. Gán giấy vào mục checklist là dòng sinh ra ở pending_review.';
comment on column public.checklist_result_document_links.rejection_reason is
  'Bắt buộc khi rejected, tối thiểu 5 ký tự. Nhân viên đọc đúng dòng này để biết '
  'phải sửa gì.';
comment on column public.checklist_result_document_links.reviewed_by is
  'Người ra phán quyết. Không được để null cho dòng đã duyệt/đã từ chối.';

commit;
