-- Migration C3 — đánh dấu đã đọc cho feed thông báo.
--
-- ── Vì sao cần feed, trong khi đã có chuông ─────────────────────────────────
-- Chuông hiện dựng bằng truy vấn SUY RA: nó chỉ thấy việc ĐANG CẦN LÀM (còn chờ
-- duyệt, còn chờ nộp). Sự kiện ĐÃ XẢY RA thì suy không ra — "hồ sơ của bạn vừa
-- được duyệt đạt" biến mất ngay khi bước đi tiếp, và nhân viên không bao giờ
-- thấy nó.
--
-- Nội dung sự kiện đã nằm sẵn ở task_node_events. Thứ duy nhất còn thiếu là dấu
-- vết ai đã đọc cái gì — đúng ba cột.
--
-- ── Vì sao KHÔNG thêm cột "is_read" vào task_node_events ────────────────────
-- Một sự kiện có nhiều người nhận: nhân viên bị trả bài, người phụ trách bước
-- trước, Giám đốc. Một cột boolean trên sự kiện thì người đầu tiên đọc là tắt
-- luôn thông báo của mọi người còn lại.

begin;

create table if not exists public.notification_reads (
  user_id  character varying(50) not null
           references public.users(id) on delete cascade,
  event_id character varying(50) not null
           references public.task_node_events(id) on delete cascade,
  read_at  timestamp with time zone not null default now(),
  primary key (user_id, event_id)
);

-- Feed hỏi "sự kiện nào user này CHƯA đọc" trên mỗi lần bấm chuông. Khoá chính
-- (user_id, event_id) đã phục vụ đúng chiều tra cứu đó.
comment on table public.notification_reads is
  'Ai đã đọc sự kiện nào. Không đặt cờ đã-đọc lên chính task_node_events vì một '
  'sự kiện có nhiều người nhận — người đầu tiên đọc sẽ tắt thông báo của những '
  'người còn lại.';

commit;
