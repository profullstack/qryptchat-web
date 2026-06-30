-- Let anonymous users invite other anonymous users from the web app.
--
-- Adds a `qryptchat-web` invite issuer (so the web app can MINT invite tokens,
-- not just redeem them) and an `issued_invites` table that caps how many
-- invites a single account may mint (anti-abuse quota).
--
-- Additive only: does NOT touch the phone/SMS path or the existing
-- agentbbs issuer / registration_invites redemption flow.

-- The web issuer's Ed25519 PUBLIC key (base64 raw 32-byte). The matching
-- secret seed lives ONLY in the QRYPT_WEB_ISSUER_SEED env var (never in git).
-- Rotate by regenerating the keypair, updating this row, and updating the env.
INSERT INTO invite_issuers (id, name, ed25519_public_key, default_quota, disabled)
VALUES (
    'qryptchat-web',
    'QryptChat Web',
    'Rw1kHgF5RT54fLuDYo3eXy/oSbBdslScoGYTuQ1hKe8=',
    5,
    FALSE
)
ON CONFLICT (id) DO UPDATE
    SET ed25519_public_key = EXCLUDED.ed25519_public_key,
        name = EXCLUDED.name;

-- Tracks invites MINTED by a user (distinct from registration_invites, which
-- tracks invites REDEEMED). One row per minted token; counted per issuer to
-- enforce the per-user quota.
CREATE TABLE IF NOT EXISTS issued_invites (
    jti TEXT PRIMARY KEY,                 -- matches the token's jti
    issuer_id TEXT NOT NULL REFERENCES invite_issuers(id),
    issued_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issued_invites_issued_by ON issued_invites(issued_by);

-- Service-role only (the invite-anon API uses the service key, bypassing RLS).
ALTER TABLE issued_invites ENABLE ROW LEVEL SECURITY;
