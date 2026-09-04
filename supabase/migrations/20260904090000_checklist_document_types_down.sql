drop index if exists public.ux_tpl_app_combo;

alter table public.document_template_applicabilities
  drop constraint if exists document_template_applicabilities_shape_check;
alter table public.document_template_applicabilities
  add constraint document_template_applicabilities_shape_check
  check (
    (applicability_type = 'GLOBAL'
      and service_package_id is null and task_type_id is null)
    or (applicability_type = 'PACKAGE'
      and service_package_id is not null and task_type_id is null)
    or (applicability_type = 'TASK_TYPE'
      and task_type_id is not null and service_package_id is null)
  );

drop table if exists public.checklist_result_document_type_files;
drop table if exists public.checklist_result_document_types;
