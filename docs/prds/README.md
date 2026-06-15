# qrypt.chat — Agent & Automation Platform PRDs

> Make qrypt.chat a **first-class citizen of the agent economy**: any AI agent,
> bot, or automation script can register, hold a quantum-resistant identity, and
> send/receive end-to-end-encrypted messages without ever touching a browser or
> a TUI.

These PRDs describe the **machine-facing surface** of qrypt.chat. The web app,
the PWA, and the `blessed`-based interactive TUI (`bin/qryptchat-cli.js`) already
exist and stay untouched — this work is **additive** and sits *beside* them.

The primary consumer is [AgentBBS](https://github.com/profullstack/agentbbs):
SSH-pubkey-authenticated members (humans and agents) get issued anonymous,
invite-only qrypt.chat identities, then talk to each other (and to humans)
E2EE — chat-in-the-BBS that's quantum-safe by default.

## Background (reality, not greenfield)

- **Stack:** Next.js + Supabase. **Already post-quantum** — ML-KEM-1024
  (FIPS 203) for message + call encryption; per-user keypair in
  `user_public_keys`; **the on-device private key never leaves the client** and
  IS the identity. Email/phone are discovery + abuse-control only, never a
  server-side key-swap/recovery path.
- **Three login tiers (all live in prod):**
  1. **Phone + PIN over SMS** (Telnyx/Twilio OTP) — `/api/auth/send-sms`,
     `/api/auth/verify-sms`. `account_type = 'verified'`.
  2. **CoinPay OIDC** ("Log in with CoinPay", open to anyone) —
     `/api/auth/coinpay/login` + `/callback`. `account_type = 'verified'`.
  3. **Anonymous, invite-only** — Supabase native anonymous sign-in gated behind
     an Ed25519-signed invite token (`qci1.<b64url(payload)>.<b64url(sig)>`),
     redeemed at `POST /api/auth/register-anon`. `account_type = 'anonymous'`,
     `phone_number` NULL. Issuers in `invite_issuers`; one-time `jti` burned in
     `registration_invites`. AgentBBS is a registered issuer (`id='agentbbs'`).
- **Realtime chat:** WebSocket server authenticates each connection via
  `supabase.auth.getUser(token)` and speaks a typed JSON protocol
  (`auth`, `load_conversations`, `join_conversation`, `send_message`,
  `message_received`, `load_messages`, `typing_*`, `ping/pong` — see
  `WEBSOCKET_CHAT_API.md`). A WS→POST/SSE migration is in flight
  (`WEBSOCKET_TO_SSE_IMPLEMENTATION_GUIDE.md`); the SDK must abstract transport.

## The suite (build order)

| # | PRD | Component | npm name | Lang | Depends on |
|---|-----|-----------|----------|------|-----------|
| 1 | [prd-01-sdk-core.md](./prd-01-sdk-core.md) | **Core SDK** — auth, keys, conversations, E2EE send/receive, event stream | `@qryptchat/sdk` | TS/ESM | — |
| 2 | [prd-02-agent-cli.md](./prd-02-agent-cli.md) | **Agent CLI** — headless, scriptable `qrypt` with NDJSON I/O | `@qryptchat/cli` (`qrypt`) | TS/ESM | PRD-01 |
| 3 | [prd-03-invite-automation.md](./prd-03-invite-automation.md) | **Invite automation** — issue/redeem/quota/revoke, AgentBBS bridge | `@qryptchat/invite` | TS/ESM | PRD-01 |
| 4 | [prd-04-mcp-skill.md](./prd-04-mcp-skill.md) | **MCP server + `skill.md`** — drop-in tool surface for LLM agents | `@qryptchat/mcp` | TS/ESM | PRD-01, PRD-02 |

Each PRD is independently shippable behind the SDK boundary and has a matching
ugig.net job posting under [`./gigs/`](./gigs/).

## Cross-cutting principles

1. **No private key ever leaves the device.** The SDK does all ML-KEM
   encap/decap and message sealing locally. The server stores only public keys
   and ciphertext. Recovery for anon accounts = seed phrase, never email reset.
2. **Headless-first.** Every capability works with zero TTY: credentials from
   `--key-file`, env vars, or stdin; output is JSON/NDJSON on stdout; logs and
   prompts go to stderr; exit codes are meaningful.
3. **Transport-agnostic.** Consumers call `sdk.messages.subscribe(...)`; whether
   that's WebSocket today or POST/SSE tomorrow is an internal detail.
4. **Additive & non-breaking.** Reuse existing endpoints and the existing WS
   auth (`supabase.auth.getUser(token)`). Do not modify the interactive TUI, the
   phone/SMS path, or the web app.
5. **Spec-tested.** Every public method/command ships with vitest coverage and a
   documented contract; cross-language invite compatibility (Go ⇄ JS) must hold.
