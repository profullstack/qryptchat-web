-- Migration: Add unread_count to get_user_conversations_enhanced
-- This fixes the red dot indicator by calculating unread messages per conversation

drop function if exists public.get_user_conversations_enhanced(uuid);

create function public.get_user_conversations_enhanced(user_uuid uuid)
returns table (
  conversation_id uuid,
  conversation_name text,
  conversation_type text,
  last_message_encrypted_content bytea,
  last_message_sender_username text,
  last_message_at timestamptz,
  unread_count bigint
) language sql as $$
  select
    c.id as conversation_id,
    c.name as conversation_name,
    c.type as conversation_type,
    m.encrypted_content as last_message_encrypted_content,
    u.username as last_message_sender_username,
    m.created_at as last_message_at,
    -- Count unread messages: messages where the user's delivery record has no read_ts
    coalesce(
      (
        select count(*)
        from messages msg
        join deliveries d on d.message_id = msg.id
        where msg.conversation_id = c.id
          and d.recipient_user_id = user_uuid
          and d.read_ts is null
          and d.deleted_ts is null
      ),
      0
    ) as unread_count
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
  left join users u on u.id = m.sender_id
  order by m.created_at desc nulls last;
$$;

-- Grant execute permission
grant execute on function public.get_user_conversations_enhanced(uuid) to authenticated;

-- Add comment
comment on function public.get_user_conversations_enhanced(uuid) is 
  'Returns user conversations with unread message count for red dot indicators';