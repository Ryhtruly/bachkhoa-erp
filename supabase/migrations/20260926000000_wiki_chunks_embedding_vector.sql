-- wiki_chunks.embedding was created as TEXT in production while the ORM maps it
-- to pgvector Vector(3072). Every chatbot search runs
-- `embedding <=> '...'::vector`, which fails on TEXT ("operator does not exist:
-- text <=> vector"); the error is swallowed, so the assistant never finds a
-- Wiki passage and always answers with the hand-off message.
--
-- Converts the column in place. Existing rows (if any) hold pgvector's text form
-- "[0.1,0.2,...]" and cast directly; rows that do not are dropped so the
-- indexing worker re-embeds their documents. Idempotent: does nothing when the
-- column is already a vector.

begin;

create extension if not exists vector;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'wiki_chunks'
      and column_name = 'embedding'
      and data_type <> 'USER-DEFINED'
  ) then
    delete from wiki_chunks
    where embedding is not null and btrim(embedding) !~ '^\[.*\]$';

    alter table wiki_chunks
      alter column embedding type vector(3072) using nullif(btrim(embedding), '')::vector(3072);
  end if;
end
$$;

commit;
