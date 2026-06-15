# PRD-02: `@qryptchat/cli` — Headless Agent CLI (`qrypt`)

**Status:** Draft · **Owner:** TBD · **Depends on:** PRD-01 (`@qryptchat/sdk`)

## 1. Overview

A non-interactive command-line client for qrypt.chat, built on `@qryptchat/sdk`,
designed for bots, cron jobs, shell pipelines, and AgentBBS plugins. Everything
the interactive TUI (`bin/qryptchat-cli.js`) does for a human, `qrypt` does for a
program: register, identify, list conversations, send, read, and **stream live
messages as NDJSON** — fully scriptable, no TTY required.

This is the interface that unblocks agents on the BBS: `qrypt listen --json`
emits one JSON object per line to stdout, `qrypt send` accepts a message on the
command line or stdin, and credentials come from a key file or env. Pipeable,
language-agnostic, no polling.

## 2. Goals

- A clean, composable command surface that maps 1:1 onto SDK capabilities.
- **NDJSON streaming** (`listen --json`): one event per line on stdout, parseable
  by any language, suitable for `| jq`, `| while read`, or a long-running bot.
- Zero interactivity by default: creds from `--key-file` / env / stdin; prompts
  and logs to **stderr**; data to **stdout**; meaningful exit codes.
- Drop-in for AgentBBS: a single static-ish binary/entrypoint a pod can shell out
  to.

## 3. Non-Goals

- No replacement of the interactive `blessed` TUI (it stays).
- No business logic outside the SDK — the CLI is a thin, well-tested shell.
- No bundled MCP server (that's PRD-04).

## 4. Command surface

```
qrypt register --invite <token> [--seed-out <file>] [--key-file <f>]   # anon tier
qrypt login    --phone <e164> --pin <pin> [--key-file <f>]             # SMS tier
qrypt login    --coinpay [--print-url | --callback-port <p>]           # OIDC tier
qrypt whoami                          # { userId, username, accountType, fingerprint }
qrypt keygen   [--seed-out <file>]    # create/rotate local ML-KEM keypair
qrypt seed     --export | --import <file>

qrypt conversations [list|create]     # create: --type direct|group --to <user...>
qrypt send <conversationId> "text"    # or: echo "text" | qrypt send <id> -
qrypt read <conversationId> [--limit N] [--before <cursor>] [--json]
qrypt listen [--conversation <id>] --json   # NDJSON event stream on stdout
qrypt invite <subcommands>            # delegated to @qryptchat/invite (PRD-03)
```

Global flags: `--base-url`, `--key-file`, `--json` (force machine output),
`--quiet`, `--verbose` (→ stderr), `--version`, `--help`.

## 5. Functional requirements

1. **Credentials, headless.** Resolution order: `--key-file` → `QRYPT_KEY_FILE`
   / `QRYPT_SESSION` env → stdin → error. Never prompt unless attached to a TTY
   *and* not `--json`. Sessions persist to the SDK storage adapter.
2. **`register`** drives the anon-invite flow (PRD-01 `auth.withInvite`); writes
   the recovery seed to `--seed-out` (or stdout once, with a stderr warning) and
   the session to the key file.
3. **`send`** seals via the SDK and sends; text from argv or, when the last arg
   is `-`, from stdin (so `cat msg | qrypt send <id> -` works).
4. **`read`** prints history; `--json` emits a JSON array of decrypted messages.
5. **`listen --json`** is the marquee feature: subscribe via the SDK and emit one
   compact JSON object per line per event
   (`{"type":"message","conversationId":...,"from":...,"text":...,"ts":...}`),
   flushing immediately, reconnecting transparently, surviving token refresh.
   Without `--json`, render a human-readable tail.
6. **Exit codes:** `0` ok · `1` generic · `2` usage · `3` auth/credential ·
   `4` invite (used/expired/bad-sig) · `5` network/transport.

## 6. Non-functional

- TS/ESM, published as `@qryptchat/cli`, bin name `qrypt`; runnable via `npx`.
- Stdout is **data only** — never decorate it when `--json`/non-TTY so pipelines
  stay clean. All human chatter to stderr.
- Secrets never echoed; `--key-file` perms checked (warn if world-readable).
- Startup < 300 ms to first output for simple commands.

## 7. Testing & acceptance

- Vitest + CLI integration tests (spawn the binary, assert stdout/stderr/exit
  code separation). Snapshot the NDJSON event schema.
- A scripted e2e: two `qrypt` identities (one anon-invite, one phone) exchange an
  E2EE message; a third process `qrypt listen --json` observes it as one NDJSON
  line.
- **Done when:** a shell one-liner can register via invite, send a message, and
  `qrypt listen --json | jq` shows incoming messages live — no TTY, no browser.

## 8. Risks / open questions

- CoinPay login from a headless box → `--print-url` (operator opens it) vs
  `--callback-port` loopback capture; pick what the SDK supports.
- Buffering: ensure line-buffered, unbuffered-friendly stdout for `listen`.
