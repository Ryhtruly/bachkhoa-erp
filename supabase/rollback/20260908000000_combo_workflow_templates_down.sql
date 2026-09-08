DROP INDEX IF EXISTS public.idx_workflow_templates_combo_default;
DROP INDEX IF EXISTS public.idx_workflow_templates_combo;

ALTER TABLE public.workflow_templates DROP COLUMN IF EXISTS is_default;
ALTER TABLE public.workflow_templates DROP COLUMN IF EXISTS task_type_id;
ALTER TABLE public.workflow_templates DROP COLUMN IF EXISTS service_package_id;

