# Phone calls

Call ordinary phones from qrypt.chat, the way Skype used to: [qrypt.chat/phone](https://qrypt.chat/phone),
`qc call <number>` (opens the dialer) and `qc phone` (minutes, credit, recent calls).

- **Free:** 10 minutes a day (UTC) to the US and Canada for every signed-in account. Anonymous accounts
  get none.
- **Credit:** $5, $10 or $25 on CoinPay's checkout (crypto or PayPal); it never expires. US/Canada past the
  free minutes costs 1¢ a minute. Other countries (71 open, in `ALLOWED_COUNTRIES`) cost twice what our
  carrier charges us for that call, read from Telnyx's call records; no destination over 10¢/min carrier cost
  is allowed, so a call is limited up front as if it cost 20.4¢/min.
- **Not end-to-end encrypted:** calls to phones go over the public phone network. Calls between qrypt.chat
  users stay end-to-end encrypted.
- The person you call sees +1 949-284-7328. 911 and other service codes, premium-rate and shared-cost numbers
  cannot be called.

## How it works

The browser's line is a per-user Telnyx WebRTC credential that can only *receive* calls. `POST /api/phone/call`
checks the number and the allowance, rings that line through a Call Control app, and when the browser answers
transfers it to the number with `time_limit_secs` = the allowance, so Telnyx itself ends the call. Webhooks
(`/api/phone/webhook`, Ed25519-signed) drive billing; `POST /api/phone/topup` + `/api/phone/coinpay-webhook`
add credit exactly once per checkout. Code: `src/lib/phone/rules.js`, `src/lib/server/phone.js`,
`src/lib/server/phone-credit.js`, `src/lib/server/telnyx-voice.js`.

## Agents on the phone

Anthony's agents can make calls for him (`agent-phone call <number> --goal "..."` on the agent host). Telnyx
transcribes the other side and speaks the agent's lines in its ElevenLabs voice; the agent says it is an AI
assistant in its first line and reports the outcome in the chat. The host takes no inbound connections:
Telnyx posts events to `/api/phone/agent-webhook` and the agent long-polls `/api/phone/agent-events`.
