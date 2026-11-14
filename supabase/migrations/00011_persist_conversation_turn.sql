-- Persist each authenticated conversation turn and explicit user facts atomically.
-- SECURITY INVOKER keeps the caller's RLS and auth.uid() boundary active.

grant usage on schema public to authenticated;
grant select, insert, update on table public.conversations, public.messages, public.memory_items to authenticated;

create or replace function public.persist_conversation_turn(
  p_conversation_id uuid,
  p_user_content text,
  p_assistant_content text,
  p_memories jsonb default '[]'::jsonb
)
returns table(conversation_id uuid, user_message_id uuid, assistant_message_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid := p_conversation_id;
  v_user_message_id uuid;
  v_assistant_message_id uuid;
  v_memory jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_user_content is null or btrim(p_user_content) = '' or length(p_user_content) > 4000 then
    raise exception 'user_content must be between 1 and 4000 characters' using errcode = '22023';
  end if;
  if p_assistant_content is null or btrim(p_assistant_content) = '' or length(p_assistant_content) > 12000 then
    raise exception 'assistant_content must be between 1 and 12000 characters' using errcode = '22023';
  end if;
  if p_memories is null or jsonb_typeof(p_memories) <> 'array' then
    raise exception 'memories must be a JSON array' using errcode = '22023';
  end if;

  if v_conversation_id is null then
    insert into public.conversations (user_id, title)
    values (v_user_id, left(p_user_content, 120))
    returning id into v_conversation_id;
  elsif not exists (
    select 1 from public.conversations c
    where c.id = v_conversation_id and c.user_id = v_user_id
  ) then
    raise exception 'conversation is not accessible to the current user' using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, user_id, role, content)
  values (v_conversation_id, v_user_id, 'user', p_user_content)
  returning id into v_user_message_id;

  insert into public.messages (conversation_id, user_id, role, content)
  values (v_conversation_id, v_user_id, 'assistant', p_assistant_content)
  returning id into v_assistant_message_id;

  for v_memory in select value from jsonb_array_elements(p_memories)
  loop
    if jsonb_typeof(v_memory) <> 'object'
       or nullif(btrim(v_memory->>'entity_type'), '') is null
       or nullif(btrim(v_memory->>'entity_name'), '') is null
       or nullif(btrim(v_memory->>'content'), '') is null
       or coalesce(v_memory->>'entity_type', '') not in ('product', 'company', 'decision', 'fact', 'preference', 'topic', 'other') then
      raise exception 'invalid memory payload' using errcode = '22023';
    end if;

    insert into public.memory_items (user_id, conversation_id, message_id, entity_type, entity_name, content)
    values (v_user_id, v_conversation_id, v_user_message_id, v_memory->>'entity_type', v_memory->>'entity_name', v_memory->>'content');
  end loop;

  update public.conversations
  set updated_at = now()
  where id = v_conversation_id and user_id = v_user_id;

  return query select v_conversation_id, v_user_message_id, v_assistant_message_id;
end;
$$;

revoke all on function public.persist_conversation_turn(uuid, text, text, jsonb) from public;
grant execute on function public.persist_conversation_turn(uuid, text, text, jsonb) to authenticated;
