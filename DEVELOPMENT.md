# 開發與測試指南

本文件整理 ZeroOTP 的開發、建置與測試流程，方便快速上手。

## 環境需求

- Node.js（建議 LTS）
- npm（隨 Node 安裝）

## 安裝依賴

```bash
npm install
```

若要可重現的乾淨安裝（CI/正式建置）：

```bash
npm ci
```

## 開發（Chrome）

啟動 Chrome 開發建置與監看：

```bash
npm run dev:chrome
```

編譯結果會輸出到 `./test/chrome`。在 Chrome 進入擴充功能頁面，選擇「載入未封裝項目」，並指向 `./test/chrome` 目錄。

## 建置（多平台）

各平台建置命令：

```bash
npm run chrome
npm run firefox
npm run edge
```

生產版建置（同時輸出多平台）：

```bash
npm run prod
```

建置腳本會：

- 清理舊輸出目錄
- 執行 `prettier` 與 `eslint`
- 編譯 Webpack 與 Sass
- 根據平台輸出到對應目錄（`chrome/`、`firefox/`、`edge/` 或 `release/`）

## 測試

執行測試：

```bash
npm run test
```

測試流程會先跑 `npm run pretest`（內含編譯與檢查），再執行 `scripts/test-runner.js`。

## 常見輸出目錄

- `dist/`：Webpack 編譯輸出
- `css/`：Sass 編譯輸出
- `chrome/`、`firefox/`、`edge/`、`release/`、`test/`：平台封裝輸出

## 模組架構

### 核心模組

```
src/models/
├── otp.ts              # OTPEntry 類別、OTPType/OTPAlgorithm 枚舉
├── encryption.ts       # 本地 AES 加密（CryptoJS，用於 chrome.storage）
├── storage.ts          # BrowserStorage / EntryStorage 持久層
├── settings.ts         # UserSettings，含同步設定項
├── password.ts         # Argon2id 密碼雜湊（iframe sandbox）
├── key-utilities.ts    # HMAC-SHA1/256/512 及 GOST OTP 產碼
├── backup.ts           # Dropbox / Drive / OneDrive 備份 + 同步上下載
├── migration.ts        # Google Authenticator 遷移格式解析
├── credentials.ts      # API 憑證（建置時注入）
│
│   ── Cloud Sync 模組（v8.2.0+）──
├── sync-encryption.ts  # E2E 加密引擎：Argon2id → HKDF → AES-256-GCM
├── sync-manager.ts     # 同步資料模型、LWW 衝突解決、tombstone 管理
├── sync-policy.ts      # 強制密碼策略：無主密碼禁止啟用同步
└── sync-orchestrator.ts# 同步編排器：串聯加密、diff/merge、雲端上下載
```

### Cloud Sync 資料流

```
本地 OTP 條目
    ↓  EntryStorage.backupGetExport()
RawOTPStorage{}
    ↓  buildManifest()
SyncManifest { entries, deviceId, lastSyncAt }
    ↓  mergeManifests(local, remote)   ← 下載遠端 + 解密
SyncMergeResult { merged, pulled, pushed, conflictsResolved }
    ↓  SyncEncryption.encrypt(JSON, password)
SyncPayload { v:1, salt, nonce, data }
    ↓  provider.uploadSync()
雲端儲存 (Drive / Dropbox / OneDrive)
```

### 衝突解決策略

採用 **Last-Write-Wins (LWW)**：

1. 比較 `updatedAt` 時間戳，較新者勝出
2. 時間戳相同時比較 `version` 計數器，較高者勝出
3. 全部相同時遠端勝出（保守策略，避免丟失遠端資料）
4. 刪除的條目以 tombstone 形式保留 30 天，之後清除

### 型別定義

同步相關型別定義在 `src/definitions/otp.d.ts`：

- `SyncPayload` — 加密後的傳輸格式
- `SyncEncryptionInterface` — 加密引擎介面
- `SyncMetadata` — 條目同步元資料（updatedAt、version、deleted）
- `SyncEntry` — 附帶同步元資料的 OTP 條目
- `SyncManifest` — 完整同步清單
- `SyncMergeResult` — 合併結果

### 設定項

`UserSettings`（`src/models/settings.ts`）新增以下 local-only 設定：

| Key | Type | 說明 |
|-----|------|------|
| `syncProvider` | `string` | 雲端供應商：`"drive"` / `"dropbox"` / `"onedrive"` |
| `syncEnabled` | `boolean` | 是否啟用同步 |
| `syncInterval` | `number` | 同步間隔（分鐘，預設 5） |
| `lastSyncAt` | `string` | 上次同步時間 (ISO-8601) |
| `lastSyncManifest` | `string` | 上次同步的 SyncManifest JSON 快取 |

## 其他說明

- 如需調整入口或打包設定，請查看 `webpack.config.js`、`webpack.dev.js`、`webpack.prod.js`。
- 各平台 manifest 位於 `manifests/`。
- 安全架構詳見 `SECURITY.md`。
