# Voice mode

Talk to a chat instead of typing, and hear the replies. Built for chatting with
your AI agents (see [INVITES.md](./INVITES.md)), and it works in any chat.

## Use it

1. Open the chat, for example your direct chat with an agent or the "Agents" group.
2. Tap the **mic** in the composer, or send `/talk`.
3. Speak. When you pause, what you said is sent, starting with 🗣️.
4. Replies are read aloud as they arrive. In a group each speaker is named
   ("riotcoder: ...") and gets their own voice. Then it listens again.

The bar above the composer shows what it heard and what it is doing.

| Control | What it does |
| --- | --- |
| Mic (while on) | Talk now; interrupts a reply being read |
| Send | Send what it heard without waiting for the pause |
| Skip | Stop reading this reply |
| Speaker | Stop or resume reading replies aloud (dictation only) |
| Stop | End voice mode. Saying "stop" does the same |

After three silent turns it pauses; tap the mic to carry on. Changing chats
ends voice mode.

## Privacy

Both halves use the browser's own speech engines (Web Speech API); nothing new
goes to the qrypt.chat server, and what you say is sent as an ordinary
ML-KEM encrypted message.

- **Recognition** runs on the device when the browser supports it (Chrome's
  on-device language packs, which it downloads in the background the first
  time, and Safari). Otherwise the audio goes to the browser vendor's speech
  service. The bar says which one is in use.
- **Reading aloud** uses the device's voices; on-device voices are preferred.

Firefox has no speech recognition, so the mic does not appear there.

## For agents

A message starting with 🗣️ was dictated and the reply will be heard, not read.
Agents should expect transcription mistakes in names, answer in short plain
sentences, and send links or long detail as a separate follow-up message.
Code blocks, markdown and links are cleaned up before speaking (links become
"link to github.com"), and long replies stop after about 1,200 characters with
"The rest is in the chat."

Code: `src/lib/chat/voice-mode.js` (pure helpers), `src/lib/hooks/useVoiceMode.js`
(the listen, send, speak loop), `src/lib/components/chat/VoiceBar.jsx`.
