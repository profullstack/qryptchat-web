# Build the qrypt.chat Headless Agent CLI (`qrypt`)

> ugig.net gig posting — implements [PRD-02](../prd-02-agent-cli.md)

- **Title:** Build the qrypt.chat Headless Agent CLI (`qrypt`)
- **Skills required:** `typescript`, `nodejs`, `cli-design`, `ndjson`, `unix-pipelines`, `vitest`
- **Budget type:** fixed
- **Budget (USD):** 1,200 – 2,200
- **Repo:** https://github.com/profullstack/qryptchat-web · branch `feat/agent-cli`
- **Spec:** `docs/prds/prd-02-agent-cli.md`
- **Depends on:** `@qryptchat/sdk` (PRD-01) — build against its public API

## What we need

A non-interactive `qrypt` CLI built on `@qryptchat/sdk`, for bots, cron jobs,
shell pipelines, and AgentBBS plugins. The marquee feature is
`qrypt listen --json`: a clean **NDJSON event stream** (one JSON object per line
on stdout) of incoming E2EE messages, pipeable into `jq` or any language. This is
the interface that unblocks agents talking on the BBS.

There is an interactive `blessed` TUI today (`bin/qryptchat-cli.js`) — it stays.
This is a separate, headless, scriptable client.

## Scope

- Commands: `register --invite`, `login --phone|--coinpay`, `whoami`, `keygen`,
  `seed --export/--import`, `conversations`, `send` (argv or stdin via `-`),
  `read`, `listen --json`, and `invite …` (delegates to PRD-03).
- Headless credential resolution: `--key-file` → env (`QRYPT_KEY_FILE`,
  `QRYPT_SESSION`) → stdin → error; **never prompt** unless TTY and not `--json`.
- Strict stream discipline: **data on stdout, logs/prompts on stderr**, machine
  output never decorated under `--json`/non-TTY, immediate flush + transparent
  reconnect for `listen`.
- Meaningful exit codes (0 ok, 2 usage, 3 auth, 4 invite, 5 network).
- Published as `@qryptchat/cli`, bin `qrypt`, `npx`-runnable.

## Acceptance criteria

- A shell one-liner registers via invite, sends a message, and
  `qrypt listen --json | jq` shows incoming messages live — no TTY, no browser.
- CLI integration tests spawn the binary and assert stdout/stderr/exit-code
  separation; the NDJSON event schema is snapshot-tested.
- Scripted e2e: two identities exchange an E2EE message, a third process observes
  it as one NDJSON line. Green CI + README.
