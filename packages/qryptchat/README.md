# qc

[qrypt.chat](https://qrypt.chat) in your terminal: a full-screen, end-to-end encrypted chat client, a scriptable CLI and an MCP server, all in one command.

```sh
npm install -g @profullstack/qryptchat     # or: bun add -g @profullstack/qryptchat
qc
```

The first run signs you in through your browser, then opens your chats.

## The client

```
 🔒 qrypt.chat   @you                                                    ● live
┌ Chats ──────────┐┌ alice ───────────────────────── 2 people · ML-KEM-1024 ┐
│▸ alice        2 ││ ───────────────────── Tue 6 Oct ─────────────────────  │
│  team chat      ││ alice  14:02                                           │
│  ops            ││   shipped it 🚀                                        │
│                 ││ you  14:03                                             │
│                 ││   🔥🔥                                                 │
│                 ││ alice is typing…                                       │
│                 ││  Message alice  (Ctrl+E emoji, :rocket: works too)     │
└─────────────────┘└────────────────────────────────────────────────────────┘
 ENTER send  CTRL+E emoji  TAB chats  PGUP scroll  CTRL+C quit
```

| Key | Does |
|---|---|
| Enter | send (or open the highlighted chat) |
| Ctrl+E | the emoji picker: search, recents and every group, drawn with [OpenEmoji](https://github.com/profullstack/openemoji) |
| `:rocket:` | shortcodes turn into emoji when you send |
| Tab / Esc | move between the chat list and the composer |
| Ctrl+N / Ctrl+P | next / previous chat |
| PgUp / PgDn, wheel | scroll back through the conversation |
| Ctrl+R | reload |
| Ctrl+C | quit |

The mouse works too: click a chat, scroll the transcript, click an emoji. Unread counts, typing indicators and new messages arrive live.

## Scripts and agents

```sh
qc chats                        # id and name of every chat
qc read alice -n 20             # the last 20 messages, decrypted
qc send alice "on my way"       # encrypted to every participant
echo "deploy done" | qc send ops -
qc listen --json                # new messages as NDJSON, until you stop it
qc whoami
```

`<chat>` is a chat id or any unique part of its name. Add `--json` for machine output.

### MCP

```sh
qc mcp
```

runs an MCP server on stdio with three tools: `list_chats`, `read_chat` and `send_message`. Encryption and decryption happen on this machine; the server only ever sees ciphertext. For Claude Code:

```sh
claude mcp add qryptchat -- qc mcp
```

## Signing in

`qc login` uses OAuth 2.1 (authorization code + PKCE), started from the terminal:

1. qc opens `qrypt.chat/cli/authorize` with a one-time ML-KEM-1024 public key and prints a confirmation code.
2. You check the browser shows the same code, then approve.
3. The browser seals your keys to that one-time key, and qc receives them plus a session of its own. The server only relays ciphertext.

Over SSH, `qc login --oob` shows a code in the browser for you to paste instead of redirecting back.

Your keys and tokens are **never stored in plaintext**. `~/.config/qc/session.json` (or `$QC_HOME`) keeps only your username and the server URL in the clear. Everything else is sealed with ChaCha20-Poly1305 under a key from:

- your OS keychain (macOS Keychain, or libsecret's `secret-tool` on a Linux desktop), so you're never asked; or
- a passphrase, stretched with scrypt. qc asks for it once per run; scripts and `qc mcp` read it from `QC_PASSPHRASE`.

Sessions refresh themselves and are re-sealed each time. `qc logout` deletes them. Point at another server with `--url` or `QC_URL`.

## Licence

MIT. Emoji: OpenEmoji by Profullstack, Inc. (CC BY 4.0).
