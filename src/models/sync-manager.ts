/**
 * sync-manager.ts — Incremental sync engine with LWW conflict resolution
 *
 * Responsibilities:
 *  1. Convert local OTP entries ↔ SyncEntry (with metadata)
 *  2. Diff/merge local vs remote SyncManifest
 *  3. Resolve conflicts via Last-Write-Wins (LWW) on updatedAt
 *  4. Generate a stable device ID per browser instance
 *  5. Manage tombstones for deleted entries
 */

// ── Device ID ──

const DEVICE_ID_KEY = "syncDeviceId";

/**
 * Get or create a stable device identifier.
 * Stored in chrome.storage.local so it survives sync resets.
 */
export async function getDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(DEVICE_ID_KEY);
  if (result[DEVICE_ID_KEY]) {
    return result[DEVICE_ID_KEY];
  }
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
  return deviceId;
}

// ── SyncEntry helpers ──

/**
 * Wrap a RawOTPStorage into a SyncEntry with fresh metadata.
 */
export function toSyncEntry(
  raw: RawOTPStorage,
  existingMeta?: SyncMetadata
): SyncEntry {
  return {
    ...raw,
    sync: {
      updatedAt: new Date().toISOString(),
      version: existingMeta ? existingMeta.version + 1 : 1,
      deleted: false,
    },
  };
}

/**
 * Create a tombstone SyncEntry for a deleted entry.
 */
export function toTombstone(
  hash: string,
  existingMeta?: SyncMetadata
): SyncEntry {
  return {
    hash,
    index: -1,
    encrypted: false,
    secret: "",
    type: "totp",
    sync: {
      updatedAt: new Date().toISOString(),
      version: existingMeta ? existingMeta.version + 1 : 1,
      deleted: true,
    },
  };
}

/**
 * Strip sync metadata from a SyncEntry to get a plain RawOTPStorage.
 */
export function fromSyncEntry(entry: SyncEntry): RawOTPStorage {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sync, ...raw } = entry;
  return raw;
}

// ── Manifest construction ──

/**
 * Build a SyncManifest from local entries.
 * If previousManifest is provided, preserve existing sync metadata
 * for unchanged entries (same hash, same version).
 */
export async function buildManifest(
  localEntries: { [hash: string]: RawOTPStorage },
  previousManifest?: SyncManifest | null
): Promise<SyncManifest> {
  const deviceId = await getDeviceId();
  const entries: { [hash: string]: SyncEntry } = {};

  const prevEntries = previousManifest?.entries || {};

  for (const hash of Object.keys(localEntries)) {
    const raw = localEntries[hash];
    const prev = prevEntries[hash];
    if (prev && !hasEntryChanged(raw, prev)) {
      // Entry unchanged — keep existing metadata
      entries[hash] = { ...raw, sync: prev.sync };
    } else {
      // New or modified entry
      entries[hash] = toSyncEntry(raw, prev?.sync);
    }
  }

  // Add tombstones for entries that existed in previous manifest
  // but are no longer present locally
  if (previousManifest) {
    for (const hash of Object.keys(prevEntries)) {
      if (!(hash in localEntries) && !prevEntries[hash].sync.deleted) {
        entries[hash] = toTombstone(hash, prevEntries[hash].sync);
      }
    }
  }

  return {
    manifestVersion: 1,
    lastSyncAt: new Date().toISOString(),
    deviceId,
    entries,
  };
}

// ── Merge (LWW conflict resolution) ──

/**
 * Merge local and remote SyncManifests.
 * Uses Last-Write-Wins: for each entry hash, the version with
 * the later updatedAt timestamp wins. If timestamps are equal,
 * higher version number wins. If both equal, remote wins (conservative).
 */
export function mergeManifests(
  local: SyncManifest,
  remote: SyncManifest
): SyncMergeResult {
  const merged: { [hash: string]: SyncEntry } = {};
  let conflictsResolved = 0;
  let pulled = 0;
  let pushed = 0;
  let hasChanges = false;

  // Collect all unique hashes
  const allHashes = new Set([
    ...Object.keys(local.entries),
    ...Object.keys(remote.entries),
  ]);

  for (const hash of allHashes) {
    const localEntry = local.entries[hash];
    const remoteEntry = remote.entries[hash];

    if (localEntry && !remoteEntry) {
      // Local-only entry → push
      merged[hash] = localEntry;
      pushed++;
      hasChanges = true;
    } else if (!localEntry && remoteEntry) {
      // Remote-only entry → pull
      merged[hash] = remoteEntry;
      pulled++;
      hasChanges = true;
    } else if (localEntry && remoteEntry) {
      // Both sides have the entry → LWW
      const winner = resolveConflict(localEntry, remoteEntry);
      merged[hash] = winner;

      if (winner === localEntry && entryDiffers(localEntry, remoteEntry)) {
        pushed++;
        conflictsResolved++;
        hasChanges = true;
      } else if (
        winner === remoteEntry &&
        entryDiffers(localEntry, remoteEntry)
      ) {
        pulled++;
        conflictsResolved++;
        hasChanges = true;
      }
    }
  }

  return { merged, hasChanges, conflictsResolved, pulled, pushed };
}

/**
 * LWW conflict resolution: later updatedAt wins.
 * Tie-break: higher version wins. Still tied: remote wins.
 */
function resolveConflict(local: SyncEntry, remote: SyncEntry): SyncEntry {
  const localTime = new Date(local.sync.updatedAt).getTime();
  const remoteTime = new Date(remote.sync.updatedAt).getTime();

  if (localTime > remoteTime) return local;
  if (remoteTime > localTime) return remote;

  // Timestamps equal — compare version
  if (local.sync.version > remote.sync.version) return local;
  if (remote.sync.version > local.sync.version) return remote;

  // All equal — remote wins (conservative: don't lose remote data)
  return remote;
}

// ── Change detection ──

/**
 * Check if a RawOTPStorage entry differs from its SyncEntry counterpart.
 * Compares semantic fields, ignoring sync metadata.
 */
function hasEntryChanged(raw: RawOTPStorage, sync: SyncEntry): boolean {
  return (
    raw.secret !== sync.secret ||
    raw.issuer !== sync.issuer ||
    raw.account !== sync.account ||
    raw.type !== sync.type ||
    raw.counter !== sync.counter ||
    raw.period !== sync.period ||
    raw.digits !== sync.digits ||
    raw.algorithm !== sync.algorithm ||
    raw.index !== sync.index ||
    raw.pinned !== sync.pinned
  );
}

/**
 * Check if two SyncEntries have different content (ignoring metadata).
 */
function entryDiffers(a: SyncEntry, b: SyncEntry): boolean {
  return (
    a.secret !== b.secret ||
    a.issuer !== b.issuer ||
    a.account !== b.account ||
    a.type !== b.type ||
    a.counter !== b.counter ||
    a.period !== b.period ||
    a.digits !== b.digits ||
    a.algorithm !== b.algorithm ||
    a.index !== b.index ||
    a.pinned !== b.pinned ||
    a.sync.deleted !== b.sync.deleted
  );
}

// ── Tombstone cleanup ──

/** Tombstone retention period: 30 days */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove expired tombstones from a manifest.
 * Tombstones older than 30 days are permanently purged.
 */
export function purgeTombstones(manifest: SyncManifest): SyncManifest {
  const now = Date.now();
  const entries = { ...manifest.entries };

  for (const hash of Object.keys(entries)) {
    const entry = entries[hash];
    if (entry.sync.deleted) {
      const deletedAt = new Date(entry.sync.updatedAt).getTime();
      if (now - deletedAt > TOMBSTONE_TTL_MS) {
        delete entries[hash];
      }
    }
  }

  return { ...manifest, entries };
}
