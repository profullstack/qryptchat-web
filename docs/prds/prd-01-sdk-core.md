# PRD-01: `@qryptchat/sdk` — Core Agent SDK

**Status:** Draft · **Owner:** TBD · **Depends on:** none · **Consumers:**
PRD-02 (CLI), PRD-03 (invite), PRD-04 (MCP)

## 1. Overview

A programmatic, TypeScript-first SDK that lets any Node.js (and, where feasible,
browser/Deno) program be a full qrypt.chat client: authenticate on any of the
three tiers, manage a post-quantum keypair entirely client-side, list and create
conversations, send and receive **end-to-end-encrypted** messages, and subscribe
to a live message stream — with **no browser, no TUI, no DOM**.

This is the foundation every other PRD builds on. Today there is an interactive
`blessed`+`ws` CLI (`bin/qryptchat-cli.js`) and a half-built headless agent CLI;
both reimplement auth/crypto/transport ad hoc. This SDK extracts that into one
tested, reusable library.

## 2. Goals

- One import to go from credentials → authenticated, encrypted session.
- **Client-side ML-KEM-1024** key generation, storage, and message sealing; the
  private key never touches the network.
- Support all three auth tiers behind a single `auth` namespace.
- Transport-agnostic realtime: a `subscribe()` API that works over the current
  WebSocket protocol and survives the planned WS→POST/SSE migration unchanged.
- Runs headless: pluggable key/session storage (file, env, in-memory, custom).
- Fully typed, ESM, tree-shakeable, vitest-covered.

## 3. Non-Goals

- No UI of any kind (CLI is PRD-02, MCP is PRD-04).
- No changes to server endpoints, DB schema, or the existing WS auth.
- No voice/video calls (covered by the separate call PRD / ML-KEM call work).
- No server-side key escrow or email-based recovery — out of scope by design.

## 4. Public API (target shape)

```ts
import { QryptClient } from '@qryptchat/sdk';

const client = new QryptClient({
  baseUrl: 'https://qrypt.chat',
  storage: fileStorage('~/.config/qrypt/agent.json'), // pluggable
});

// --- Auth (pick one tier) ---
await client.auth.withPhone({ phone, pin });            // SMS-verified tier
await client.auth.withCoinPay({ /* OIDC device/redirect flow */ });
await client.auth.withInvite({ token, seedPhrase? });   // anonymous tier
await client.auth.restore();                            // resume saved session
const me = await client.whoami();                       // { userId, username, accountType, fingerprint }

// --- Identity / keys (client-side ML-KEM-1024) ---
const ident = await client.identity.ensure();           // generate-or-load keypair
ident.publicKey; ident.fingerprint; ident.safetyNumber(peerPubKey);
await client.identity.exportSeed(); await client.identity.importSeed(seed);

// --- Conversations ---
const convos = await client.conversations.list();
const convo  = await client.conversations.create({ type: 'direct'|'group', participants });
await client.conversations.join(convoId);

// --- Messages (E2EE) ---
await client.messages.send(convoId, { text });          // seals locally before send
const page = await client.messages.history(convoId, { before, limit });

// --- Realtime (transport-agnostic) ---
const sub = client.messages.subscribe({ conversationId? }, (evt) => {
  // evt: { type: 'message', conversationId, from, plaintext, ts } | 'typing' | 'presence'
});
sub.close();
```

## 5. Functional requirements

1. **Auth namespace**
   - `withPhone` → `/api/auth/send-sms` + `/api/auth/verify-sms`, yields a
     Supabase session.
   - `withCoinPay` → drive the OIDC flow; headless variant must support a
     device/redirect-capture mode usable without a browser tab (return the
     authorize URL + poll/callback capture). `account_type='verified'`.
   - `withInvite` → Supabase `signInAnonymously` then
     `POST /api/auth/register-anon` with the `qci1.…` token (Bearer the anon
     session). Handles `invite_used` / expiry / bad-signature errors distinctly.
   - All tiers converge on a stored session usable by the WS auth
     (`supabase.auth.getUser(token)`), with token refresh on long-lived sessions.
2. **Identity / keys** — generate ML-KEM-1024 keypair locally, persist via the
   storage adapter, register **public** key with `user_public_keys`, expose
   fingerprint + safety-number comparison. Seed-phrase export/import for anon
   recovery.
3. **E2EE messaging** — encapsulate to each recipient's public key, derive
   per-message keys via KDF, seal plaintext; on receive, decapsulate + open. Must
   interoperate byte-for-byte with the existing web client's message format
   (verify against `ENCRYPTION.md`). Never log plaintext or keys.
4. **Conversations & history** — list/create/join; paginated history
   (`load_messages` / `load_more_messages`).
5. **Realtime** — `subscribe()` wraps the WS protocol (`auth` →
   `join_conversation` → `message_received`) behind one callback; auto-reconnect
   with backoff; re-auth on token refresh; pluggable transport so the POST/SSE
   migration is a drop-in swap.

## 6. Non-functional

- TS, ESM-only, Node ≥ 20, zero hard browser deps; crypto via the same lib the
  web app uses (no new primitive). Tree-shakeable, no top-level side effects.
- Storage adapter interface: `{ get(k), set(k,v), delete(k) }` — ships
  `fileStorage`, `envStorage`, `memoryStorage`.
- Errors are typed (`QryptAuthError`, `QryptInviteError`, `QryptCryptoError`,
  `QryptTransportError`) with stable `.code`s.
- Secrets are zeroized where possible; never serialized to logs.

## 7. Testing & acceptance

- Vitest unit coverage for every public method; crypto round-trip tests; a
  cross-client test that a message sealed by the SDK decrypts in the web client
  format and vice-versa.
- Integration test against a Supabase test project: full anon-invite e2e
  (signInAnonymously → register-anon → send → receive), and a phone-tier path.
- **Done when:** an external script can `npm i @qryptchat/sdk`, authenticate on
  all three tiers, send and receive an E2EE message, and stream live messages —
  headless, with the private key never leaving the process.

## 8. Risks / open questions

- Exact reuse of the web client's ML-KEM message format — must extract, not
  reimplement, to avoid format drift (`ENCRYPTION.md`,
  `CROSS_DEVICE_KEY_SYNC.md`).
- CoinPay OIDC without a browser: confirm device-code or loopback-capture is
  acceptable to the provider.
- WS→POST/SSE migration timing — ship transport interface now so neither break.
