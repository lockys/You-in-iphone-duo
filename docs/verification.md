# 驗證紀錄

2026-09-10，Windows、Node.js 24.15.0、Modern.js 3.9.0、React 19.3.0、TypeScript 6.0.3。前端使用 Rsbuild／Rspack；原生 FFmpeg 6.1.1、ffprobe 4.0.2。

## 本次結果

| 檢查 | 結果 |
| --- | --- |
| lint、typecheck | 通過 |
| Vitest | 7 檔、73 項通過，約 28 秒 |
| 完整 Playwright | 28 項通過，約 2.2 分鐘；最後串流邊界修正後，三瀏覽器合成流程另 3 項通過 |
| 最後的 metadata／viewport 專項 | Chromium 桌機、手機、WebKit 三項通過 |
| Modern.js production build | 通過 |
| `npm run dev` | 使用 tsx 正常啟動，英文 SSR、原生上傳／預覽轉碼／刪除實測通過 |
| Vercel Linux Preview build | 3e25e0e 部署 READY，原生工具與模板打包成功 |
| Vercel Build Output API 產物 | 本機啟動通過：SSR、模板 API、FFmpeg／ffprobe、串流設定與缺少儲存設定錯誤 |
| 可攜式 Node 產物 | 實際啟動，完成 FFmpeg 合成、1920×1080 H.264 串流下載及刪除 |
| MP4 驗證 | H.264 High、yuv420p、1920×1080、29.97 fps、約 5.84 秒、faststart、完整解碼通過 |
| Docker | 已更新使用 Modern.js Node 產物；本機沒有 Docker，未執行容器 build／run |
| 真實雲端 API | 已連接私有 Blob 至 Production／Preview；7,238,086 bytes 測試影片完成直傳、FFmpeg 轉碼／合成、私有下載及刪除。此測試早於後續改成 5 MB 上限 |
| 正式 Vercel | 清理排程 CRON_SECRET 設定尚待授權，因此尚未更新正式網域 |

## Vercel 問題與回歸測試

舊正式版的 `GET /api/template` 正常，但以合成測試素材呼叫 `POST /api/upload` 得到使用者回報的 500／`error.generic`。在 API 測試中讓工作目錄的 mkdir 回傳 EROFS，可重現相同錯誤；改用 OS 暫存目錄後，真實上傳及轉碼通過。

原本的 process Map 與本機磁碟也無法保證跨 Vercel instance 延續。新增私有 Blob adapter 後，測試在上傳、合成、下載之間清空 module cache，仍能完成真正的 FFmpeg 輸出。離線測試替換 Blob 遠端儲存及 token issuer；另外已在真正的 Vercel Preview／Private Blob 完成 API 端到端實測。

另外檢查來源路徑簽章範圍、MIME／大小、過期與路徑穿越、跨 session 讀取／刪除權限、跨 instance 配額與工作上限、損壞影片清理、私有下載 redirect、缺少儲存設定，以及 Cron 授權。

`scripts/verify-deployment.mjs` 直接載入 Modern.js 產生的 Vercel function，未使用開發伺服器代替。Windows 產物約 161 MiB，不包含使用者影片或 .env；Linux 產物也已在 Vercel 成功建置為 READY。真實雲端 API 測試使用部署 dpl_EqBHD2jf7tL7wBia98xGeB2SVvs1，測試素材已刪除，下載的成品亦通過 ffprobe、完整解碼與三個時間點影格檢查。

## 上傳限制與錯誤提示

- 上傳上限調整為 5 MiB（5,242,880 bytes），前端、Blob ticket／簽章及磁碟串流一致；舊 MAX_UPLOAD_MB=200 設定也無法放寬。剛好上限可接受，多一個位元組即拒絕。
- 真實雲端瀏覽器測試發現 Blob redirect 導致 Canvas 污染，修正影片載入的 crossOrigin，並加入實際跨 origin 影片伺服器回歸測試；Chromium 桌機、手機及 WebKit 皆通過。
- 錯誤統一使用畫面頂端提示：簡短具體訊息、可關閉、保留必要重試動作、44px 按鈕與安全區域；分享 dialog 開啟及頁面捲動時仍可看見，三瀏覽器驗證通過。
- 訊息原則參考 Apple 的 [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) 與 [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)；頂端位置依本網站需求設計。

## 瀏覽器與影片

- 三個瀏覽器完成匯入、Canvas 真實像素、開始時間、cover／縮放／位移、音訊、原生合成、播放、下載及重新編輯；原生單指與雙指操作以 Chromium CDP 驗證。
- 三語的 SSR HTML、title／description、Cookie 偏好、錯誤與切換時狀態保留均通過。頁面只有一個 viewport，允許瀏覽器縮放。
- 右側浮動列、320–1440px／橫向尺寸、安全間距與 44px 點擊範圍；浮動預覽持續使用相同 Canvas／影片、可拖到右側且為 88% 不透明度。
- 分享以真正的 MP4 驗證；系統分享／外部 intent 邊界使用測試替身，未發布社群貼文。
- 開頭／中間／結尾影格已目視檢查：內容只出現在螢幕，手、邊框及白底保留，沒有明顯綠邊。彩條素材本身含綠色，並非殘留綠幕。
- 紫色格線輸入另外抽樣 7 個時間點，綠幕核心殘留比例皆為 0，手部／背景平均通道誤差約 1.4／255，確認動態展開後仍維持 cover 與原始比例。

證據位於本機忽略目錄 `evidence/`：`cloud-output.mp4`、`output-ffprobe.json`、`output-0.png` 至 `output-2.png`、`pixel-verification.json`、各瀏覽器的編輯／分享／浮動預覽截圖。

## 重跑

`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`、`npm run verify:video`。部署產物使用 `npm run deploy -- vercel` 後執行 `npm run verify:deployment`。

Windows 的 WebKit 測試需要一般原生媒體執行權限。自動化的 iPhone 尺寸 WebKit 不等於實體 iPhone／Safari 驗收；最後的 5 MB 上限與跨網域預覽修正仍需新版部署實測。
