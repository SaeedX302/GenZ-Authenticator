/**
 * sync-policy.ts — Enforces security policies for cloud sync
 *
 * Core rule: cloud sync MUST NOT be enabled without a master password.
 * This prevents plaintext OTP secrets from being uploaded to cloud storage.
 */

import { EntryStorage } from "./storage";
import { UserSettings } from "./settings";

export enum SyncPolicyError {
  /** User has not set a master password */
  NoMasterPassword = "SYNC_NO_MASTER_PASSWORD",
  /** No cloud provider configured */
  NoProvider = "SYNC_NO_PROVIDER",
}

/**
 * Check if cloud sync can be safely enabled.
 * Returns null if OK, or a SyncPolicyError describing the problem.
 */
export async function checkSyncReadiness(): Promise<SyncPolicyError | null> {
  // Rule 1: Encryption key must exist (i.e., master password has been set)
  const hasKey = await EntryStorage.hasEncryptionKey();
  if (!hasKey) {
    return SyncPolicyError.NoMasterPassword;
  }

  // Rule 2: A cloud provider must be configured
  await UserSettings.updateItems();
  const provider = UserSettings.items.syncProvider;
  if (!provider) {
    return SyncPolicyError.NoProvider;
  }

  return null;
}

/**
 * Enable cloud sync after passing all policy checks.
 * Throws if policy checks fail.
 */
export async function enableSync(provider: string): Promise<void> {
  // Verify encryption exists before enabling
  const hasKey = await EntryStorage.hasEncryptionKey();
  if (!hasKey) {
    throw new Error(
      "Cannot enable sync: master password is required. " +
        "Set a master password first to protect your OTP secrets."
    );
  }

  await UserSettings.updateItems();
  UserSettings.items.syncProvider = provider;
  UserSettings.items.syncEnabled = true;
  UserSettings.items.syncInterval = UserSettings.items.syncInterval || 5;
  await UserSettings.commitItems();
}

/**
 * Disable cloud sync and clear sync-related local state.
 */
export async function disableSync(): Promise<void> {
  await UserSettings.updateItems();
  UserSettings.items.syncEnabled = false;
  UserSettings.items.lastSyncAt = undefined;
  UserSettings.items.lastSyncManifest = undefined;
  await UserSettings.commitItems();
}

/**
 * Check if sync is currently active.
 */
export async function isSyncEnabled(): Promise<boolean> {
  await UserSettings.updateItems();
  return UserSettings.items.syncEnabled === true;
}
