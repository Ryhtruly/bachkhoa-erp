alter table public.task_node_acceptances
  alter column submitted_at set default now();
