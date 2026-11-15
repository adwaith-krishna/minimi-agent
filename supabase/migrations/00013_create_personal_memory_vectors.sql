-- Semantic personal-memory retrieval.
-- The source of truth remains memory_items; this table is a replaceable index.
create extension if not exists vector with schema extensions;

create table if not exists public.memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null unique references public.memory_items(id) on delete cascade,
  embedding_model text not null,
  content_hash text not null,
  embedding extensions.vector(2048) not null,
  created_at timestamptz not null default now()
);

create index if not exists memory_embeddings_user_id_idx
  on public.memory_embeddings(user_id);
-- The selected free embedding model returns 2048 dimensions. Postgres HNSW
-- indexes are capped at 2000 dimensions, so the bounded personal-memory RPC
-- uses an exact cosine scan until a lower-dimensional model is selected.

alter table public.memory_embeddings enable row level security;

revoke all on table public.memory_embeddings from anon;
grant select, insert, update on table public.memory_embeddings to authenticated;

create policy "memory_embeddings_select_own"
  on public.memory_embeddings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "memory_embeddings_insert_own"
  on public.memory_embeddings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "memory_embeddings_update_own"
  on public.memory_embeddings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.match_personal_memory(
  query_embedding extensions.vector(2048),
  match_threshold float default 0.35,
  match_count int default 12
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
    and (1 - (e.embedding <=> query_embedding)) >= match_threshold
  order by e.embedding <=> query_embedding asc
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_personal_memory(extensions.vector(2048), float, int) from public;
grant execute on function public.match_personal_memory(extensions.vector(2048), float, int) to authenticated;
