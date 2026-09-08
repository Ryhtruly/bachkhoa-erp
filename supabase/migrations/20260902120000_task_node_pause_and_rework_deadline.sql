-- Migration C2 — tạm dừng ở CẤP BƯỚC, và hạn sửa bài riêng khi bị kéo về.
--
-- ── Vì sao không dùng lại legal_dossiers.sub_status ──────────────────────────
-- Máy tạm dừng hiện có nằm ở hồ sơ pháp lý, mà CHỈ gói Pháp lý trọn gói mới sinh
-- hồ sơ. Gói Đo vẽ không có dòng nào ở legal_dossiers, nên K05a của gói đó không
-- tạm dừng được — dù đó chính là bước hay phải chờ cơ quan nhất.
--
-- Đặt ở task_nodes thì mọi gói dùng được, và đúng ý "Đo vẽ không theo dõi vòng
-- đời hồ sơ" mà vẫn dừng được đồng hồ.
--
-- ── Vì sao paused_seconds là cột riêng ──────────────────────────────────────
-- KPI phải trừ quãng nằm chờ. Tính bằng cách quét lịch sử sự kiện mỗi lần đọc là
-- đắt và dễ sai khi dừng–chạy nhiều lần. Cộng dồn vào một cột lúc bấm Tiếp tục
-- thì đọc KPI chỉ còn một phép trừ.
--
-- ── Vì sao rework_deadline_at tách khỏi deadline_at ─────────────────────────
-- Bước bị kéo về sửa thì hạn ban đầu gần như chắc chắn đã trôi qua. Dùng lại nó
-- là bước vừa mở lại đã đỏ quá hạn dù nhân viên chưa kịp làm gì — và mọi cảnh
-- báo trễ từ đó thành vô nghĩa.

begin;

alter table public.task_nodes
  add column if not exists pause_reason_type  text,
  add column if not exists paused_at          timestamp with time zone,
  add column if not exists paused_note        text,
  add column if not exists paused_seconds     bigint not null default 0,
  add column if not exists rework_deadline_at timestamp with time zone;

alter table public.task_nodes
  drop constraint if exists task_nodes_pause_reason_check,
  drop constraint if exists task_nodes_pause_pair_check,
  drop constraint if exists task_nodes_paused_seconds_check;

alter table public.task_nodes
  add constraint task_nodes_pause_reason_check
    check (pause_reason_type is null
           or pause_reason_type in ('AGENCY', 'SURVEYOR', 'INTERNAL')),
  -- Hai cột phải đi CÙNG NHAU. Có mốc mà không có lý do thì giao diện không nói
  -- được đang chờ ai; có lý do mà không có mốc thì lúc bấm Tiếp tục không biết
  -- cộng dồn bao nhiêu giây — và quãng chờ đó biến mất khỏi KPI.
  add constraint task_nodes_pause_pair_check
    check ((pause_reason_type is null) = (paused_at is null)),
  add constraint task_nodes_paused_seconds_check
    check (paused_seconds >= 0);

-- Bảng điều hành hỏi "đang có bước nào nằm chờ" khá thường xuyên.
create index if not exists task_nodes_paused_idx
  on public.task_nodes (pause_reason_type, paused_at)
  where pause_reason_type is not null;

comment on column public.task_nodes.pause_reason_type is
  'AGENCY (chờ cơ quan) | SURVEYOR (chờ đo vẽ sửa) | INTERNAL (chờ nội bộ). '
  'Null nghĩa là đang chạy. Luôn đi cùng paused_at.';
comment on column public.task_nodes.paused_seconds is
  'Tổng số giây đã nằm chờ, cộng dồn qua các lần dừng. KPI lấy thời gian trôi '
  'TRỪ đi cột này — nhân viên không bị tính giờ cho việc mình không gây ra.';
comment on column public.task_nodes.rework_deadline_at is
  'Hạn CẤP MỚI khi bước bị kéo về sửa. Không đụng deadline_at: hạn cũ đã trôi '
  'qua, dùng lại là bước vừa mở lại đã đỏ quá hạn.';

commit;
