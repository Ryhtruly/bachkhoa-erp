-- GIAI ĐOẠN A (EXPAND) — task_node_checklist_results.contract_id, còn NULLABLE.
--
-- Cột để nullable ở bước này là cố ý: mã nguồn cũ chưa ghi contract_id, mà dev và
-- live là cùng một database. Siết NOT NULL ngay sẽ làm mọi lệnh tạo Node hỏng
-- trong khoảng giữa hai lần triển khai. Giai đoạn C (M0b) mới siết, sau khi mã
-- mới đã chạy.
--
--
-- Vì sao cần: bảng nối checklist ↔ tài liệu chỉ mới chứng minh được TÀI LIỆU
-- thuộc hợp đồng nào. Muốn DB tự chặn "checklist của HĐ004 nối với tài liệu của
-- HĐ003" thì phía checklist cũng phải mang contract_id, rồi cả hai khoá ngoại
-- ghép dùng CHUNG cột đó. Không trigger.
--
-- Chuỗi suy ra hợp đồng:
--   task_node_checklist_results → task_nodes → workflow_instances
--     → service_lines.contract_id
--
-- Toàn chuỗi đang là ON DELETE RESTRICT / NO ACTION, nên khoá ngoại thêm ở đây
-- KHÔNG làm việc xoá hợp đồng khó hơn hiện tại.

-- ── Bước 1. Preflight: thà dừng còn hơn đoán ────────────────────────────────
-- Không tự gán hợp đồng cho dòng mồ côi. Một dòng gán sai là một tài liệu nối
-- nhầm hợp đồng, và sai kiểu đó không ai phát hiện ra cho tới lúc kiện tụng.
do $$
declare
  loi record;
  so_loi int := 0;
  chi_tiet text := '';
begin
  for loi in
    select r.id as result_id,
           r.task_node_id,
           case
             when n.id is null            then 'không tìm được task node'
             when wi.id is null           then 'không tìm được workflow instance'
             when sl.id is null           then 'không tìm được service line'
             when sl.contract_id is null  then 'service_lines.contract_id là null'
           end as ly_do
    from public.task_node_checklist_results r
    left join public.task_nodes n          on n.id  = r.task_node_id
    left join public.workflow_instances wi on wi.id = n.workflow_instance_id
    left join public.service_lines sl      on sl.id = wi.service_line_id
    where n.id is null or wi.id is null or sl.id is null or sl.contract_id is null
    order by r.id
    limit 50
  loop
    so_loi := so_loi + 1;
    chi_tiet := chi_tiet || format(E'\n  - checklist_result %s (task_node %s): %s',
                                   loi.result_id, loi.task_node_id, loi.ly_do);
  end loop;

  if so_loi > 0 then
    raise exception E'PREFLIGHT THẤT BẠI — % dòng không suy ra được hợp đồng:%\n\nSửa dữ liệu rồi chạy lại. Migration KHÔNG tự đoán hợp đồng.',
      so_loi, chi_tiet;
  end if;
end $$;

-- Một checklist result chỉ được ra đúng một hợp đồng. Chuỗi khoá ngoại ở trên
-- vốn là nhiều-một nên chuyện này không xảy ra được — kiểm ở đây để nếu mai kia
-- ai đổi quan hệ thì migration gãy ngay, thay vì âm thầm gán bừa.
do $$
declare so_loi int;
begin
  select count(*) into so_loi from (
    select r.id
    from public.task_node_checklist_results r
    join public.task_nodes n          on n.id  = r.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl      on sl.id = wi.service_line_id
    group by r.id
    having count(distinct sl.contract_id) > 1
  ) x;
  if so_loi > 0 then
    raise exception 'PREFLIGHT THẤT BẠI — % checklist result cho ra nhiều hợp đồng khác nhau.', so_loi;
  end if;
end $$;

-- ── Bước 2. Thêm cột và backfill ────────────────────────────────────────────
alter table public.task_node_checklist_results
  add column if not exists contract_id varchar;

update public.task_node_checklist_results r
set contract_id = sl.contract_id
from public.task_nodes n
join public.workflow_instances wi on wi.id = n.workflow_instance_id
join public.service_lines sl      on sl.id = wi.service_line_id
where n.id = r.task_node_id
  and r.contract_id is distinct from sl.contract_id;

-- ── Bước 3. Hậu kiểm backfill ───────────────────────────────────────────────
-- Dòng CŨ phải được lấp hết. Dòng MỚI sinh ra trong khoảng chuyển tiếp thì được
-- phép null cho tới giai đoạn C.
do $$
declare so_null int;
begin
  select count(*) into so_null
    from public.task_node_checklist_results where contract_id is null;
  if so_null > 0 then
    raise exception 'BACKFILL SÓT — còn % dòng contract_id null.', so_null;
  end if;
end $$;

-- KHÔNG "set not null" ở đây. Xem 20260825093000_..._contract.sql (giai đoạn C).

alter table public.task_node_checklist_results
  drop constraint if exists task_node_checklist_results_contract_fk;
alter table public.task_node_checklist_results
  add constraint task_node_checklist_results_contract_fk
  foreign key (contract_id) references public.contracts(id) on delete restrict;

-- Cần cho khoá ngoại ghép ở migration kế tiếp. Thêm bằng DO vì một khi khoá
-- ngoại ghép đã trỏ vào thì lệnh drop sẽ bị từ chối, chạy lại sẽ chết giữa chừng.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_task_node_checklist_results_id_contract'
  ) then
    alter table public.task_node_checklist_results
      add constraint uq_task_node_checklist_results_id_contract unique (id, contract_id);
  end if;
end $$;

comment on column public.task_node_checklist_results.contract_id is
  'Suy ra từ task_node → workflow_instance → service_line. Có mặt để khoá ngoại ghép chặn nối chéo Hợp đồng.';
