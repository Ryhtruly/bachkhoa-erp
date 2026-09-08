-- GIAI ĐOẠN C (CONTRACT) — siết task_node_checklist_results.contract_id NOT NULL.
--
-- CHỈ chạy sau khi mã nguồn giai đoạn B đã lên và đang ghi contract_id cho mọi
-- dòng mới. Chạy sớm hơn sẽ làm hỏng việc tạo Node.
--
-- Ba việc, đúng thứ tự: preflight lại → lấp dòng phát sinh trong khoảng chuyển
-- tiếp → xác nhận 0 null rồi mới siết.

-- ── Bước 1. Preflight lại ───────────────────────────────────────────────────
-- Dữ liệu đã đổi kể từ giai đoạn A: có Hợp đồng mới, Hạng mục mới. Tin vào kết
-- quả preflight cũ là tin vào một tấm ảnh đã cũ.
do $$
declare
  loi record;
  so_loi int := 0;
  chi_tiet text := '';
begin
  for loi in
    select r.id as result_id, r.task_node_id,
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
    where r.contract_id is null
      and (n.id is null or wi.id is null or sl.id is null or sl.contract_id is null)
    order by r.id
    limit 50
  loop
    so_loi := so_loi + 1;
    chi_tiet := chi_tiet || format(E'\n  - checklist_result %s (task_node %s): %s',
                                   loi.result_id, loi.task_node_id, loi.ly_do);
  end loop;

  if so_loi > 0 then
    raise exception E'PREFLIGHT THẤT BẠI — % dòng còn null mà không suy ra được hợp đồng:%\n\nSửa dữ liệu rồi chạy lại. Migration KHÔNG tự đoán hợp đồng.',
      so_loi, chi_tiet;
  end if;
end $$;

-- ── Bước 2. Lấp các dòng sinh ra trong khoảng chuyển tiếp ────────────────────
update public.task_node_checklist_results r
set contract_id = sl.contract_id
from public.task_nodes n
join public.workflow_instances wi on wi.id = n.workflow_instance_id
join public.service_lines sl      on sl.id = wi.service_line_id
where n.id = r.task_node_id
  and r.contract_id is null;

-- ── Bước 3. Xác nhận sạch rồi mới siết ──────────────────────────────────────
do $$
declare so_null int;
begin
  select count(*) into so_null
    from public.task_node_checklist_results where contract_id is null;
  if so_null > 0 then
    raise exception 'CHƯA SIẾT ĐƯỢC — còn % dòng contract_id null.', so_null;
  end if;
end $$;

alter table public.task_node_checklist_results
  alter column contract_id set not null;
