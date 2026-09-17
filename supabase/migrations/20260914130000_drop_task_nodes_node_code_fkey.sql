-- Drop foreign key constraints on node_code so that custom/free-form node codes (e.g. N01, N02)
-- can be used in workflow instances without requiring them to exist in the static workflow_nodes catalog.
alter table public.task_nodes
  drop constraint if exists task_nodes_node_code_fkey;

alter table public.document_template_applicabilities
  drop constraint if exists document_template_applicabilities_node_code_fkey;

