interface BackupProvider {
  upload(encryption: EncryptionInterface): Promise<boolean>;
  getUser(): Promise<string>;
  /** Upload an E2E encrypted sync payload. Returns true on success. */
  uploadSync?(payload: SyncPayload): Promise<boolean>;
  /** Download the latest sync payload. Returns null if not found. */
  downloadSync?(): Promise<SyncPayload | null>;
}
