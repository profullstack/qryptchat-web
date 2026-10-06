-- `qc login`: one-time authorization codes for the qc command-line client.
--
-- OAuth 2.1 shape: authorization code + PKCE (S256), started from the CLI. The
-- signed-in web app approves a request and stores a code here; the CLI trades
-- code + verifier at /api/cli/token for its own session. A code lives five
-- minutes and is spendable once (consumed_at IS NULL is the burn).
--
-- key_blob is the account's keypair sealed (ML-KEM-1024 + ChaCha20-Poly1305) to
-- an ephemeral public key the CLI generated for this one login. The server
-- relays it and cannot open it; only code_hash is stored, never the code.
CREATE TABLE IF NOT EXISTS cli_auth_codes (
    code_hash       TEXT PRIMARY KEY,
    auth_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_challenge  TEXT NOT NULL,
    redirect_uri    TEXT NOT NULL,
    client_name     TEXT,
    key_blob        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    consumed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cli_auth_codes_expiry ON cli_auth_codes (expires_at);

-- RLS on, zero policies: service_role only, same shape as name_challenges.
ALTER TABLE cli_auth_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cli_auth_codes FROM anon, authenticated;
