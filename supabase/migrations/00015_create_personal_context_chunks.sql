-- Message-level personal-context RAG index.
-- The original messages table remains the source of truth; this is a semantic index.
create table if not exists public.personal_context_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(btrim(content)) > 0),
  content_hash text not null,
  embedding_model text not null,
  embedding extensions.vector(2048) not null,
  created_at timestamptz not null default now(),
  unique (message_id, chunk_index)
);

create index if not exists personal_context_chunks_user_id_idx
  on public.personal_context_chunks(user_id);
create index if not exists personal_context_chunks_message_id_idx
  on public.personal_context_chunks(message_id);

alter table public.personal_context_chunks enable row level security;
revoke all on table public.personal_context_chunks from anon;
grant select, insert, update on table public.personal_context_chunks to authenticated;

create policy "personal_context_chunks_select_own"
  on public.personal_context_chunks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "personal_context_chunks_insert_own"
  on public.personal_context_chunks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "personal_context_chunks_update_own"
  on public.personal_context_chunks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.match_personal_context(
  query_embedding extensions.vector(2048),
  match_threshold float default 0.35,
  match_count int default 12,
  embedding_model_filter text default null
)
returns table(message_id uuid, chunk_index integer, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.message_id,
         c.chunk_index,
         (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.personal_context_chunks c
  where c.user_id = (select auth.uid())
    and (embedding_model_filter is null or c.embedding_model = embedding_model_filter)
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding asc
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_personal_context(extensions.vector, double precision, integer, text) from public;
grant execute on function public.match_personal_context(extensions.vector, double precision, integer, text) to authenticated;
