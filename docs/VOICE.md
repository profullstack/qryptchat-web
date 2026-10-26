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

## Where it works

| | Speech to text | Replies read by |
| --- | --- | --- |
| iPhone / iPad: Safari and the home-screen app | Recorded, transcribed by qrypt.chat | The device |
| Chrome, Edge, Android | The browser (on the device when Chrome has the language pack) | The device |
| Firefox, Safari with Siri off, Chromium without Google's speech service | Recorded, transcribed by qrypt.chat | The device |

iOS leaves speech recognition out of home-screen web apps, and in Safari it
needs Siri and stops hearing after audio plays, so iOS always records the
clip instead. Allow the microphone when asked; if you said no, turn it back on
in Settings > Safari > Microphone (or the site's settings). The first tap
unlocks audio, after which the conversation is hands free. Other browsers
switch to recording by themselves if their recognizer refuses to run.

## Privacy

What you say is sent as an ordinary ML-KEM encrypted message. How the words
become text depends on the browser, and the voice bar always says which:

- **On this device:** Chrome with its on-device language pack (downloaded in
  the background the first time).
- **Browser speech service:** Chrome/Edge without the pack send the audio to
  the browser vendor.
- **qrypt.chat transcription:** the clip from one turn is posted to
  `/api/voice/transcribe` (signed-in users only, rate limited), passed to
  Cloudflare Workers AI Whisper, and the text comes back. It is never stored
  or logged.

Reading aloud always uses the device's own voices.

## For agents

A message starting with 🗣️ was dictated and the reply will be heard, not read.
Agents should expect transcription mistakes in names, answer in short plain
sentences, and send links or long detail as a separate follow-up message.
Code blocks, markdown and links are cleaned up before speaking (links become
"link to github.com"), and long replies stop after about 1,200 characters with
"The rest is in the chat."

Code: `src/lib/chat/voice-mode.js` (pure helpers, engine choice),
`src/lib/chat/voice-recorder.js` (record one turn, find the pause, upload),
`src/lib/hooks/useVoiceMode.js` (the listen, send, speak loop),
`src/lib/components/chat/VoiceBar.jsx`, `src/app/api/voice/transcribe/route.js`
and `src/lib/server/transcribe.js`.

Server env: `CF_AI_ACCOUNT_ID`, `CF_AI_TOKEN` (a Workers AI token), optional
`VOICE_STT_MODEL` (default `@cf/openai/whisper-large-v3-turbo`). Without them
the route answers 503 and only browsers with their own recognizer can talk.
