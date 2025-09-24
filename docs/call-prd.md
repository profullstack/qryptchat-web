Perfect — thanks for clarifying the cryptographic baseline. Let’s integrate those key details directly into the PRD so it’s unambiguous how your PWA’s encrypted calling will work with **FIPS 203 post-quantum cryptography (ML-KEM)**.

---

# PRD: E2EE Voice/Video Calls with ML-KEM (Post-Quantum)

## 1. Overview

The chat application must provide **end-to-end encrypted (E2EE) audio/video calls** with security against both classical and quantum adversaries. Media transport is built on **WebRTC**, while key establishment uses **ML-KEM** as standardized in **FIPS 203**.

---

## 2. Goals

* Secure all new calls with **ML-KEM-1024**.
* Maintain **ML-KEM-768** only for backward compatibility with older clients.
* Derive ephemeral **SRTP/SFrame keys** from the ML-KEM shared secret.
* Support **1:1 calls** and **group calls via SFU** in browser-based PWAs (desktop + mobile).

---

## 3. Non-Goals

* Legacy RSA/ECDH fallback.
* PSTN or SIP integration.
* Server-side decryption (no compliance mode).

---

## 4. Requirements

### 4.1 Functional

1. **1:1 Calls**

   * Caller and callee exchange **ML-KEM-1024** public keys via E2EE signaling.
   * Run **ML-KEM encapsulation/decapsulation** → derive shared secret.
   * Use that secret as input to a KDF → export SRTP/SFrame keys.
   * All media encrypted end-to-end.

2. **Group Calls**

   * Creator generates **Group Call Key (GCK)**.
   * Distributes GCK via E2EE messaging (itself secured with ML-KEM session).
   * Each participant derives per-sender SRTP/SFrame keys from GCK.
   * Media routed through SFU but opaque (E2EE).

3. **Backward Compatibility**

   * If a participant only supports **ML-KEM-768**, the session falls back.
   * Clients advertise supported parameter sets in the call offer.

---

### 4.2 Technical

* **Cryptographic Algorithms**

  * **Primary:** ML-KEM-1024

    * Public key: 1568 bytes
    * Private key: 3168 bytes
  * **Fallback:** ML-KEM-768

    * Public key: 1184 bytes
    * Private key: 2400 bytes

* **Standards Compliance**

  * FIPS 203 (ML-KEM)
  * FIPS 204 (future use if migrating signatures to ML-DSA)

* **Message Flow**

  * Signaling over WebSocket (TLS 1.3) → E2EE wrapper.
  * Key exchange: ML-KEM encaps/decap.
  * Media transport: WebRTC with DTLS-SRTP + Insertable Streams (SFrame).
  * Key rotation: New ML-KEM encapsulation round or fresh GCK on membership change.

* **Key Management**

  * No long-term reuse of call/session secrets.
  * Keys discarded at call termination.
  * Rekey on participant join/leave.

---

## 5. Security Considerations

* **Quantum resistance:** ML-KEM-1024 for new sessions.
* **Fallback risks:** ML-KEM-768 acceptable short-term but flagged in UI/logs.
* **Forward secrecy:** Fresh encapsulation per call, plus per-sender SFrame nonce derivation.
* **Server trust:** Signaling and SFU are untrusted — never hold ML-KEM secrets.

---

## 6. Success Metrics

* 100% of new calls negotiated with **ML-KEM-1024**.
* Backward compatibility mode logged and observable.
* Group calls scale to ≥ 8 participants with stable E2EE.

---

## 7. Open Questions

* Should we bundle **hybrid mode** (X25519+ML-KEM) for additional classical compatibility?
* Do we enforce *mandatory upgrade* to 1024 after a grace period?
* Should client advertise algorithm support via **protocol extension field** in SDP?

---

✅ This PRD version bakes in your ML-KEM-1024/768 requirements and FIPS 203 compliance.