# Security Policy

## Supported Versions

We support the latest versions published on the Chrome, Firefox, and Edge extension stores.

## Reporting a Vulnerability

Report potential vulnerabilities privately via [this form](https://github.com/GenZ-Authenticator/GenZ-Authenticator/security/advisories/new).
Where appropriate, include a proof-of-concept and reproduction steps.
We strive to provide an initial response within five days, but as this is a volunteer-run project, we make no guarantees.

---

## Encryption Architecture (v8.2.0+)

GenZ-Authenticator uses two independent encryption subsystems：

### 1. Local Entry Encryption (Legacy)

Used for encrypting OTP entries stored in `chrome.storage`.

| Component | Implementation |
|-----------|---------------|
| Algorithm | AES (CryptoJS) |
| KDF | Argon2id (sandboxed iframe) |
| Key Storage | `Key` objects with salt + hash in browser storage |
| Password Cache | `chrome.storage.session` with autolock timer |

### 2. Cloud Sync Encryption (E2E)

Used for encrypting data before uploading to cloud storage providers (Google Drive, Dropbox, OneDrive). **This is a mandatory layer — cloud sync cannot be enabled without a master password.**

#### Key Derivation Chain

```
Master Password (user input)
    |
    v
Argon2id(password, random_salt_16B)  -->  master_key (256-bit)
    |
    v
HKDF-SHA256(master_key, salt, "GenZ-Authenticator-sync-v1")  -->  AES key (256-bit)
    |
    v
AES-256-GCM(key, random_nonce_12B, plaintext)  -->  ciphertext + authTag
```

#### SyncPayload Format

```json
{
  "v": 1,
  "salt": "<16 bytes, base64url>",
  "nonce": "<12 bytes, base64url>",
  "data": "<ciphertext + GCM authTag, base64url>"
}
```

#### Security Properties

| Property | Guarantee |
|----------|-----------|
| Confidentiality | AES-256-GCM; cloud providers never see plaintext |
| Integrity | GCM 128-bit authentication tag; tampered ciphertext is rejected |
| Freshness | Random salt + nonce per encryption; identical data produces different ciphertext |
| Key Derivation | Argon2id (memory-hard) + HKDF-SHA256 (domain separation) |
| No Third-Party Crypto | Web Crypto API only; zero dependency on CryptoJS for sync |
| Mandatory Encryption | `sync-policy.ts` enforces master password before enabling sync |

#### Threat Model

| Threat | Mitigation |
|--------|------------|
| Cloud provider compromise | E2E encryption; provider only stores opaque ciphertext |
| Ciphertext tampering | GCM authTag rejects modified data |
| Brute-force password attack | Argon2id with memory-hard parameters |
| Replay of old sync data | Nonce uniqueness + LWW merge with timestamps |
| Cross-device key leakage | Encryption keys are derived per-session, never stored or transmitted |

#### Implementation Files

| File | Role |
|------|------|
| `src/models/sync-encryption.ts` | AES-256-GCM encrypt/decrypt via Web Crypto API |
| `src/models/sync-policy.ts` | Enforces master password requirement |
| `src/models/sync-manager.ts` | Sync data model, LWW conflict resolution |
| `src/models/sync-orchestrator.ts` | Full sync workflow orchestration |

---

*Last updated: 2026-04-13*