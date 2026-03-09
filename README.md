# Vanilla Calculator

一個零依賴（Vanilla HTML/CSS/JS）的網頁計算機，可直接部署到 GitHub Pages。

## 功能
- 基本四則運算（+ − × ÷）
- 小數點
- 清除（C）、退格（⌫）、正負（±）、百分比（%）
- 記憶功能：MC / MR / M+ / M-（使用 localStorage 保存）
- 鍵盤操作：`0-9`、`.`、`+ - * /`、`Enter`/`=`、`Backspace`、`Escape`

## 開發
本專案不需要 build。
- 直接用瀏覽器打開 `index.html`
- 或用任意靜態伺服器（例如 `python -m http.server`）

## 部署
此 repo 設計為 GitHub Pages（root `index.html`）。

## 安全
計算不使用 `eval()`，以簡單的 token + precedence 計算。
