interface OTPEntryInterface {
  type: number; // OTPType
  index: number;
  issuer: string;
  secret: string | null;
  account: string;
  hash: string;
  counter: number;
  code: string;
  period: number;
  digits: number;
  algorithm: number; // OTPAlgorithm
  pinned: boolean;
  encData?: string;
  encryption?: EncryptionInterface;
  create(): Promise<void>;
  update(): Promise<void>;
  next(): Promise<void>;
  applyEncryption(encryption: EncryptionInterface): void;
  changeEncryption(encryption: EncryptionInterface): void;
  delete(): Promise<void>;
  generate(): void;
  genUUID(): void;
}

interface EncryptionInterface {
  getEncryptedString(data: string): string;
  decryptSecretString(entry: string): string | null;
  decryptEncSecret(entry: OTPEntryInterface): RawOTPStorage | null;
  getEncryptionStatus(): boolean;
  updateEncryptionPassword(password: string): void;
  getEncryptionKeyId(): string;
  setEncryptionKeyId(id: string): void;
}

interface RawOTPStorage {
  dataType?: "OTPStorage";
  account?: string;
  encrypted: boolean;
  keyId?: string;
  hash: string;
  index: number;
  issuer?: string;
  secret: string;
  type: string;
  counter?: number;
  period?: number;
  digits?: number;
  algorithm?: string;
  pinned?: boolean;
}

interface EncOTPStorage {
  dataType: "EncOTPStorage";
  keyId: string;
  data: string;
  index: number;
}

type OTPStorage = RawOTPStorage | EncOTPStorage;

interface OldKey {
  enc: string;
  hash: string;
}

interface Key {
  dataType: "Key";
  // UUID
  id: string;
  // Salt used to generate encryption key
  salt: string;
  // Hash of the encryption key
  hash: string;
  version: 3;
}

// ── Sync Data Model Types (Phase 2) ──

/**
 * Sync metadata attached to each OTP entry for
 * incremental cloud sync with conflict resolution.
 */
interface SyncMetadata {
  /** ISO-8601 timestamp of last modification */
  updatedAt: string;
  /** Monotonic version counter, incremented on each local change */
  version: number;
  /** true if entry was deleted locally (tombstone) */
  deleted?: boolean;
}

/**
 * OTP entry enriched with sync metadata for cloud storage.
 */
interface SyncEntry extends RawOTPStorage {
  sync: SyncMetadata;
}

/**
 * Complete sync manifest stored in cloud.
 * Contains all entries + global metadata for the sync dataset.
 */
interface SyncManifest {
  /** Format version for the manifest itself */
  manifestVersion: 1;
  /** ISO-8601 timestamp of last successful sync */
  lastSyncAt: string;
  /** Device identifier that performed the last sync */
  deviceId: string;
  /** All OTP entries keyed by hash */
  entries: { [hash: string]: SyncEntry };
}

/** Result of merging local and remote sync manifests */
interface SyncMergeResult {
  /** Merged entries to persist locally and upload */
  merged: { [hash: string]: SyncEntry };
  /** true if any changes were applied */
  hasChanges: boolean;
  /** Number of conflicts resolved via LWW */
  conflictsResolved: number;
  /** Number of new entries pulled from remote */
  pulled: number;
  /** Number of local entries pushed to remote */
  pushed: number;
}

// ── Sync Encryption Types (Phase 1) ──

/**
 * AES-256-GCM encrypted payload for cloud sync.
 * All fields are base64url-encoded binary data.
 */
interface SyncPayload {
  /** Payload format version, currently 1 */
  v: 1;
  /** Key derivation salt, 16 bytes base64url */
  salt: string;
  /** GCM nonce / IV, 12 bytes base64url */
  nonce: string;
  /** AES-256-GCM ciphertext, base64url */
  data: string;
}

/**
 * Sync encryption engine interface.
 * Provides E2E encryption for cloud sync data using
 * Argon2id → HKDF → AES-256-GCM chain.
 */
interface SyncEncryptionInterface {
  /**
   * Encrypt plaintext JSON string into a SyncPayload.
   * @param plaintext - UTF-8 string to encrypt
   * @param password  - user master password (raw, not hashed)
   */
  encrypt(plaintext: string, password: string): Promise<SyncPayload>;

  /**
   * Decrypt a SyncPayload back to plaintext JSON string.
   * Throws on tamper detection (GCM auth tag mismatch).
   * @param payload  - encrypted SyncPayload
   * @param password - user master password (raw, not hashed)
   */
  decrypt(payload: SyncPayload, password: string): Promise<string>;
}
