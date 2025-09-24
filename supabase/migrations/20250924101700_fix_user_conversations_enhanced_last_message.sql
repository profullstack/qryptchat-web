-- Migration: Fix get_user_conversations_enhanced to use correct column for last message
-- The messages table does not have "content", it likely uses "encrypted_content".
-- We will instead expose encrypted_content for now to support last message timestamp.

drop function if exists public.get_user_conversations_enhanced(uuid);

create function public.get_user_conversations_enhanced(user_uuid uuid)
returns table (
  conversation_id uuid,
  conversation_name text,
  conversation_type text,
  last_message_encrypted_content bytea,
  last_message_sender_username text,
  last_message_at timestamptz
) language sql as $$
  select
    c.id as conversation_id,
    c.name as conversation_name,
    c.type as conversation_type,
    m.encrypted_content as last_message_encrypted_content,
    u.username as last_message_sender_username,
    m.created_at as last_message_at
  from conversations c
  join conversation_participants cp
    on cp.conversation_id = c.id and cp.user_id = user_uuid
  left join lateral (
    select ms.encrypted_content, ms.created_at, ms.sender_id
    from messages ms
    where ms.conversation_id = c.id
    order by ms.created_at desc
    limit 1
  ) m on true
  left join users u on u.id = m.sender_id;
$$;