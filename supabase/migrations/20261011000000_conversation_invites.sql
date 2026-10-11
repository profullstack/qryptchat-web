-- Group invite links: https://qrypt.chat/join/<code> adds whoever opens it to a
-- group chat. One active link per group; an admin can reset or revoke it.
-- Read and written only by the API with the service role.

CREATE TABLE IF NOT EXISTS public.conversation_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    uses INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_invites_one_active
    ON public.conversation_invites (conversation_id) WHERE revoked_at IS NULL;

ALTER TABLE public.conversation_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_invites FROM anon, authenticated;
GRANT ALL ON public.conversation_invites TO service_role;
