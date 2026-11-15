-- Never compare vectors produced by different embedding models.
drop function if exists public.match_personal_memory(extensions.vector, double precision, integer);

create or replace function public.match_personal_memory(
  query_embedding extensions.vector(2048),
  match_threshold float default 0.35,
  match_count int default 12,
  embedding_model_filter text default null
)
returns table(memory_item_id uuid, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select e.memory_item_id,
         (1 - (e.embedding <=> query_embedding))::float as similarity
  from public.memory_embeddings e
  join public.memory_items m on m.id = e.memory_item_id
  where e.user_id = (select auth.uid())
    and m.user_id = (select auth.uid())
    and (embedding_model_filter is null or e.embedding_model = embedding_model_filter)
    and (1 - (e.embedding <=> query_embedding)) >= match_threshold
  order by e.embedding <=> query_embedding asc
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_personal_memory(extensions.vector, double precision, integer, text) from public;
grant execute on function public.match_personal_memory(extensions.vector, double precision, integer, text) to authenticated;
