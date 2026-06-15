# Build qrypt.chat Invite Automation (`@qryptchat/invite`)

> ugig.net gig posting — implements [PRD-03](../prd-03-invite-automation.md)

- **Title:** Build qrypt.chat Invite Issuance & Redemption Automation (`@qryptchat/invite`)
- **Skills required:** `typescript`, `nodejs`, `cryptography`, `ed25519`, `go-interop`, `supabase`, `vitest`
- **Budget type:** fixed
- **Budget (USD):** 1,400 – 2,400
- **Repo:** https://github.com/profullstack/qryptchat-web · branch `feat/invite-automation`
- **Spec:** `docs/prds/prd-03-invite-automation.md`
- **Depends on:** `@qryptchat/sdk` (PRD-01)

## What we need

A library + CLI surface for the **anonymous, invite-only tier**: mint, verify,
redeem, quota, and revoke Ed25519-signed invite tokens so trusted issuers
(chiefly AgentBBS) can provision anonymous, PII-free qrypt.chat identities
programmatically.

The server side is already live (`invite_issuers`, `registration_invites`,
`POST /api/auth/register-anon`, a registered `agentbbs` issuer) and AgentBBS
already mints tokens in **Go** that verify against the deployed Node
`src/lib/invites/verify.js`. **Cross-language byte-compatibility is a hard
requirement** — a JS-minted token must pass the Go verifier and vice-versa.

## Scope

- Canonical JS minter/verifier for `qci1.<b64url(payload)>.<b64url(sig)>`
  (payload `{jti,iss,tier:"anonymous",iat,exp,uses}`, Ed25519, single fixed alg —
  no JWT, no alg negotiation). Standard-b64 seed; url-safe-no-pad segments.
- `mint`, `verify` (distinct reasons: bad_signature / expired / used / unknown
  issuer), `redeem` (via SDK `auth.withInvite`), per-issuer quotas (default 5),
  `revoke`, and `IssuerKey` keygen that prints the pubkey to register.
- `issueForMember()` bridge helper (link/QR) mirroring `agentbbs qrypt-invite`.
- CLI surface exposed through `qrypt invite …` and standalone.

## Acceptance criteria

- One command hands out a working **one-time** invite that provisions an
  anonymous identity; **double-spend is impossible** (second redeem → `invite_used`).
- Committed cross-language test vectors: a Go-minted token verifies in JS, and a
  JS-minted token passes the deployed `verify.js`. Vitest covers
  mint↔verify, tamper, expiry, reuse, over-quota.
- Server stores only hashed token + redeemed flag (no invite graph). Issuer seeds
  never logged; rotation documented. Green CI + README.

## Notes

- Coordinate with the SECURITY DEFINER RPC hardening for the redeem race
  (insert-then-compensate today). Define one canonical quota store (Go vs JS).
