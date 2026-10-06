# QryptChat

Quantum-resistant, end-to-end encrypted messaging.

## What you can do

- Send encrypted messages to other QryptChat users
- Make ML-KEM-1024 encrypted voice and video calls
- Share files with end-to-end encryption
- Set disappearing messages
- Register with just a phone number — no email required

## Authentication

Phone number + SMS verification code. No passwords.

## Terminal, scripts and agents: qc

`npm install -g @profullstack/qryptchat` installs `qc`:

- `qc` opens a full-screen chat client (emoji picker on Ctrl+E).
- `qc chats`, `qc read <chat>`, `qc send <chat> <text>` and `qc listen --json` are for scripts.
- `qc mcp` runs an MCP server on stdio with the tools `list_chats`, `read_chat` and `send_message`.

`qc login` signs in through the browser (OAuth 2.1, authorization code + PKCE). The browser seals the account's keys to a one-time ML-KEM-1024 key that qc generated, so messages are encrypted and decrypted on the machine running qc. The server only ever sees ciphertext.

Self-hostable via the open-source repo at https://github.com/profullstack/qryptchat-web
