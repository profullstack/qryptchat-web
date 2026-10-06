-- Reactions are messages of their own (Signal-style): message_type 'reaction'
-- with an end-to-end encrypted body { target, emoji, remove }, so the server
-- sees that someone reacted but never to what or with which emoji.
-- See src/lib/chat/reactions.js.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('text', 'image', 'file', 'system', 'reaction'));
