/**
 * sync-orchestrator.ts — High-level sync workflow
 *
 * Orchestrates the full sync cycle:
 *  1. Check policy (master password required)
 *  2. Export local entries → build SyncManifest
 *  3. Download remote encrypted payload → decrypt → remote SyncManifest
 *  4. Merge local + remote via LWW
 *  5. Encrypt merged manifest → upload
 *  6. Apply remote changes to local storage
 */

import { Dropbox, Drive, OneDrive } from "./backup";
import { Encryption } from "./encryption";
import { UserSettings } from "./settings";
import { EntryStorage } from "./storage";
import { SyncEncryption } from "./sync-encryption";
import {
  buildManifest,
  mergeManifests,
  fromSyncEntry,
  purgeTombstones,
} from "./sync-manager";
import {
  isSyncEnabled,
  checkSyncReadiness,
  SyncPolicyError,
} from "./sync-policy";

export interface SyncResult {
  success: boolean;
  error?: string;
  pulled: number;
  pushed: number;
  conflictsResolved: number;
}

/**
 * Get the configured backup provider instance for sync.
 */
function getProvider(): BackupProvider | null {
  const provider = UserSettings.items.syncProvider;
  switch (provider) {
    case "drive":
      return new Drive();
    case "dropbox":
      return new Dropbox();
    case "onedrive":
      return new OneDrive();
    default:
      return null;
  }
}

/**
 * Execute a full sync cycle.
 *
 * @param password - user's master password (needed for E2E encryption)
 * @param encryption - current Encryption instance for reading local entries
 */
export async function performSync(
  password: string,
  encryption: Encryption
): Promise<SyncResult> {
  // Step 0: Policy check
  if (!(await isSyncEnabled())) {
    return {
      success: false,
      error: "Sync is not enabled",
      pulled: 0,
      pushed: 0,
      conflictsResolved: 0,
    };
  }

  const policyError = await checkSyncReadiness();
  if (policyError) {
    const msg =
      policyError === SyncPolicyError.NoMasterPassword
        ? "Master password is required for sync"
        : "No sync provider configured";
    return {
      success: false,
      error: msg,
      pulled: 0,
      pushed: 0,
      conflictsResolved: 0,
    };
  }

  await UserSettings.updateItems();
  const provider = getProvider();
  if (!provider || !provider.uploadSync || !provider.downloadSync) {
    return {
      success: false,
      error: "Sync provider not available",
      pulled: 0,
      pushed: 0,
      conflictsResolved: 0,
    };
  }

  const syncEnc = new SyncEncryption();

  try {
    // Step 1: Build local manifest
    // backupGetExport returns OTPStorage (may include EncOTPStorage).
    // Filter to RawOTPStorage only — encrypted entries that could not
    // be decrypted are skipped (they lack a usable secret).
    const rawExport = await EntryStorage.backupGetExport(encryption, false);
    const localEntries: { [hash: string]: RawOTPStorage } = {};
    for (const hash of Object.keys(rawExport)) {
      const entry = rawExport[hash];
      if ("secret" in entry && "encrypted" in entry) {
        localEntries[hash] = entry as RawOTPStorage;
      }
    }

    const previousManifestJson = UserSettings.items.lastSyncManifest;
    const previousManifest: SyncManifest | null = previousManifestJson
      ? JSON.parse(previousManifestJson)
      : null;

    const localManifest = await buildManifest(localEntries, previousManifest);

    // Step 2: Download and decrypt remote manifest
    let remoteManifest: SyncManifest | null = null;
    const remotePayload = await provider.downloadSync();

    if (remotePayload) {
      const decryptedJson = await syncEnc.decrypt(remotePayload, password);
      remoteManifest = JSON.parse(decryptedJson) as SyncManifest;
    }

    // Step 3: Merge
    let mergeResult: ReturnType<typeof mergeManifests>;
    let finalManifest: SyncManifest;

    if (remoteManifest) {
      mergeResult = mergeManifests(localManifest, remoteManifest);
      finalManifest = {
        ...localManifest,
        entries: mergeResult.merged,
        lastSyncAt: new Date().toISOString(),
      };
    } else {
      // First sync — local is the source of truth
      mergeResult = {
        merged: localManifest.entries,
        hasChanges: true,
        conflictsResolved: 0,
        pulled: 0,
        pushed: Object.keys(localManifest.entries).length,
      };
      finalManifest = localManifest;
    }

    // Step 4: Purge expired tombstones
    finalManifest = purgeTombstones(finalManifest);

    // Step 5: Encrypt and upload merged manifest
    const manifestJson = JSON.stringify(finalManifest);
    const encryptedPayload = await syncEnc.encrypt(manifestJson, password);
    const uploaded = await provider.uploadSync(encryptedPayload);

    if (!uploaded) {
      return {
        success: false,
        error: "Upload failed",
        pulled: 0,
        pushed: 0,
        conflictsResolved: 0,
      };
    }

    // Step 6: Apply pulled entries to local storage
    if (mergeResult.pulled > 0) {
      const importData: { [hash: string]: RawOTPStorage } = {};
      for (const hash of Object.keys(finalManifest.entries)) {
        const entry = finalManifest.entries[hash];
        if (!entry.sync.deleted) {
          importData[hash] = fromSyncEntry(entry);
        }
      }
      await EntryStorage.import(encryption, importData);
    }

    // Step 7: Persist sync state
    UserSettings.items.lastSyncAt = new Date().toISOString();
    UserSettings.items.lastSyncManifest = manifestJson;
    await UserSettings.commitItems();

    return {
      success: true,
      pulled: mergeResult.pulled,
      pushed: mergeResult.pushed,
      conflictsResolved: mergeResult.conflictsResolved,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error";
    console.error("Sync failed:", message);
    return {
      success: false,
      error: message,
      pulled: 0,
      pushed: 0,
      conflictsResolved: 0,
    };
  }
}
