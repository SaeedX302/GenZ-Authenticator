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

## 其他說明

- 如需調整入口或打包設定，請查看 `webpack.config.js`、`webpack.dev.js`、`webpack.prod.js`。
- 各平台 manifest 位於 `manifests/`。
