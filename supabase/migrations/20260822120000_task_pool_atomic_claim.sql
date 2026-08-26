-- Phase 1: the absence of an active assignment means a READY Node is in the
-- shared task pool. This partial index is the database-level last line of
-- defence when Redis is unavailable or two API workers race each other.
create unique index if not exists uq_task_node_active_role_claim
    on public.task_node_assignments (task_node_id, role_code)
    where assignment_status in ('proposed', 'assigned', 'accepted');

