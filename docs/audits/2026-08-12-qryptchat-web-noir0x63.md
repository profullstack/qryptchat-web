> **Archival note — added by the maintainers, not part of the submission.**
> This is an unsolicited third-party security report received from an external researcher.
> It is archived here verbatim for the record. **It has not been accepted as-is** — several
> severities are inflated and one Critical is misclassified. Read it alongside the
> maintainer verification in [`2026-08-14-noir0x63-verification.md`](./2026-08-14-noir0x63-verification.md)
> before acting on anything below.

---

# QryptChat — Web Application Security Assessment

| Field | Value |
|---|---|
| **Project** | QryptChat (Independent Research) |
| **Assessment Date** | 2026-08-12 |
| **Auditor** | Eduardo Camarillo (Noir0x63) |
| **Distribution** | Confidential |

---

## About the Researcher

My name is **Eduardo Camarillo**, an independent security researcher known online as [Noir0x63](https://noir0x63.org). My work focuses on applied cryptography, zero-trust architecture, and secure systems engineering. This assessment was conducted independently via static analysis and local blackbox testing. No production systems or user data were accessed. My intent is solely responsible disclosure.

---

## 1. Executive Summary

A comprehensive security audit of **QryptChat** (advertising ML-KEM-1024 E2EE) revealed severe structural authorization flaws. Despite the project's "zero-knowledge" claims, the current codebase allows complete unauthenticated compromise of the platform's user data.

**Overall Risk Rating: CRITICAL**

- **Critical:** The July 2026 security patch (RLS data leak) was never versioned into the repository. New deployments expose all user data (`phone_number`, `backup_pin_hash`, public keys).
- **Critical:** The `delete_encrypted_data_only` (`SECURITY DEFINER`) function lacks ownership checks, allowing unauthenticated remote destruction of any user's encrypted data (messages, keys, files).
- **High:** Multiple IDORs and authorization bypasses permit identity spoofing, account takeover, and real-time surveillance of user calls without authentication.

**Key Recommendation:** Re-establish security change control. Patch the RLS policies immediately, revoke `PUBLIC` access to `SECURITY DEFINER` functions, and enforce `auth.uid()` checks in all RPCs.

---

## 2. Findings Summary

| ID | Finding | Severity | Component |
|---|---|---|---|
| QRY-01 | Incident 2026-07 RLS patch never versioned | **Critical** | Supabase Migrations |
| QRY-02 | `delete_encrypted_data_only` unauth data destruction | **Critical** | Supabase RPC |
| NEW-03 | `/api/users/by-username/` exposes internal `id` | **High** | Web API |
| QRY-03 | `get_inactive_participants` leaks phone numbers | **High** | Supabase RPC |
| QRY-04 | IDOR in call history and sessions | **High** | Supabase RPC |
| QRY-05 | `sync_user_with_auth` spoofing and phone overwrite | **High** | Supabase RPC |
| QRY-06 | User enumeration via `/api/users/search` | **High** | Web API |
| NEW-01 | `getSession()` lacks JWT re-validation | **High** | Web API |
| NEW-02 | IDOR in `get_user_active_calls` | **High** | Supabase RPC |
| QRY-07 | `is_otp_valid_extended` unconditionally returns true | Medium | Supabase RPC |
| QRY-08 | `fn_create_message_recipients` lacks validation | Medium | Supabase RPC |
| QRY-09 | 95 dependency vulnerabilities (52 high) | Medium | Supply chain |
| NEW-04 | Unsalted SHA-256 for backup PIN | Medium | Web API |
| NEW-05 | In-memory rate limiter evasions | Medium | Web API |
| NEW-06 | `GET /api/plugins` filesystem enumeration | Medium | Web API |
| NEW-09 | `cleanup/legacy-messages` without user scope | Medium | Web API |
| NEW-07 | Full `phone_number` in production logs | Low | Web API |
| QRY-10 | Outdated docs & build artifacts in git history | Info | Repository |
| NEW-08 | Supabase Project-ref hardcoded in HEAD | Info | Repository |

---

## 3. Critical & High Findings Detail

### QRY-01 — RLS Patch Never Versioned (Critical)

The fix for the July 2026 data leak was applied manually to production but never merged into the repository. Current migrations still contain `USING (true)` for `users`, `messages`, and `user_public_keys`.

- **Impact:** Any new deployment allows full extraction of PII (phones, PIN hashes, keys) using the public anon key.
- **Remediation:** Commit the `lock_down_public_rls_read_access` migration.

### QRY-02 & NEW-03 — Unauthenticated Remote Data Destruction (Critical)

`delete_encrypted_data_only` is a `SECURITY DEFINER` function that accepts an attacker-controlled `authenticated_user_id` without verifying it against `auth.uid()`. By obtaining a victim's internal ID via the unauthenticated `/api/users/by-username/` endpoint (NEW-03), an attacker can use the public anon key to permanently delete the victim's messages, keys, and files.

- **Impact:** Unauthenticated mass destruction of user data. (Fully corroborated in local blackbox testing).
- **Remediation:** `REVOKE EXECUTE FROM PUBLIC` on the function. Ensure `auth.uid()` matches the requested user ID. Remove internal IDs from public API responses.

### Authorization Bypasses & Surveillance (High)

- **QRY-04 & NEW-02:** `get_user_call_history` and `get_user_active_calls` fail to check `auth.uid()`, allowing attackers to monitor any user's call history and real-time active calls using their internal ID.
- **QRY-05:** `sync_user_with_auth` allows associating a victim's phone number to an attacker's account or overwriting active accounts due to lack of `auth.uid()` checks.
- **QRY-03 & QRY-06:** Phone numbers leak via `get_inactive_participants` (no membership check) and `/api/users/search` (allows single-digit enumeration).
- **NEW-01:** Destructive cleanup routes use `getSession()` (reads local cookie) instead of `getUser()` (revalidates JWT with server), allowing authentication bypass via tampered cookies.

*Note: Medium, Low, and Informational findings are summarized in Section 2. Detailed technical logs and reproduction steps are available upon request.*

---

## 4. Exploitation Chains

- **Chain E (Anonymous Mass Destruction):**
  Enumerate usernames → Get internal ID via `/api/users/by-username/` → Call `delete_encrypted_data_only` with anon key → Data destroyed.

- **Chain A (PII Compromise on New Deploys):**
  Use anon key on fresh instance → Extract `users` table due to `USING(true)` RLS → Obtain phone numbers and PIN hashes.

- **Chain F (Real-Time Surveillance):**
  Get internal ID → Poll `get_user_active_calls` → Monitor target's active calls.

---

## 5. Researcher Contact

To coordinate full report delivery (including detailed evidence and reproduction steps for all 19 findings), clarify technical details, or agree on a remediation window, contact:

| | |
|---|---|
| **Website** | [noir0x63.org](https://noir0x63.org) |
| **Signal** | noir0x.63 |

Public disclosure will be coordinated with the project maintainers following a reasonable remediation window.

---

## Authorship and Certification

**Lead Researcher:**
Eduardo Camarillo (*Noir0x63*)
*Independent Security Researcher*
[noir0x63.org](https://noir0x63.org)

**Signature Date:** August 13, 2026

*Source code verified directly against the `qryptchat-web` repository. All active exploitation was conducted in a strictly isolated local replica. No production systems were accessed or compromised.*
