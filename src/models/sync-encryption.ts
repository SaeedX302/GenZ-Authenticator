/**
 * sync-encryption.ts — E2E encryption engine for cloud sync
 *
 * Security chain:
 *   Master Password
 *     → Argon2id(password, salt)  → masterKey (256-bit)
 *     → HKDF(masterKey, "zerootp-sync-v1") → syncKey (AES-256)
 *     → AES-256-GCM(syncKey, nonce, plaintext) → SyncPayload
 *
 * Uses Web Crypto API exclusively (no CryptoJS dependency).
 * GCM provides authenticated encryption — tampered ciphertext
 * will throw on decrypt.
 */

import { argonHash } from "./password";

// ── Constants ──

/** KDF salt length in bytes */
const SALT_LENGTH = 16;
/** GCM nonce length in bytes (NIST recommended) */
const NONCE_LENGTH = 12;
/** AES key length in bits */
const AES_KEY_BITS = 256;
/** HKDF info string — change this to rotate key domains */
const HKDF_INFO = "zerootp-sync-v1";
/** Current payload format version */
const PAYLOAD_VERSION = 1;

// ── Base64url helpers (RFC 4648 §5, no padding) ──

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) {
    b64 += "=";
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Key derivation ──

/**
 * Derive a 256-bit master key from password using Argon2id,
 * then derive a domain-specific AES-256-GCM key via HKDF-SHA256.
 *
 * @param password - raw user master password
 * @param salt     - 16-byte random salt (hex string for Argon2)
 * @returns CryptoKey suitable for AES-256-GCM
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Step 1: Argon2id hash (password + salt) → master key material
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const argonResult = await argonHash(password, saltHex);
  if (!argonResult) {
    throw new Error("Argon2id key derivation failed");
  }

  // Extract raw hash from Argon2 encoded string
  // Format: $argon2id$v=19$m=...,t=...,p=...$salt$hash
  const parts = argonResult.split("$");
  const rawHashB64 = parts[parts.length - 1];

  // Decode Argon2 base64 output to raw bytes
  const masterKeyBytes = fromBase64Url(rawHashB64);

  // Step 2: Import master key material for HKDF
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    "HKDF",
    false,
    ["deriveKey"]
  );

  // Step 3: HKDF-SHA256 → AES-256-GCM key
  const encoder = new TextEncoder();
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: encoder.encode(HKDF_INFO),
    },
    hkdfKey,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );

  return aesKey;
}

// ── Public API ──

export class SyncEncryption implements SyncEncryptionInterface {
  /**
   * Encrypt plaintext into a SyncPayload.
   *
   * Each call generates a fresh salt + nonce, so identical
   * plaintext produces different ciphertext every time.
   *
   * @param plaintext - UTF-8 string (typically JSON)
   * @param password  - user master password
   * @returns SyncPayload ready for upload
   */
  async encrypt(plaintext: string, password: string): Promise<SyncPayload> {
    if (!password) {
      throw new Error("Sync encryption requires a master password");
    }

    // Generate fresh random salt and nonce
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

    // Derive AES-256-GCM key
    const key = await deriveKey(password, salt);

    // Encrypt
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      encoder.encode(plaintext)
    );

    return {
      v: PAYLOAD_VERSION,
      salt: toBase64Url(salt),
      nonce: toBase64Url(nonce),
      data: toBase64Url(ciphertext),
    };
  }

  /**
   * Decrypt a SyncPayload back to plaintext.
   *
   * Throws if:
   *  - Password is wrong (GCM auth tag mismatch)
   *  - Ciphertext was tampered with
   *  - Payload version is unsupported
   *
   * @param payload  - encrypted SyncPayload
   * @param password - user master password
   * @returns decrypted UTF-8 string
   */
  async decrypt(payload: SyncPayload, password: string): Promise<string> {
    if (!password) {
      throw new Error("Sync decryption requires a master password");
    }

    if (payload.v !== PAYLOAD_VERSION) {
      throw new Error(`Unsupported sync payload version: ${payload.v}`);
    }

    // Decode base64url fields
    const salt = fromBase64Url(payload.salt);
    const nonce = fromBase64Url(payload.nonce);
    const ciphertext = fromBase64Url(payload.data);

    // Derive same AES-256-GCM key
    const key = await deriveKey(password, salt);

    // Decrypt — throws DOMException on auth tag failure
    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        ciphertext
      );
    } catch {
      throw new Error(
        "Sync decryption failed: wrong password or data tampered"
      );
    }

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
}

// ── Utility exports for testing ──

export { toBase64Url, fromBase64Url, PAYLOAD_VERSION };
