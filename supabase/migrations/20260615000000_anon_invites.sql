-- Anonymous + invite-only registration system
-- Additive only: does NOT touch the existing phone+SMS auth path.
-- Adds support for anonymous Supabase auth users (phone_number NULL) that
-- register by redeeming a single-use Ed25519-signed invite token.

-- Make anonymous accounts possible: phone_number is no longer required.
ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;

-- Distinguish verified (phone/SMS) accounts from anonymous (invite) accounts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'verified'
    CHECK (account_type IN ('verified', 'anonymous'));

-- Registered invite issuers (e.g. agentbbs). Their Ed25519 public key is used
-- to verify signed invite tokens at redeem time.
CREATE TABLE IF NOT EXISTS invite_issuers (
    id TEXT PRIMARY KEY,                  -- e.g. 'agentbbs'
    name TEXT NOT NULL,
    ed25519_public_key TEXT NOT NULL,     -- base64 raw 32-byte
    default_quota INT NOT NULL DEFAULT 5,
    disabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Redeemed invites. The jti primary key burns the token (double-spend guard):
-- a second redeem of the same jti hits the unique constraint and is rejected.
CREATE TABLE IF NOT EXISTS registration_invites (
    jti TEXT PRIMARY KEY,                 -- burns the token
    issuer_id TEXT NOT NULL REFERENCES invite_issuers(id),
    redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exp TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_registration_invites_issuer_id ON registration_invites(issuer_id);

-- RLS enabled with NO public policies: these tables are service-role only.
-- The register-anon API uses the service role key, which bypasses RLS.
ALTER TABLE invite_issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_invites ENABLE ROW LEVEL SECURITY;
