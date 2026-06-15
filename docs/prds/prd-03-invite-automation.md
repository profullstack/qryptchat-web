# PRD-03: `@qryptchat/invite` — Invite Issuance & Redemption Automation

**Status:** Draft · **Owner:** TBD · **Depends on:** PRD-01 (`@qryptchat/sdk`)

## 1. Overview

A library + CLI surface for the **anonymous, invite-only tier**: minting
Ed25519-signed invite tokens, redeeming them, enforcing per-issuer quotas, and
revoking them — so trusted systems (chiefly [AgentBBS](https://github.com/profullstack/agentbbs))
can provision anonymous qrypt.chat identities for their members
programmatically.

The server side already exists and is live: `invite_issuers` (trusted issuer
pubkeys), `registration_invites` (burns one-time `jti` to stop double-spend),
`POST /api/auth/register-anon`, and a registered `agentbbs` issuer. AgentBBS
already mints tokens in Go (`internal/qryptinvite`) that verify against the Node
`verify.js` lib. **This PRD makes that capability a clean, reusable npm package**
so any authorized issuer — not just the Go BBS — can participate, and so the JS
ecosystem (CLI, MCP, web admin) shares one tested implementation.

## 2. Goals

- A canonical **JS minter/verifier** for the `qci1.<b64url(payload)>.<b64url(sig)>`
  token format, byte-compatible with the existing Go implementation and
  `src/lib/invites/verify.js`.
- Programmatic **issue → deliver → redeem → revoke** lifecycle with per-issuer
  quotas and expiry/use-count enforcement.
- An AgentBBS-style bridge so any trusted issuer can hand a member a capped,
  expiring invite (and optionally a deep link / QR).
- Privacy preserved: server stores only hashed token + redeemed flag, never a
  social/invite graph.

## 3. Non-Goals

- No new token format or crypto agility — single fixed alg (Ed25519), no JWT, no
  alg negotiation (that's the whole anti-alg-confusion point).
- No change to the anonymity model: invites gate signup, they do **not** link the
  resulting account to the inviter by default.
- No phone/CoinPay tier logic (those are open and need no invite).

## 4. Token & API contract (existing, to be honored)

```
token   = "qci1." + b64url(payload) + "." + b64url(sig)
payload = { jti, iss, tier: "anonymous", iat, exp, uses }
sig     = Ed25519(issuerPrivKey, payloadBytes)
verify  : look up iss in invite_issuers → check sig, exp, uses; burn jti in
          registration_invites at redeem (insert-then-compensate today; a
          SECURITY DEFINER RPC is the hardening follow-up).
redeem  : POST /api/auth/register-anon  (Bearer = anon Supabase session)
```

> Compatibility is a hard requirement: a token minted by this lib must verify
> with the deployed `verify.js`, and a Go-minted token must verify with this lib.
> The seed uses **standard** base64; token segments use **url-safe, no-pad**.

## 5. Public API (target shape)

```ts
import { IssuerKey, mint, verify, redeem } from '@qryptchat/invite';

const issuer = IssuerKey.fromSeed(process.env.QRYPT_ISSUER_SEED); // standard-b64 seed
const token  = mint(issuer, { iss: 'agentbbs', uses: 1, ttl: '7d' });

const result = verify(token, { issuers });   // { ok, payload } | { ok:false, reason }
await redeem({ token, baseUrl, session });   // → anon account (delegates to SDK)

// quota helpers (server-backed)
await quota.remaining({ issuer: 'agentbbs', subject });   // default 5
await revoke({ jti, issuer });
```

CLI (exposed through `qrypt invite …` from PRD-02, and standalone):

```
qrypt invite issue   --issuer <id> [--uses N] [--ttl 7d] [--qr] [--link]
qrypt invite verify  <token>
qrypt invite redeem  <token>            # provisions an anon account here
qrypt invite revoke  --jti <jti>
qrypt issuer keygen  [--seed-out <file>]   # prints pubkey to register in invite_issuers
```

## 6. Functional requirements

1. **Mint** — produce spec-exact tokens; refuse to mint past quota; embed
   `jti` (random, unique), `iat`, `exp`, `uses`.
2. **Verify** — resolve `iss` against trusted issuer pubkeys; reject bad
   signature, expired, exhausted-uses, or unknown issuer with distinct reasons.
3. **Redeem** — call the SDK's `auth.withInvite` path; surface `invite_used`,
   expiry, and bad-signature as typed errors; idempotent on retry.
4. **Quotas** — per-issuer (and optionally per-subject) caps; default 5,
   configurable; backed by the existing quota table semantics.
5. **Revoke** — burn a `jti` before redemption; reflected in verify.
6. **Issuer key mgmt** — `keygen` produces a seed + the pubkey string to insert
   into `invite_issuers`; never logs the seed except to the requested file/once.
7. **Bridge helper** — a thin `issueForMember({ issuer, memberRef })` that mints
   a capped/expiring token + returns a redeem link/QR, mirroring AgentBBS's
   `agentbbs qrypt-invite <user>`.

## 7. Non-functional

- TS/ESM. **Cross-language test vectors** committed (a Go-minted token + its
  expected verify result) so drift is caught in CI.
- Issuer seeds treated as top secret: env/file only, never in logs, rotation
  documented (re-keygen → update secret + the `invite_issuers` row).
- Server stores hashed token + redeemed flag only — no invite graph.

## 8. Testing & acceptance

- Vitest: mint↔verify round-trip; tampered payload → `bad_signature`; expired →
  `expired`; reused `jti` → `invite_used`; over-quota mint refused.
- Cross-language: load a committed Go-minted token, assert `verify` passes;
  assert a JS-minted token passes the deployed `verify.js`.
- e2e: `qrypt invite issue` → `qrypt register --invite <token>` → new anon
  account; second redeem of same token → `invite_used`.
- **Done when:** an authorized issuer can, in one command, hand out a working
  one-time invite that provisions an anonymous, PII-free qrypt.chat identity, and
  double-spend is impossible.

## 9. Risks / open questions

- Insert-then-compensate redeem has a race window; the SECURITY DEFINER RPC
  hardening should land with or before this.
- Quota source of truth (Go BBS table vs JS) — define one canonical store.
