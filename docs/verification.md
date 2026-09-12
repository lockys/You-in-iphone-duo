# 驗證紀錄

## 2026-09-12：排隊與雙影片

- lint、typecheck、Modern.js Node production build 通過；Vitest 13 檔、105 項全數通過。
- Production Playwright 的 editor、queue、dual-video 三組流程共 27 項全數通過（桌機 Chromium、手機 Chromium、手機 WebKit）；双影片流程另重複執行 6 次通過。
- 使用真實紅色有聲與藍色無聲短片合成，驗證切換前後影格顏色、第二段靜音、獨立設定、單影片回退，以及跨使用者素材存取拒絕。
- `evidence/dual-output.mp4` 通過 1920×1080、H.264、yuv420p、模板時長、faststart 與完整解碼。已目視檢查摺疊／展開影格與手機預覽，手部、邊框與背景保留。
- Blob API 使用隔離儲存替身並執行真實 FFmpeg；以上不代表正式 Vercel 部署或實體手機驗收。

2026-09-10，Windows、Node.js 24.15.0、Modern.js 3.9.0、React 19.3.0、TypeScript 6.0.3。前端使用 Rsbuild／Rspack；原生 FFmpeg 6.1.1、ffprobe 4.0.2。

## 摺疊效果

- 將 MIT 授權的 [chuspeeism/iphone-duo](https://github.com/chuspeeism/iphone-duo/tree/2662ebbeb6aa844cd4f6888f7d6f8958662249fd) 螢幕投影及模糊／變暗漸層改編至 Canvas 與原生 FFmpeg；三語介面可開關。README 標明來源、版權與授權，完整 MIT 聲明隨網站發布。
- 原生遮罩逐像素對照共用計算。FFV1 的遮罩採 16 列，避免過薄影格的 slice 編碼問題；38 KB 遮罩隨模板打包，不包含使用者影片。
- 原生效果保留螢幕範圍的原始解析度。六分鐘來源從第 305 秒、1.2 倍縮放及 X=0.15 的合成峰值為 453,172 KiB（約 443 MiB），低於 512 MiB 回歸預算。
- 修正 Modern.js Node 靜態影片缺少 Content-Length／Range 回應造成的跳轉歸零；加入 HEAD、206、suffix range 與 416 測試。
- lint、typecheck、Modern.js production build、Vitest 11 檔 93 項通過。真實 MP4 的 1920×1080、H.264、yuv420p、faststart、模板長度與完整解碼通過。
- 完整 Playwright 34 項通過（3.4 分鐘）：桌機 Chromium、手機 Chromium、手機 WebKit 都完成三語效果開關、指定摺疊影格的 Canvas／MP4 像素比較、播放及下載。
- 已目視檢查開頭、外螢幕轉動、內螢幕展開及結尾共 8 個影格；手部與邊框完整，摺疊側出現漸層模糊及陰影，固定側保持清晰。另有 7 個時間點的原生像素回歸。

效果校準與近似方式詳見 [fold-effect.md](fold-effect.md)。瀏覽器及正式站的最終驗證見本次 GitHub PR。

## 長影片合成的記憶體修正

正式站接受六分鐘影片後，合成的 Vercel instance 曾因記憶體不足被終止。本機使用相同影片、305 秒起點及原生 graph 重現：FFmpeg 峰值 904,644 KiB，超過新增測試的 512 MiB 預算。

把輸入解碼範圍限制在選定起點後的模板長度，並使用 x264 zerolatency 避免堆積 lookahead 影格後，相同重現命令的峰值降至 395,736 KiB。這只限制單次合成處理的片段，不限制可匯入的影片長度。

lint、typecheck、Modern.js build 及 Vitest 8 檔 86 項通過；原生 MP4 格式、完整解碼與固定模板長度驗證通過。瀏覽器與正式站最終結果見記憶體修正 PR。

## 只限制大小與步驟圖示

- 匯入保留 5 MiB 上限，取消前端、ffprobe、合成及開始時間的秒數上限。實際使用 360 秒／715,171 bytes 影片，從第 305 秒完成磁碟與跨冷啟動私有 Blob 合成。
- 三個區塊標題加入一致的 1／2／3 SVG 步驟圖示。桌機、390px 手機及 320px 英文版已目視檢查，無橫向溢出；保留現有字體與右側操作列。
- lint、typecheck、Modern.js production build 通過；Vitest 7 檔 85 項通過。成品的 ffprobe、完整解碼、1920×1080、H.264、yuv420p、faststart 與約 5.84 秒長度檢查通過。
- 完整 Playwright 31 項通過（約 2.5 分鐘）；正式站實測記錄於本次 GitHub PR。

## 先前：5 秒匯入上限（已取消）

- 前端與原生 ffprobe 都限制匯入影片最多 5 秒；磁碟、私有 Blob、直接合成與舊來源快取皆檢查。5 MiB 大小上限維持不變。
- 真實 5 秒影片可匯入並合成；5.04 秒會以三語頂端提示拒絕。Windows WebKit 無法讀取測試檔的本機 metadata 時由後端檢查；拒絕或取消替換影片會保留原本的編輯。
- lint、typecheck、Modern.js production build 通過；Vitest 7 檔 86 項通過（約 33 秒），Playwright 31 項通過（約 2.6 分鐘）。
- 原生 MP4 輸出仍約 5.84 秒，1920×1080、H.264、yuv420p、faststart、完整解碼及開頭／中間／結尾影格檢查通過。
- 正式站部署後的實測結果記錄於本次 GitHub PR。

## 先前框架遷移與部署結果

| 檢查                           | 結果                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint、typecheck                | 通過                                                                                                                                                                                            |
| Vitest                         | 7 檔、73 項通過，約 28 秒                                                                                                                                                                       |
| 完整 Playwright                | 28 項通過，約 2.2 分鐘；最後串流邊界修正後，三瀏覽器合成流程另 3 項通過                                                                                                                         |
| 最後的 metadata／viewport 專項 | Chromium 桌機、手機、WebKit 三項通過                                                                                                                                                            |
| Modern.js production build     | 通過                                                                                                                                                                                            |
| `npm run dev`                  | 使用 tsx 正常啟動，英文 SSR、原生上傳／預覽轉碼／刪除實測通過                                                                                                                                   |
| Vercel Linux Preview build     | 3e25e0e 部署 READY，原生工具與模板打包成功                                                                                                                                                      |
| Vercel Build Output API 產物   | 本機啟動通過：SSR、模板 API、FFmpeg／ffprobe、串流設定與缺少儲存設定錯誤                                                                                                                        |
| 可攜式 Node 產物               | 實際啟動，完成 FFmpeg 合成、1920×1080 H.264 串流下載及刪除                                                                                                                                      |
| MP4 驗證                       | H.264 High、yuv420p、1920×1080、29.97 fps、約 5.84 秒、faststart、完整解碼通過                                                                                                                  |
| Docker                         | 已更新使用 Modern.js Node 產物；本機沒有 Docker，未執行容器 build／run                                                                                                                          |
| 真實雲端 API／瀏覽器           | 私有 Blob 已連接 Production／Preview；新版 API 拒絕超過 5 MiB 一個位元組的 ticket（413）。Chromium 瀏覽器完成 4,846,065 bytes 影片直傳、Canvas 像素、PiP、FFmpeg 合成、播放、MP4 下載與重新編輯 |
| 正式 Vercel                    | CRON_SECRET 已設定於 Production／Preview；正式部署與清理排程的實測結果記錄於 [PR #1](https://github.com/lockys/iphone-duo-green-screen-tool/pull/1)                                             |

## Vercel 問題與回歸測試

舊正式版的 `GET /api/template` 正常，但以合成測試素材呼叫 `POST /api/upload` 得到使用者回報的 500／`error.generic`。在 API 測試中讓工作目錄的 mkdir 回傳 EROFS，可重現相同錯誤；改用 OS 暫存目錄後，真實上傳及轉碼通過。

原本的 process Map 與本機磁碟也無法保證跨 Vercel instance 延續。新增私有 Blob adapter 後，測試在上傳、合成、下載之間清空 module cache，仍能完成真正的 FFmpeg 輸出。離線測試替換 Blob 遠端儲存及 token issuer；另外已在真正的 Vercel Preview／Private Blob 完成 API 端到端實測。

另外檢查來源路徑簽章範圍、MIME／大小、過期與路徑穿越、跨 session 讀取／刪除權限、跨 instance 配額與工作上限、損壞影片清理、私有下載 redirect、缺少儲存設定，以及 Cron 授權。

`scripts/verify-deployment.mjs` 直接載入 Modern.js 產生的 Vercel function，未使用開發伺服器代替。Windows 產物約 161 MiB，不包含使用者影片或 .env；Linux 產物也已在 Vercel 成功建置為 READY。真實雲端 API／瀏覽器最終測試使用部署 dpl_9eTdWZRtBFU1XZmE1oe4z2uvkeCu（a4c8ab8），測試素材已刪除，下載的成品通過 ffprobe、完整解碼與三個時間點影格檢查。先前 7 MB 的直傳實測亦成功，但新版本依需求拒絕超過 5 MiB 的檔案。

## 上傳限制與錯誤提示

- 上傳上限調整為 5 MiB（5,242,880 bytes），前端、Blob ticket／簽章及磁碟串流一致；舊 MAX_UPLOAD_MB=200 設定也無法放寬。剛好上限可接受，多一個位元組即拒絕。
- 真實雲端瀏覽器測試發現 Blob redirect 導致 Canvas 污染，修正影片載入的 crossOrigin，並加入實際跨 origin 影片伺服器回歸測試；Chromium 桌機、手機及 WebKit 皆通過。
- 錯誤統一使用畫面頂端提示：簡短具體訊息、可關閉、保留必要重試動作、44px 按鈕與安全區域；分享 dialog 開啟及頁面捲動時仍可看見，三瀏覽器驗證通過。
- WebKit 分享 dialog 上方的提示改用 CSS／文字繪製警示及關閉符號，修正 SVG 圖示不顯示；最終 6 項提示／分享回歸測試通過，並確認截圖中的關閉符號可見。
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

Windows 的 WebKit 測試需要一般原生媒體執行權限。自動化的 iPhone 尺寸 WebKit 不等於實體 iPhone／Safari 驗收。雲端驗證透過隔離的測試瀏覽器及短效部署存取連結完成；沒有關閉 Vercel 登入保護，也沒有發布社群貼文。
