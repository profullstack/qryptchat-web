-- log_sms_notification cannot take a plain auth.uid() ownership binding: it is
-- legitimately cross-user, since the sender logs a notification on behalf of
-- the recipient. Guard on conversation membership instead.
--
-- Deliberately NOT a REVOKE. The caller in lib/websocket/handlers/messages.js
-- moves to the service-role client in the same PR as this migration, but that
-- code has to deploy before a revoke would be safe, and Railway deploys on
-- merge rather than in lockstep with migrations. A membership guard is correct
-- in either order: service_role has a NULL auth.uid() and passes straight
-- through, while `authenticated` must be a real participant.
--
-- Residual: a genuine participant can still write an arbitrary phone/content
-- pair for another participant of the same conversation. Locking the function
-- to service_role once the caller change is live removes that too.
CREATE OR REPLACE FUNCTION public.log_sms_notification(user_uuid uuid, conversation_uuid uuid, message_uuid uuid, phone text, content text, notification_status text DEFAULT 'pending'::text, error_msg text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    notification_id UUID;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.conversation_participants cp
            JOIN public.users u ON u.id = cp.user_id
            WHERE cp.conversation_id = conversation_uuid
              AND u.auth_user_id = auth.uid()
              AND cp.left_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Not authorized for this conversation';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.conversation_participants cp
            WHERE cp.conversation_id = conversation_uuid
              AND cp.user_id = user_uuid
        ) THEN
            RAISE EXCEPTION 'Target user is not a participant';
        END IF;
    END IF;

    INSERT INTO public.sms_notifications (
        user_id,
        conversation_id,
        message_id,
        phone_number,
        message_content,
        status,
        error_message
    ) VALUES (
        user_uuid,
        conversation_uuid,
        message_uuid,
        phone,
        content,
        notification_status,
        error_msg
    ) RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_sms_notification(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_sms_notification(uuid, uuid, uuid, text, text, text, text) TO authenticated, service_role;
