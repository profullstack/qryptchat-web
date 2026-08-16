-- Wave 2 of the 2026-08 security remediation.
--
-- Closes the findings that survived wave 1 (#244-#251):
--
--   GHSA-7w99-6w89-2926  `users_select_authenticated` was `USING (true)`, so any
--                        authenticated account -- including a throwaway anonymous
--                        sign-in -- could read every user's phone_number and salt.
--   GHSA-vxcr-4mm8-jfm3  `conversation_participants` INSERT only required a non-NULL
--                        auth.uid(), so anyone could insert themselves into anyone's
--                        conversation and start receiving its ciphertext stream.
--   GHSA-9jgr-3h36-9748  `conversations` carried a `FOR SELECT USING (true)` policy
--                        with no role clause, readable by anon in any fresh deploy.
--   GHSA-ffpr-xfm2-pp84  `get_inactive_participants` returns participants' full phone
--                        numbers to any caller that clears the participation check.
--
-- Plus the social-graph read tracked as NEW-02: `conversation_participants` was
-- likewise `FOR SELECT USING (true)`.

-- --------------------------------------------------------------------------
-- Helpers.
--
-- RLS policy expressions evaluate the policies of any table they reference, which
-- is what produced this schema's long history of "fix recursion" migrations: a
-- policy on `conversations` that reads `conversation_participants` re-enters a
-- policy on `conversation_participants` that reads `conversations`. These helpers
-- are SECURITY DEFINER, so they run as the table owner and bypass RLS, which
-- breaks the cycle. They are deliberately narrow -- an id and two booleans about
-- the caller's own membership -- so bypassing RLS inside them leaks nothing the
-- caller could not already determine.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT u.id
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(conversation_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = conversation_uuid
          AND cp.user_id = public.current_app_user_id()
          AND cp.left_at IS NULL
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_conversation_creator(conversation_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = conversation_uuid
          AND c.created_by = public.current_app_user_id()
    );
$function$;

CREATE OR REPLACE FUNCTION public.shares_conversation_with(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversation_participants mine
        JOIN public.conversation_participants theirs
          ON theirs.conversation_id = mine.conversation_id
        WHERE mine.user_id = public.current_app_user_id()
          AND theirs.user_id = target_user_id
    );
$function$;

-- The default PUBLIC grant is what made 48 SECURITY DEFINER functions anon-executable
-- in the first place (#247); do not repeat it for these.
REVOKE EXECUTE ON FUNCTION public.current_app_user_id()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_conversation_with(uuid)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_app_user_id()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_creator(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_conversation_with(uuid)          TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- GHSA-7w99: narrow the global read of `users`.
--
-- The caller may read their own row, and the rows of people they actually share a
-- conversation with. Directory search needs to reach further than that by design,
-- so `/api/users/search` was moved to the service role in the same change and
-- keeps masking phone numbers to ***-***-1234 before returning them.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated ON public.users
    FOR SELECT TO authenticated
    USING (
        auth_user_id = auth.uid()
        OR public.shares_conversation_with(id)
    );

-- --------------------------------------------------------------------------
-- GHSA-9jgr: `conversations` must not be world-readable.
--
-- Both of the old policies go: the `USING (true)` one had no role clause at all
-- (so it reached anon), and `conversations_select_policy` only asked that the
-- caller be logged in.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read conversations for participation check" ON public.conversations;
DROP POLICY IF EXISTS conversations_select_policy                            ON public.conversations;
DROP POLICY IF EXISTS "Users can read own conversations"                     ON public.conversations;
-- Production already carries a hand-applied `conversations_select_participant` (the same
-- out-of-band patching that produced the drift in QRY-01), so this has to drop before it
-- creates or the migration aborts with 42710 against prod while succeeding on a fresh DB.
DROP POLICY IF EXISTS conversations_select_participant                       ON public.conversations;

CREATE POLICY conversations_select_participant ON public.conversations
    FOR SELECT TO authenticated
    USING (
        created_by = public.current_app_user_id()
        OR public.is_conversation_participant(id)
    );

-- --------------------------------------------------------------------------
-- NEW-02: `conversation_participants` was `USING (true)`, exposing the whole
-- social graph. Restrict reads to conversations the caller is actually in.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read all participants"          ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can read conversation participants" ON public.conversation_participants;
DROP POLICY IF EXISTS conversation_participants_select_scoped    ON public.conversation_participants;

CREATE POLICY conversation_participants_select_scoped ON public.conversation_participants
    FOR SELECT TO authenticated
    USING (
        user_id = public.current_app_user_id()
        OR public.is_conversation_participant(conversation_id)
    );

-- --------------------------------------------------------------------------
-- GHSA-vxcr: close the participant-injection primitive.
--
-- The old policy's entire check was `auth.uid() IS NOT NULL`, which let any
-- authenticated user insert an arbitrary (conversation_id, user_id) pair. A
-- participant list may now only be extended by the conversation's creator or by
-- someone already in it -- which still covers the create-then-add-participants
-- flow, since the creator is the one doing the adding.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can add participants"    ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS conversation_participants_insert_scoped       ON public.conversation_participants;

CREATE POLICY conversation_participants_insert_scoped ON public.conversation_participants
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_conversation_creator(conversation_id)
        OR public.is_conversation_participant(conversation_id)
    );

-- --------------------------------------------------------------------------
-- GHSA-ffpr: stop handing participants' phone numbers to client-side callers.
--
-- The function legitimately needs the phone number -- it feeds the SMS
-- notification path -- but its only caller is server-side and runs as the service
-- role (see createSMSNotificationService(getServiceRoleClient())). Revoking
-- `authenticated` therefore removes the PII exposure without changing the
-- signature, the same reasoning applied to delete_encrypted_data_only in #244.
-- `anon` was already revoked in 20260814030009.
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_inactive_participants(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON POLICY users_select_authenticated ON public.users IS
    'Own row, plus users sharing a conversation with the caller. Directory-wide lookups run as service_role.';
COMMENT ON POLICY conversation_participants_insert_scoped ON public.conversation_participants IS
    'Only a conversation creator or an existing participant may extend the participant list (GHSA-vxcr-4mm8-jfm3).';
