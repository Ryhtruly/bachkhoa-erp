-- ĐỢT CONTRACT — CHƯA DUYỆT, CHƯA ĐƯỢC ĐƯA VÀO supabase/migrations/
--
-- Đổi default của service_lines.document_register_version từ 1 sang 2.
--
-- Vì sao cần: giữ default 1 vĩnh viễn thì MỘT đường INSERT bị bỏ quên sẽ âm thầm
-- tạo Hạng mục mới theo mô hình legacy — nó đọc bộ ô cấp Hợp đồng, đếm trùng
-- CCCD/Sổ đỏ, và không ai phát hiện cho tới khi hồ sơ ra sai.
--
-- Vì sao KHÔNG làm ngay ở EXPAND: lúc đó mã nguồn chưa ghi version tường minh,
-- default 2 sẽ làm Hạng mục tạo ra ngay sau migration đọc theo mô hình mới trong
-- khi slot của nó vẫn đang được sinh theo đường cũ.
--
-- Chỉ chạy sau khi ĐỦ:
--   1. Mã nguồn đã ghi document_register_version = 2 TƯỜNG MINH ở TẤT CẢ đường
--      tạo service_line (đã liệt kê và kiểm từng đường, không chỉ đường chính)
--   2. Smoke test live xác nhận Hạng mục mới ra version 2
--   3. Preflight bên dưới trả 0
--
-- Đổi default KHÔNG thay thế việc ghi tường minh trong mã nguồn — nó chỉ là lưới
-- an toàn cho đường nào lọt lưới.

-- ── PREFLIGHT: Hạng mục tạo gần đây phải đã là version 2 ─────────────────────
-- select document_register_version, count(*)
-- from public.service_lines
-- where created_at > now() - interval '7 days'
-- group by 1;
-- Kỳ vọng: chỉ có version 2. Còn dòng version 1 nghĩa là còn đường INSERT chưa sửa.

alter table public.service_lines
  alter column document_register_version set default 2;

comment on column public.service_lines.document_register_version is
  '1 = đọc bộ ô giấy cấp Hợp đồng (legacy); 2 = chỉ đọc slot materialize riêng cho Hạng mục. Mã nguồn phải ghi tường minh, default chỉ là lưới an toàn.';
