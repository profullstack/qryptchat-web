-- Passkeys (WebAuthn): sign up and sign in with no phone number.
--
-- webauthn_credentials: one row per passkey, bound to a Supabase auth user.
-- webauthn_challenges: one-time challenges for a ceremony in flight (5 min);
-- consumed_at IS NULL is the burn, as in cli_auth_codes and name_challenges.
-- Both are RLS-on with no policies: only the service role reaches them, through
-- /api/auth/passkey/*. A signed-in user lists and removes their own passkeys
-- through those routes, never directly.
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credential_id  TEXT NOT NULL UNIQUE,          -- base64url
    public_key     TEXT NOT NULL,                 -- base64url COSE key
    counter        BIGINT NOT NULL DEFAULT 0,
    transports     TEXT[] NOT NULL DEFAULT '{}',
    device_type    TEXT,                          -- singleDevice | multiDevice
    backed_up      BOOLEAN NOT NULL DEFAULT false,
    name           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS webauthn_credentials_user ON webauthn_credentials (auth_user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id            TEXT PRIMARY KEY,
    challenge     TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('register', 'login')),
    auth_user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- set when adding a passkey to a signed-in account
    username      TEXT,                                               -- set when signing up
    display_name  TEXT,
    user_handle   TEXT,                                               -- base64url WebAuthn user.id for a sign-up
    rp_id         TEXT NOT NULL,
    origin        TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    consumed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS webauthn_challenges_expiry ON webauthn_challenges (expires_at);

ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON webauthn_credentials FROM anon, authenticated;
REVOKE ALL ON webauthn_challenges FROM anon, authenticated;
