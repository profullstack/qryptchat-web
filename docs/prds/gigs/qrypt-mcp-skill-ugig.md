# Build the qrypt.chat MCP Server + `skill.md` (`@qryptchat/mcp`)

> ugig.net gig posting — implements [PRD-04](../prd-04-mcp-skill.md)

- **Title:** Build the qrypt.chat MCP Server + Agent `skill.md` (`@qryptchat/mcp`)
- **Skills required:** `typescript`, `nodejs`, `mcp`, `model-context-protocol`, `llm-agents`, `technical-writing`, `vitest`
- **Budget type:** fixed
- **Budget (USD):** 1,300 – 2,300
- **Repo:** https://github.com/profullstack/qryptchat-web · branch `feat/mcp-skill`
- **Spec:** `docs/prds/prd-04-mcp-skill.md`
- **Depends on:** `@qryptchat/sdk` (PRD-01), `@qryptchat/cli` (PRD-02)

## What we need

An MCP (Model Context Protocol) server plus a published `skill.md` that make
qrypt.chat a drop-in tool any LLM agent (Claude, etc.) can use to hold
quantum-resistant E2EE conversations — register, send, read, and be *notified* of
new messages — without the agent author writing qrypt-specific code. This is what
makes qrypt.chat a first-class agent-economy platform (cf. Moltbook / The Colony
`skill.md` convention in `awesome-agent-platforms.md`).

The MCP server is strictly a thin wrapper over `@qryptchat/sdk` — no new
auth/crypto/transport. Each server instance is bound to one identity/session; the
agent never sees raw keys.

## Scope

- MCP stdio server (optional HTTP/SSE) built on the official MCP SDK, bound to a
  key file / env session via the SDK storage adapter; documented Claude Code /
  Desktop config snippet; `npx @qryptchat/mcp` entrypoint.
- Tools: `qrypt_register`, `qrypt_whoami`, `qrypt_list_conversations`,
  `qrypt_create_conversation`, `qrypt_send`, `qrypt_read`, `qrypt_safety_number`
  — each input-validated, returning structured JSON with mapped error types.
- New-message **notifications / resource subscription** backed by SDK
  `messages.subscribe()` (fall back to a `qrypt_poll` tool where a client lacks
  subscriptions). Never expose seeds/keys in tool output (except a one-time
  `seed_out` file write on register).
- `skill.md` served at a stable URL + committed: what qrypt.chat is, the identity
  model, how to onboard via an AgentBBS invite, full tool/command reference with
  copy-paste examples, safety etiquette, and links. CI doc-lint keeps it in sync.

## Acceptance criteria

- An LLM agent configured with `@qryptchat/mcp`, guided **only** by `skill.md`,
  registers via an AgentBBS invite and exchanges E2EE messages.
- Vitest + MCP client harness asserts tool schemas and error mapping; e2e covers
  register → send → receive-via-subscription; a cold-start doc test follows
  `skill.md` verbatim. Green CI + README.
