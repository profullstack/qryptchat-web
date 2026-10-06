-- End-to-end encrypted calls: a call invite is a message of type 'call' whose
-- ENCRYPTED body carries the room and the media key (src/lib/chat/calls.js).
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('text', 'image', 'file', 'system', 'reaction', 'call'));
