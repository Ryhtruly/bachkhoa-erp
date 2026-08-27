-- Chuẩn hoá danh mục node về bộ mã liên tục K01..K07.
-- Đổi mã thật ở CẢ 4 nơi trong 1 transaction: danh mục, việc đang chạy,
-- graph của template và graph của revision. Đổi thiếu 1 nơi là lệch nghĩa
-- âm thầm (node vẫn chạy nhưng mang tên bước khác).
do $$
begin
  if not exists (select 1 from public.workflow_nodes where code = 'K08') then
    raise notice 'Danh mục đã ở bộ mã K01..K07, bỏ qua.';
    return;
  end if;

  -- FK không có ON UPDATE CASCADE nên phải tháo ra mới đổi được mã danh mục.
  alter table public.task_nodes drop constraint if exists task_nodes_node_code_fkey;

  -- K04/K07 hiện là 2 dòng stub tắt sẵn, không việc nào và không template nào
  -- trỏ tới -> dọn đi để nhường chỗ cho bước được đánh số lại.
  delete from public.workflow_nodes where code in ('K04', 'K07');

  -- Đổi tăng dần: mỗi bước đổi xong là giải phóng ô cho bước sau.
  update public.workflow_nodes set code = 'K04' where code = 'K05';
  update public.workflow_nodes set code = 'K05' where code = 'K06';
  update public.workflow_nodes set code = 'K06' where code = 'K08';
  update public.workflow_nodes set code = 'K07' where code = 'K09';

  update public.task_nodes
  set node_code = case node_code
        when 'K05' then 'K04'
        when 'K06' then 'K05'
        when 'K08' then 'K06'
        when 'K09' then 'K07'
      end
  where node_code in ('K05', 'K06', 'K08', 'K09');

  update public.workflow_templates t
  set graph = jsonb_set(t.graph, '{nodes}', (
        select jsonb_object_agg(
          e.key,
          case when e.value->>'task_code' in ('K05', 'K06', 'K08', 'K09')
            then jsonb_set(e.value, '{task_code}', to_jsonb(
                   case e.value->>'task_code'
                     when 'K05' then 'K04' when 'K06' then 'K05'
                     when 'K08' then 'K06' when 'K09' then 'K07' end))
            else e.value end)
        from jsonb_each(t.graph->'nodes') e))
  where jsonb_typeof(t.graph->'nodes') = 'object'
    and exists (
      select 1 from jsonb_each(t.graph->'nodes') e
      where e.value->>'task_code' in ('K05', 'K06', 'K08', 'K09'));

  update public.workflow_instance_revisions r
  set graph = jsonb_set(r.graph, '{nodes}', (
        select jsonb_object_agg(
          e.key,
          case when e.value->>'task_code' in ('K05', 'K06', 'K08', 'K09')
            then jsonb_set(e.value, '{task_code}', to_jsonb(
                   case e.value->>'task_code'
                     when 'K05' then 'K04' when 'K06' then 'K05'
                     when 'K08' then 'K06' when 'K09' then 'K07' end))
            else e.value end)
        from jsonb_each(r.graph->'nodes') e))
  where jsonb_typeof(r.graph->'nodes') = 'object'
    and exists (
      select 1 from jsonb_each(r.graph->'nodes') e
      where e.value->>'task_code' in ('K05', 'K06', 'K08', 'K09'));

  -- Gắn lại FK, lần này cho phép đổi mã lan xuống việc đang chạy.
  alter table public.task_nodes
    add constraint task_nodes_node_code_fkey
    foreign key (node_code) references public.workflow_nodes(code)
    on update cascade on delete restrict;
end $$;

-- Mô tả bước theo bản chuẩn 7 node.
update public.workflow_nodes set
  description = 'Tiếp nhận yêu cầu, kiểm tra sơ bộ giấy tờ đầu vào từ khách hàng',
  is_active = true where code = 'K01';
update public.workflow_nodes set
  description = 'Đo đạc thực địa, chụp ảnh hiện trạng, lấy toạ độ GPS RTK, cắm cọc mốc ranh giới',
  is_active = true where code = 'K02';
update public.workflow_nodes set
  description = 'Xử lý số liệu, vẽ bản đồ, tính diện tích, tự kiểm định và chuẩn hoá bộ hồ sơ kỹ thuật. Nghiệm thu node này = bàn giao đo vẽ sang pháp lý.',
  is_active = true where code = 'K03';
update public.workflow_nodes set
  description = 'Gom giấy tờ, soạn đơn, rà quy hoạch, hoàn thiện bộ hồ sơ trước khi nộp',
  is_active = true where code = 'K04';
update public.workflow_nodes set
  description = 'Nộp cơ quan nhà nước, lấy biên nhận, theo dõi tới khi có kết quả. Bao gồm cả các lần nộp lại khi bị yêu cầu bổ sung và cơ chế quay ngược node.',
  is_active = true where code = 'K05';
update public.workflow_nodes set
  description = 'Nhận kết quả, giao hồ sơ cho khách và lấy chữ ký xác nhận. Đồng thời phải thu đủ tiền hợp đồng thì mới đóng được bước này.',
  is_active = true where code = 'K06';
update public.workflow_nodes set
  description = 'Chuẩn hoá tên file, lưu vào thư mục Hạng mục, scan số hóa, lưu kho bản cứng, đóng hồ sơ.',
  is_active = true where code = 'K07';
