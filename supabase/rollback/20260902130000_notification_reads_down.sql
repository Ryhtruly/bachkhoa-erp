-- LÙI Migration C3.
--
-- Xoá bảng chỉ mất dấu ĐÃ ĐỌC, không mất sự kiện nào — nội dung thông báo vẫn
-- nằm nguyên ở task_node_events. Hệ quả: mọi thông báo cũ hiện lại như chưa đọc.

begin;
drop table if exists public.notification_reads;
commit;
