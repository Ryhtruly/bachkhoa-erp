begin;

alter table public.contracts
  add column if not exists contract_template_id varchar(50)
  references public.contract_templates(id) on delete restrict;

create index if not exists contracts_contract_template_id_idx
  on public.contracts (contract_template_id);

insert into public.contract_templates
  (code, version, name, description, template_file_name, template_storage_key,
   storage_provider, placeholder_schema, render_rules, status)
values
  ('HOP_DONG_DICH_VU_KHUNG_BACH_KHOA', 1,
   'Hợp đồng dịch vụ khung Bách Khoa 2026',
   'Mẫu khung dùng chung cho dịch vụ đo đạc, pháp lý nhà đất và xây dựng.',
   'mau_hop_dong.docx',
   'contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx',
   's3-compatible', '[]'::jsonb, '{}'::jsonb, 'published'),
  ('MAU_HOP_DONG_DO_DAC_BACH_KHOA', 1,
   'Mẫu hợp đồng đo đạc Bách Khoa',
   'Mẫu hợp đồng dành cho dịch vụ đo đạc.',
   'Mau_Hop_Dong_Do_Dac_Bach_Khoa.docx',
   'contract-templates/MAU_HOP_DONG_DO_DAC_BACH_KHOA/v1.docx',
   's3-compatible', '[]'::jsonb, '{}'::jsonb, 'published')
on conflict (code, version) do update
set name = excluded.name,
    description = excluded.description,
    template_file_name = excluded.template_file_name,
    template_storage_key = excluded.template_storage_key,
    storage_provider = excluded.storage_provider,
    status = excluded.status,
    updated_at = now();

commit;
