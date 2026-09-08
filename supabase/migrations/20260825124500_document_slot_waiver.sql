-- Miễn một loại giấy cho đúng một hồ sơ, thay vì nhét file giả cho qua cổng.
--
-- Trước đây khi mẫu đòi một tờ giấy mà ca cụ thể không có (chủ đất độc thân,
-- hợp đồng Cắm mốc không dính hôn nhân, sổ đang thế chấp ngân hàng...) thì
-- không còn đường nào: không sửa được is_required, không gỡ được ô sinh từ mẫu,
-- Giám đốc tắt mẫu cũng chỉ ảnh hưởng hợp đồng MỚI. Nhân viên buộc phải tải đại
-- một tệp vào ô cho nộp được K01 — sổ sách ghi nhận một thứ không có thật.
--
-- Tái dùng bảng phiếu sẵn có thay vì dựng bảng mới: nó đã có đủ reason, status,
-- reviewed_by/at và review_note (chỗ Giám đốc ghi còn thiếu giấy gì để làm được
-- hạng mục này). Chỉ thiếu một cột phân biệt loại phiếu.

-- 'UNLOCK' = phiếu xin mở khoá sửa ô của phòng ban khác (hành vi đang chạy).
-- 'WAIVE'  = phiếu xin bỏ hẳn một loại giấy khỏi hồ sơ này.
-- Default 'UNLOCK' để mọi dòng cũ giữ nguyên đúng nghĩa cũ, không cần backfill.
alter table public.document_slot_change_requests
  add column if not exists kind varchar not null default 'UNLOCK',
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by varchar;

alter table public.document_slot_change_requests
  drop constraint if exists document_slot_change_requests_kind_check;
alter table public.document_slot_change_requests
  add constraint document_slot_change_requests_kind_check
  check (kind in ('UNLOCK', 'WAIVE'));

-- Rút lại phải ghi rõ ai rút: bỏ miễn nghĩa là hồ sơ đòi giấy trở lại, đó là
-- thay đổi có hệ quả nên phải truy được trách nhiệm.
alter table public.document_slot_change_requests
  drop constraint if exists document_slot_change_requests_revoke_check;
alter table public.document_slot_change_requests
  add constraint document_slot_change_requests_revoke_check
  check (revoked_at is null or revoked_by is not null);

-- Một ô chỉ được có ĐÚNG MỘT phiếu miễn còn hiệu lực. Không có ràng buộc này
-- thì hai người cùng xin, sếp duyệt cả hai, rút một cái vẫn còn cái kia — ô
-- trông như đã bỏ miễn mà thực tế vẫn đang được miễn.
create unique index if not exists ux_slot_waive_active
  on public.document_slot_change_requests (slot_id)
  where kind = 'WAIVE' and status = 'approved' and revoked_at is null;

-- Truy vấn nóng: k01_blockers hỏi "ô này có đang được miễn không" cho từng ô,
-- mỗi lần mở màn K01 và mỗi lần nộp nghiệm thu.
create index if not exists ix_slot_change_requests_slot_kind
  on public.document_slot_change_requests (slot_id, kind, status);

-- Ô do nhân viên tự khai giữa chừng (template_id is null) cần dấu Giám đốc đã
-- nhìn qua. Không dùng để chặn — ô tự thêm vốn không bắt buộc — chỉ để màn
-- duyệt biết mục nào còn chờ mắt sếp.
alter table public.dossier_document_slots
  add column if not exists confirmed_by varchar,
  add column if not exists confirmed_at timestamptz;

comment on column public.document_slot_change_requests.kind is
  'UNLOCK = xin mở khoá sửa ô của phòng khác; WAIVE = xin bỏ loại giấy này khỏi hồ sơ';
comment on column public.dossier_document_slots.confirmed_by is
  'Giám đốc đã xác nhận ô do nhân viên tự khai; null = còn chờ duyệt';
