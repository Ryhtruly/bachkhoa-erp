-- Đảm bảo bất biến nghiệp vụ: Mỗi bước tác nghiệp (task node) chỉ được có tối đa 1 người
-- chịu trách nhiệm chính (is_primary = true) ở các trạng thái còn hiệu lực ('proposed', 'assigned', 'accepted').
-- Tuyệt đối ngăn chặn trường hợp hệ thống hay thao tác ngoài ý muốn sinh ra 2 người chính cùng 1 node.

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_node_assignments_single_primary
ON public.task_node_assignments (task_node_id)
WHERE is_primary AND assignment_status IN ('proposed', 'assigned', 'accepted');

-- Chỉ mục tối ưu hóa tải cho 10.000 hợp đồng vận hành đồng thời (Bể việc & Chuyển bước)
CREATE INDEX IF NOT EXISTS idx_task_nodes_active_pool
ON public.task_nodes (status, deadline_at, created_at)
WHERE status IN ('ready', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_workflow_instances_running_status
ON public.workflow_instances (status)
WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_task_node_assignments_active_lookup
ON public.task_node_assignments (task_node_id, role_code, employee_id)
WHERE assignment_status IN ('proposed', 'assigned', 'accepted');

