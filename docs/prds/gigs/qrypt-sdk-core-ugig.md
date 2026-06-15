# Build the qrypt.chat Core Agent SDK (`@qryptchat/sdk`)

> ugig.net gig posting — implements [PRD-01](../prd-01-sdk-core.md)

- **Title:** Build the qrypt.chat Core Agent SDK (`@qryptchat/sdk`)
- **Skills required:** `typescript`, `nodejs`, `cryptography`, `ml-kem`, `supabase`, `websockets`, `sdk-design`, `vitest`
- **Budget type:** fixed
- **Budget (USD):** 1,800 – 3,000
- **Repo:** https://github.com/profullstack/qryptchat-web · branch `feat/sdk-core`
- **Spec:** `docs/prds/prd-01-sdk-core.md`

## What we need

A TypeScript-first, headless SDK that lets any Node program be a full qrypt.chat
client — authenticate, hold a **client-side ML-KEM-1024** identity, and send /
receive **end-to-end-encrypted** messages with no browser and no TUI. This is the
foundation the CLI, invite, and MCP packages all build on, so API quality and
test coverage matter more than feature breadth.

qrypt.chat is a real, deployed Next.js + Supabase app that is already
post-quantum (ML-KEM-1024). **You are extracting and packaging existing
auth/crypto/transport logic into one tested library — not reimplementing
primitives.** The on-device private key must never leave the process.

## Scope

1. `QryptClient` with an `auth` namespace covering all three tiers: phone+PIN
   SMS, CoinPay OIDC (headless device/redirect capture), and anonymous invite
   (`signInAnonymously` → `POST /api/auth/register-anon`).
2. Client-side ML-KEM-1024 keypair generation/storage, public-key registration,
   fingerprint + safety-number, seed-phrase export/import. Reuse the web client's
   message format byte-for-byte (`ENCRYPTION.md`) — verify interop both ways.
3. Conversations (list/create/join) + paginated history.
4. Transport-agnostic `messages.subscribe()` over the current WebSocket protocol
   (`auth`→`join_conversation`→`message_received`), with auto-reconnect and token
   refresh, structured so the planned WS→POST/SSE migration is a drop-in swap.
5. Pluggable storage adapters (`file`, `env`, `memory`); typed errors with stable
   codes; ESM-only, Node ≥ 20, tree-shakeable.

## Acceptance criteria

- `npm i @qryptchat/sdk`, authenticate on all three tiers, send + receive an
  E2EE message, and stream live messages — headless, key never leaving the
  process.
- Vitest coverage on every public method; crypto round-trip + cross-client format
  test; a Supabase-test-project integration test for the anon-invite e2e.
- No changes to server endpoints, DB schema, the existing WS auth, or the
  interactive TUI. PR with green CI, README, and typed public API.
