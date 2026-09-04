-- Tách K05 thành K05a/K05b và thêm trục NODE cho Master Data giấy tờ.
--
-- ── Vì sao tách K05 ──────────────────────────────────────────────────────────
-- Một hồ sơ đi qua HAI lần nộp khác hẳn nhau, do hai phòng khác nhau làm, sinh
-- ra hai loại giấy khác nhau:
--
--   K05a  Nộp hồ sơ             phòng Đo vẽ   — nộp kỹ thuật / nội nghiệp,
--                                                sinh phiếu nộp nội nghiệp
--   K05b  Nộp & theo dõi hồ sơ  phòng Pháp lý — nộp cơ quan một cửa,
--                                                sinh biên nhận, giấy hẹn
--
-- Gộp làm một thì không khai được "phiếu nộp nội nghiệp thuộc K05a" còn "biên
-- nhận một cửa thuộc K05b" — đúng thứ mô hình bốn trục cần phân biệt.
--
-- KHÔNG xoá dòng K05: task_nodes.node_code có khoá ngoại trỏ tới nó, và các
-- graph đã publish trong workflow_instance_revisions vẫn tham chiếu khoá "k05".
-- Xoá là vỡ hết quy trình cũ. Chỉ tắt is_active để nó thôi xuất hiện khi chọn.
--
-- ── Vì sao thêm trục NODE ────────────────────────────────────────────────────
-- Mô hình nghiệp vụ là bốn trục: Gói → Hạng mục → Node → Loại giấy. Ba trục đầu
-- đã có trong document_template_applicabilities. Trục Node hôm nay chỉ tồn tại
-- trong graph quy trình của TỪNG Hạng mục (output_documents trên mỗi mục
-- checklist) — cấu hình runtime, phải tick lại cho mỗi hợp đồng, không có nguồn
-- sự thật chung để đối chiếu.
--
-- Hậu quả đo được trước khi sửa: 0/31 loại giấy được gán vào bước nào. Giấy
-- không bước nào nhận thì không hiện ở màn nhân viên nào — không ai thu.
--
-- node_code NULLABLE có chủ đích: null = "chưa gán bước nào", đúng khái niệm
-- "chưa phân bổ" giao diện đã hiển thị. Siết NOT NULL là chặn hết 31 mẫu hiện có.
--
-- CHECK về hình dạng phạm vi (GLOBAL/PACKAGE/TASK_TYPE) GIỮ NGUYÊN: node_code là
-- chiều độc lập, cắt ngang cả ba. Một loại giấy khai được "toàn công ty, ở K01"
-- hoặc "riêng gói Đo vẽ, ở K03".

-- ── PREFLIGHT ────────────────────────────────────────────────────────────────
-- Bước K05 nào đã đi vào thực hiện thì đổi mã sẽ làm lịch sử ghi sai phòng ban.
do $$
declare da_chay int;
begin
  select count(*) into da_chay
  from public.task_nodes
  where node_code = 'K05' and status not in ('pending', 'ready');

  if da_chay > 0 then
    raise exception
      'Có % bước K05 đã đi vào thực hiện. Đổi mã lúc này làm lịch sử ghi sai phòng ban — xử lý tay trước.',
      da_chay;
  end if;
end $$;

-- ── 1. Danh mục Node ─────────────────────────────────────────────────────────
insert into public.workflow_nodes (code, name, description, is_active) values
  ('K05a', 'Nộp hồ sơ',
   'Nộp kỹ thuật / nội nghiệp — phòng Đo vẽ. Sinh phiếu nộp nội nghiệp.', true),
  ('K05b', 'Nộp & theo dõi hồ sơ',
   'Nộp cơ quan một cửa — phòng Pháp lý. Sinh biên nhận, giấy hẹn trả kết quả.', true)
on conflict (code) do nothing;

-- Bước đang chạy chuyển sang K05b: chúng đều là nộp cơ quan một cửa, đúng nghĩa
-- cũ của K05.
update public.task_nodes set node_code = 'K05b' where node_code = 'K05';

update public.workflow_nodes set is_active = false where code = 'K05';

comment on column public.workflow_nodes.code is
  'Mã bước chuẩn. K05 đã tách thành K05a (nộp nội nghiệp, Đo vẽ) và K05b (nộp một cửa, Pháp lý); K05 giữ lại nhưng tắt để graph cũ không vỡ.';

-- ── 2. Trục Node cho Master Data ─────────────────────────────────────────────
alter table public.document_template_applicabilities
  add column if not exists node_code varchar
    references public.workflow_nodes(code);

create index if not exists ix_template_applicability_node
  on public.document_template_applicabilities (node_code)
  where node_code is not null;

comment on column public.document_template_applicabilities.node_code is
  'Bước (K01..K07) mà loại giấy này thuộc về. NULL = chưa gán bước nào — giấy sẽ không hiện ở màn nhân viên nào, đó là khối lượng tồn đọng Giám đốc còn phải cấu hình.';
