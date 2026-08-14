# QryptChat — Triage of the Noir0x63 report (verified 2026-08-14)

Companion to [`2026-08-12-qryptchat-web-noir0x63.md`](./2026-08-12-qryptchat-web-noir0x63.md)
(the original third-party submission). This document is the maintainer verification of it.

Verification method: static review of `qryptchat-web` @ `0375cef`, plus
**read-only** SQL against the live `qrypt.chat` Supabase project (`xydzwxwsbgmznthiiscl`).
No destructive RPC was called. No data was modified.

**Bottom line: the report is technically sound.** Its headline critical (QRY-02) is confirmed
against production. Its other headline critical (QRY-01) is confirmed as *repo drift* but is
**not** currently exploitable in prod. Several severities are inflated, one finding is dead code,
and the report **missed** the issue I'd rank second-most serious.

---

## 1. Confirmed against PRODUCTION — fix now

### QRY-02 — anon can execute destructive SECURITY DEFINER RPCs (CRITICAL, real)

Live query result:

| function | SECURITY DEFINER | `anon` EXECUTE | body checks `auth.uid()` |
|---|---|---|---|
| `delete_encrypted_data_only(uuid,uuid)` | yes | **yes** | **no** |
| `get_user_call_history(uuid,int)` | yes | **yes** | **no** |
| `get_user_active_calls(uuid)` | yes | **yes** | **no** |
| `get_inactive_participants(uuid)` | yes | **yes** | **no** |
| `sync_user_with_auth(text,uuid,text,text)` | yes | **yes** | **no** |
| `fn_create_message_recipients(uuid,jsonb)` | yes | **yes** | **no** |
| `is_otp_valid_extended(text,text,int)` | yes | **yes** | **no** |

The migrations do `GRANT EXECUTE ... TO authenticated` but **never `REVOKE ... FROM PUBLIC`**, so
`anon` keeps the default PUBLIC grant. That is the whole bug.

`delete_encrypted_data_only` does have a check — but it is only *self-consistency*:

```sql
IF target_user_id != authenticated_user_id THEN
    RAISE EXCEPTION 'Users can only delete their own data';
END IF;
```

An attacker passes the **same** victim UUID twice and both checks pass. The report's
"lacks ownership checks" is accurate in substance: there is no binding to `auth.uid()`.

**Chain E is real.** `/api/users/by-username/[username]` returns the internal `id`
unauthenticated (service-role read, deliberate — see its own code comment), which supplies the
UUID. Anon key + that UUID = permanent deletion of a victim's messages, keys, files.

**Scope is wider than reported.** Supabase's own linter on this project returns:

- **48 ×** `anon_security_definer_function_executable`
- **48 ×** `authenticated_security_definer_function_executable`
- 30 × `auth_allow_anonymous_sign_ins`

The report named 8. There are 48.

### QRY-09 — dependency vulnerabilities (real, numbers match exactly)

`pnpm audit` on HEAD: **95 vulnerabilities — 4 low, 39 moderate, 52 high**, 685 total deps.
This matches the report's "95 / 52 high" digit-for-digit, which is good evidence the researcher
actually ran against this tree rather than boilerplating.

### NEW-04 — unsalted SHA-256 backup PIN (real, and worse than rated)

`src/app/api/auth/backup-pin/route.js:101` — `crypto.subtle.digest('SHA-256', pin)`, no salt,
no KDF, no iteration. A numeric PIN keyspace falls instantly. See §2 for why this is worse than
the report says.

---

## 2. The finding the report MISSED (rate this High)

Production RLS on `users`:

```
users_select_authenticated | SELECT | {authenticated} | USING (true)
```

The `users` table has columns `phone_number`, `backup_pin_hash`, **and** `salt`. So **any single
logged-in account** can read the phone number, PIN hash, and salt of **every user on the
platform**. That is one throwaway signup away.

Combine with NEW-04: dump all `backup_pin_hash` values, and because they are unsalted SHA-256 of
a short PIN, recover every user's backup PIN with one precomputed table. The report rated the
weak hash "Medium" in isolation and never connected it to the readable hash column. Chained,
this is the cleanest path to mass key-backup compromise in the whole set.

**Fix:** restrict `users_select_authenticated` to non-sensitive columns (or move sensitive
columns to a separate table / column-level grants), and rehash PINs with Argon2id or scrypt
using the existing per-user `salt`.

---

## 3. Confirmed as repo drift, NOT live exposure

### QRY-01 — RLS patch never versioned (real drift; severity overstated)

The repo's latest migrations still contain, for the `anon`-reachable path:

- `20250926135540_add_unique_user_identifiers.sql` → `CREATE POLICY "Anyone can read user unique identifiers" ON users FOR SELECT USING (true);`
- `20250824052548_fix_conversations_recursion.sql` → `CREATE POLICY "Users can read all messages" ON messages FOR SELECT USING (true);`

Production, however, **is** patched — the live policies are `users_select_authenticated` and
`messages_select_participant` (a proper participant check). Neither exists in any migration file.
Migrations stop at `20260629120000`.

So: the July 2026 fix was applied out-of-band and never versioned. `by-username/route.js` even
carries a comment asserting *"RLS on `users` is restricted to the `authenticated` role"* — a
guarantee that exists nowhere in the repo.

**Verdict:** the *drift* is genuine and genuinely dangerous — any fresh deploy, branch DB, or
`db reset` reintroduces anon-readable `users` and `messages`. But "new deployments expose all
user data" is a **future/CI risk**, not the current prod state. Rating it Critical alongside a
live unauthenticated-destruction bug conflates two very different things.

---

## 4. Overstated, downgrade

| ID | Report | Reality | Suggested |
|---|---|---|---|
| QRY-06 `/api/users/search` | High, "user enumeration" | Requires auth — uses `getUser()` correctly. Returns only `***-***-1234`. But min query length is 1 char and it does match on `phone_number`, so an authenticated attacker can confirm/enumerate full numbers. | Medium |
| NEW-06 `GET /api/plugins` | Medium, "filesystem enumeration" | Reads one fixed `community-plugins/` dir and returns curated `plugin.json` metadata. Not arbitrary traversal. | Info |
| QRY-07 `is_otp_valid_extended` | Medium | Body is `RETURN TRUE;` — accurate. But **zero callers in `src/`**. Dead placeholder code. Still worth dropping (it's anon-executable). | Info |
| NEW-08 hardcoded project ref | Info | Supabase project ref and anon key are public by design. | Non-issue |

## 5. Confirmed but needs your call on severity

**NEW-01 + NEW-09 (these are one bug, and the pair matters more than either alone).**

Two routes authenticate with `getSession()` instead of `getUser()`:

- `src/app/api/cleanup/legacy-messages/route.js:11`
- `src/app/api/cleanup/empty-conversations/route.js:11`

`getSession()` reads the cookie without revalidating the JWT against the auth server. 21 route
files in `src/app/api` correctly use `getUser()`; only 3 use `getSession()`, and the third
(`auth/session/route.js`) is legitimately a session-reading endpoint. These two are the outliers.

Worse, `legacy-messages` then does this with **no user scoping at all**:

```js
.from('messages')
.select('id, encrypted_content')
.or('encrypted_content.ilike.%FALLBACK%,encrypted_content.ilike.%ML-KEM-768%')
.limit(1000)
// ...then deletes every id it found
```

It deletes up to 1000 matching messages **platform-wide**, not the caller's. It binds `userId`
from the session only to log it. Whether RLS saves you depends on the client returned by
`createSupabaseClient()` — worth confirming, but the route should not be written this way
regardless.

## 6. Not verified

NEW-05 (rate-limiter evasion — `src/lib/server/rate-limiter.js` exists with trusted-proxy
parsing, not audited), NEW-07 (phone numbers in logs), QRY-10 (git history artifacts).

---

## 7. Suggested immediate remediation

Not applied — this is prod and it isn't my project. Run when ready.

**Step 1 — stop the bleeding (blocks Chain E, keeps the app working since `authenticated` is granted explicitly):**

```sql
REVOKE EXECUTE ON FUNCTION public.delete_encrypted_data_only(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_call_history(uuid, integer)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_active_calls(uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_inactive_participants(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_user_with_auth(text, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_create_message_recipients(uuid, jsonb)   FROM PUBLIC, anon;
DROP FUNCTION IF EXISTS public.is_otp_valid_extended(text, text, integer);
```

Then sweep the other ~42 the linter flags.

**Step 2 — bind ownership to the session, not to the argument:**

```sql
-- inside delete_encrypted_data_only, replace the self-consistency check
IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = target_user_id AND auth_user_id = auth.uid()
) THEN
    RAISE EXCEPTION 'Not authorized';
END IF;
```

Apply the same pattern to the call-history / active-calls / inactive-participants functions.

**Step 3 — version the drift.** Write the live `users_select_authenticated` and
`messages_select_participant` policies into a migration, *and* add a migration that drops the
stale `USING (true)` policies by name, so a fresh `db reset` cannot resurrect them.

**Step 4 — narrow `users_select_authenticated`** so `phone_number` / `backup_pin_hash` / `salt`
are not readable by every logged-in account (§2), and rehash PINs with Argon2id + the per-user salt.

**Step 5 —** switch the two `getSession()` routes to `getUser()` and scope
`legacy-messages` deletion to the caller.

---

## 8. On the report itself

Shape is the familiar coordinated-disclosure-with-leverage pattern: unsolicited, severities
skewed upward, full details withheld pending contact, Signal handle, "reasonable remediation
window."

That said — **the technical content holds up.** The audit numbers match exactly, QRY-02 is
confirmed live, and the QRY-01 drift claim is precisely correct. Treat the findings as real
regardless of how you feel about the delivery. Also note there is nothing here you cannot verify
yourself, as this document demonstrates: no payment or NDA is needed to reproduce any of it.
