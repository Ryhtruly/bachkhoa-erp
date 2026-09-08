alter table public.checklist_result_document_type_files
  add column status varchar,
  add column change_reason text,
  add column rejection_reason text,
  add column reviewed_by varchar references public.users(id),
  add column reviewed_at timestamptz;

update public.checklist_result_document_type_files f
set status = case t.status
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'pending_review' then 'pending_review'
      else 'draft'
    end,
    rejection_reason = case when t.status = 'rejected' then t.rejection_reason end,
    reviewed_by = case when t.status in ('approved', 'rejected') then t.reviewed_by end,
    reviewed_at = case when t.status in ('approved', 'rejected') then t.reviewed_at end
from public.checklist_result_document_types t
where t.id = f.document_type_id;

update public.checklist_result_document_type_files
set status = 'draft'
where status is null;

alter table public.checklist_result_document_type_files
  alter column status set default 'draft',
  alter column status set not null,
  add constraint checklist_result_document_type_files_status_check
    check (status in ('draft', 'pending_review', 'approved', 'rejected')),
  add constraint checklist_result_document_type_files_rejection_reason_check
    check (status <> 'rejected' or nullif(trim(rejection_reason), '') is not null);

-- Giữ nguyên tài liệu và phán quyết của các checklist đã chạy trước khi có
-- runtime document type. Một link legacy được ghép về đúng type qua ô giấy có
-- cùng template; hỗ trợ cả cột slot_id cũ lẫn bảng nối nhiều-nhiều hiện tại.
insert into public.checklist_result_document_type_files
    (document_type_id, document_id, status, rejection_reason,
     reviewed_by, reviewed_at, created_by, created_at)
select distinct on (runtime_type.id, legacy.document_id)
       runtime_type.id,
       legacy.document_id,
       legacy.review_status,
       legacy.rejection_reason,
       legacy.reviewed_by,
       legacy.reviewed_at,
       legacy.created_by,
       legacy.created_at
from public.checklist_result_document_links legacy
join public.dossier_documents document
  on document.id = legacy.document_id
 and document.contract_id = legacy.contract_id
join public.checklist_result_document_types runtime_type
  on runtime_type.checklist_result_id = legacy.checklist_result_id
 and runtime_type.template_id is not null
where exists (
  select 1
  from public.dossier_document_slots slot
  where slot.contract_id = legacy.contract_id
    and slot.template_id = runtime_type.template_id
    and (
      slot.id = document.slot_id
      or exists (
        select 1
        from public.dossier_document_links classified
        where classified.contract_id = legacy.contract_id
          and classified.document_id = legacy.document_id
          and classified.slot_id = slot.id
          and classified.link_status = 'DANG_DUNG'
      )
    )
)
order by runtime_type.id, legacy.document_id, legacy.created_at desc
on conflict (document_type_id, document_id) where is_active
do nothing;

-- Đồng bộ verdict cấp loại để checklist cũ quay về đúng trạng thái. File bị
-- từ chối được ưu tiên hơn file chờ duyệt; file đạt cũ không bị hạ trạng thái.
with file_summary as (
  select f.document_type_id,
         case
           when bool_or(f.status = 'rejected') then 'rejected'
           when bool_or(f.status = 'pending_review') then 'pending_review'
           when bool_and(f.status = 'approved') then 'approved'
           else 'draft'
         end as target_status,
         (array_agg(f.rejection_reason order by f.reviewed_at desc nulls last)
            filter (where f.status = 'rejected'))[1] as rejection_reason,
         (array_agg(f.reviewed_by order by f.reviewed_at desc nulls last)
            filter (where f.status = 'rejected'))[1] as rejected_by,
         (array_agg(f.reviewed_at order by f.reviewed_at desc nulls last)
            filter (where f.status = 'rejected'))[1] as rejected_at,
         (array_agg(f.reviewed_by order by f.reviewed_at desc nulls last)
            filter (where f.status = 'approved'))[1] as approved_by,
         (array_agg(f.reviewed_at order by f.reviewed_at desc nulls last)
            filter (where f.status = 'approved'))[1] as approved_at
  from public.checklist_result_document_type_files f
  where f.is_active
  group by f.document_type_id
)
update public.checklist_result_document_types runtime_type
set status = summary.target_status,
    rejection_reason = case
      when summary.target_status = 'rejected' then summary.rejection_reason
      else null
    end,
    reviewed_by = case summary.target_status
      when 'rejected' then summary.rejected_by
      when 'approved' then summary.approved_by
      else null
    end,
    reviewed_at = case summary.target_status
      when 'rejected' then summary.rejected_at
      when 'approved' then summary.approved_at
      else null
    end,
    updated_at = now()
from file_summary summary
where summary.document_type_id = runtime_type.id;

create index ix_checklist_document_type_files_review_status
  on public.checklist_result_document_type_files (document_type_id, status)
  where is_active;
