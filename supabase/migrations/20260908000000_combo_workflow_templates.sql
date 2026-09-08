-- Bổ sung liên kết Combo (Gói + Hạng mục) và cờ Mặc định cho workflow_templates
ALTER TABLE public.workflow_templates 
ADD COLUMN IF NOT EXISTS service_package_id VARCHAR NULL REFERENCES public.service_packages(id) ON DELETE SET NULL;

ALTER TABLE public.workflow_templates 
ADD COLUMN IF NOT EXISTS task_type_id VARCHAR NULL REFERENCES public.task_types(id) ON DELETE SET NULL;

ALTER TABLE public.workflow_templates 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Index tìm kiếm nhanh theo Combo
CREATE INDEX IF NOT EXISTS idx_workflow_templates_combo 
ON public.workflow_templates (service_package_id, task_type_id, status);

-- Mỗi Combo chỉ có tối đa 1 mẫu quy trình được đánh dấu là Mặc định (is_default = true)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_templates_combo_default 
ON public.workflow_templates (service_package_id, task_type_id) 
WHERE is_default = true AND status = 'published';

