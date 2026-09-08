-- Kho giấy tờ của Hồ sơ pháp lý, tách theo GIAI ĐOẠN của chuỗi K.
--
-- Vì sao là bảng riêng chứ không phải cột jsonb như evidence_data: đây là kho
-- nhiều người cùng thêm/xoá (nhân viên soạn, người đi nộp, người nhận kết quả).
-- Ghi vào một mảng jsonb là đọc-sửa-ghi, hai lần upload cùng lúc sẽ nuốt mất
-- một file. Mỗi file một dòng thì không có cửa cho chuyện đó.
create table if not exists public.legal_dossier_documents (
  id varchar primary key default gen_random_uuid()::text,
  dossier_id varchar not null
    references public.legal_dossiers(id) on delete cascade,
  service_line_id varchar not null
    references public.service_lines(id) on delete restrict,
  contract_id varchar not null
    references public.contracts(id) on delete restrict,

  -- Giai đoạn quyết định file này thuộc về bước nào của chuỗi K:
  --   soan-ho-so  = K04 Soạn bộ hồ sơ pháp lý
  --   nop-co-quan = K05 Nộp & theo dõi hồ sơ
  --   ket-qua     = K06 Nhận kết quả & bàn giao
  stage varchar not null,
  -- Trường dữ liệu trong tab Hồ sơ pháp lý mà file này lấp vào (nếu có).
  slot_key varchar,
  task_node_id varchar references public.task_nodes(id) on delete set null,

  object_key text not null unique,
  file_name varchar not null,
  content_type varchar,
  size_bytes bigint,
  note text,
  uploaded_by varchar,
  uploaded_at timestamptz not null default now(),

  constraint legal_dossier_documents_stage_check
    check (stage in ('soan-ho-so', 'nop-co-quan', 'ket-qua'))
);

create index if not exists legal_dossier_documents_dossier_idx
  on public.legal_dossier_documents (dossier_id, stage, uploaded_at desc);

create index if not exists legal_dossier_documents_service_line_idx
  on public.legal_dossier_documents (service_line_id);
