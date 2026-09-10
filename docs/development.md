# 開發與部署指南

在本機執行的完整 Modern.js 網站：匯入影片、自動填入 `8150.mp4` 手機綠幕、即時調整與輸出 MP4。正式輸出使用 **原生 FFmpeg**，不依賴付費轉碼服務；正式 API 不使用 mock 或 ffmpeg.wasm。

![You, in iPhoneDuo 編輯器與右側浮動操作列](images/desktop.png)

## 立即啟動

需要 Node.js 22.13+（驗證版本為 24.15.0）。模板與追蹤資料已附上。

```sh
git clone https://github.com/lockys/iphone-duo-green-screen-tool.git
cd iphone-duo-green-screen-tool
npm ci
npm run dev
```

開啟 <http://127.0.0.1:3000>。PowerShell 若封鎖 `npm.ps1`，將 `npm` 改成 `npm.cmd` 即可。

需要自訂限制或 FFmpeg 路徑時，複製 `.env.example` 為 `.env.local`。

正式環境：

```sh
npm run build
npm start
# 或 npm start -- --port 3001
```

`npm start` 使用 Modern.js 正式伺服器，支援 `PORT` 與 `--port`。Windows 重新 build 前先停止正在執行的伺服器。可攜式 Node 部署使用 `npm run deploy -- node`，再執行 `node .output/index.js`。此產物必須在與正式環境相同的作業系統／CPU 架構建立；Docker 會使用 Linux 系統 FFmpeg。

## 右側浮動操作與品牌

依照 [Apple Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo) 的垂直操作、動態尺寸及安全區域原則製作網頁適配：

- 主要動作固定浮在右側；完成後依序為「編輯 → 下載 → 分享」，處理中提供取消。按鈕使用圖示、短文字與完整無障礙名稱。
- 內容預留右側空間，操作列不覆蓋預覽／滑桿；使用 `safe-area-inset-*` 與 `viewport-fit=cover`。較寬時預覽和設定並排，較窄時上下排列，縮放視窗不重建編輯器或清除狀態。
- 縮放、X／Y 和音訊等局部控制留在編輯內容區。分享以原生 HTML dialog 開啟，支援 Escape、關閉、鍵盤焦點限制與返回原按鈕。
- 編輯中的預覽大部分捲出畫面時，自動浮成可拖曳的小視窗；縮放、X／Y 與開始時間仍即時更新。拖曳小視窗不會改變裁切值，支援滑鼠、單指與方向鍵移動，可移動到畫面左右兩側並保留安全邊界，視窗為 88% 不透明度。回到原預覽區會自動收回，也能按返回／關閉；關閉後，需先回到原預覽區才會再次自動顯示。
- `src/components/floating-preview.tsx` 重用同一個 Canvas 與兩個影片元素，保留播放時間，不新增解碼器；這是網頁內的浮動預覽，不是作業系統跨分頁的 Picture-in-Picture。成品直接顯示影片，不再額外顯示完成標題。
- 網站不是 SwiftUI／UIKit 原生 App，無法自動取得指南的原生 reserved-region／arrangement-view API；目前依瀏覽器提供的可視尺寸與安全邊界調整。未經實體 iPhone Duo 驗證，也不宣稱 Apple 認證。

`public/brand/` 提供雙螢幕播放圖示、單色版、字標、favicon 與主畫面圖示；`npm run brand:prepare` 可重新產生 PNG 與設計總覽。介面保留必要操作、素材來源及暫存提醒，沒有額外品牌副標。

## Modern.js 與 Rspack

前端使用 **Modern.js 3.9.0**、React 19、TypeScript 與 Tailwind CSS。Modern.js 以 Rsbuild／Rspack 建置，啟用 SSR。路由位於 `src/routes`，API 由 `server/modern.server.ts` 的 Hono middleware 處理；沒有 Next.js 相依套件。

`modern.config.ts` 設定根目錄的 `public/` 靜態素材與後端 TypeScript 編譯。開發指令以 tsx 載入後端 TypeScript，避免 Node 24 原生 strip-only 模式無法解析參數屬性。語言 loader 決定初始 HTML，Helmet 更新標題與說明；切換語言不重建編輯器。

## 分享作品

完成後點右側「分享」：

- 支援檔案分享的 HTTPS／localhost 瀏覽器，可直接呼叫系統分享選單，把真正的 MP4 交給已安裝且接受影片的 App。預先準備成品以保留 iOS 點擊授權；取消選單不顯示錯誤。
- Threads、X、Bluesky 按鈕會下載 MP4 並開啟附有文案的發文頁；**Web intent 不會自動附加本機影片**，需在貼文中選擇剛下載的 MP4。網站不會代替使用者發布貼文。
- 不會把 localhost 或帶權杖的私人影片網址放進社群文案。不建立公開成品託管服務。非安全的 LAN HTTP 瀏覽器通常只能使用下載後手動分享。
- 只有支援系統檔案分享時，才把最長約六秒的成品暫存於瀏覽器記憶體；限制 64 MiB、30 秒，失敗可重試，離開或重新編輯時取消準備並釋放檔案參照。原始上傳與後端下載仍是串流。

平台是否接受檔案取決於作業系統、瀏覽器、登入狀態與已安裝 App；自動化測試只替代系統分享／外部發文的邊界，沒有發布任何社群貼文。

## 語言版本與影片來源

右上角可切換 **繁體中文、简体中文、English**。介面文案、無障礙標籤、處理階段、錯誤與網頁說明皆隨之切換；品牌名稱及網頁標題統一為 You, in iPhoneDuo，預設使用繁體中文。

- 繁體中文：<http://127.0.0.1:3000/?lang=zh-Hant>
- 簡體中文：<http://127.0.0.1:3000/?lang=zh-Hans>
- 英文：<http://127.0.0.1:3000/?lang=en>

網址參數優先於已記住的語言偏好。語言以第一方 `frame-language` Cookie 記住一年；不儲存影片內容。切換時不重新載入、不重建編輯器，已匯入的影片、位置／縮放、音訊、進行中的合成及下載連結會保留。伺服器也會直接輸出對應語言的 HTML、`lang` 與 metadata。重新整理仍會結束本次影片編輯，語言偏好則保留。

預覽區下方固定顯示「模板影片來源：**@MurdoinkGS · X**」，連到[使用者提供的影片貼文](https://x.com/MurdoinkGS/status/2097794206525788302)，在新分頁開啟。這是素材出處標示，不表示已驗證原創作者或授權。來源標示也會保留在合成結果畫面。

所有譯文集中於 `src/lib/i18n.ts`；錯誤使用穩定的 `error.*` 代碼與數值參數，確保切換語言後，先前收到的錯誤也會一起翻譯。原生影片播放器的內建選單由瀏覽器／作業系統的語言控制。

## FFmpeg 與模板

`npm ci` 會安裝原生 `ffmpeg-static` 及 `ffprobe-static`。本機預設二進位為 FFmpeg 6.1.1、ffprobe 4.0.2；部署建議改用持續更新的系統完整版本，支援 libx264、AAC、colorkey、despill、perspective、zscale、tonemap。

```powershell
# Windows：由系統套件管理員安裝，再在 .env.local 填寫執行檔絕對路徑。
winget install --id Gyan.FFmpeg --exact
# 例如：FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe
#       FFPROBE_PATH=C:/ffmpeg/bin/ffprobe.exe
```

```sh
# macOS
brew install ffmpeg
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install ffmpeg
```

CLI 分析與測試腳本可透過 shell 的 `FFMPEG_PATH` / `FFPROBE_PATH` 環境變數選擇工具；網站則會載入 `.env.local`。

原始 `8150.mp4` 保留於專案根目錄，來自[使用者提供的 X 貼文](https://x.com/MurdoinkGS/status/2097794206525788302)。相同檔案已複製到 `public/templates/8150.mp4`。分析結果：

| 項目         | 實際值                                          |
| ------------ | ----------------------------------------------- |
| 解析度       | 1920 × 1080                                     |
| 容器長度     | 5.824 秒                                        |
| 視訊         | H.264、yuv420p，174 格，5.8058 秒               |
| 幀率         | 30000/1001，約 29.97 fps                        |
| 音訊         | AAC、48 kHz、雙聲道                             |
| 第一格綠幕   | x=804、y=222、422 × 608                         |
| 最後一格綠幕 | x=532、y=244、852 × 602                         |
| 色鍵         | colorkey=0x00ff00:0.18:0.10，搭配 despill=green |

**手機中途會展開**，因此不能使用固定的 445 × 630 填入區。`template:prepare` 逐格偵測真實綠幕，加入鄰近影格範圍與安全邊界，產生 174 格的追蹤資料。形狀遮罩始終來自原始模板色鍵，手、圓角及手機邊框均保留。

重新分析素材：

```sh
npm run template:prepare
# 指定另一個本機檔案：npm run template:prepare -- /path/to/8150.mp4
```

此腳本會使用 ffprobe、以串流方式分析解碼影格、複製模板、建立 960 × 540 靜音預覽、輸出追蹤 JSON 與擷取影格；不覆寫根目錄原始素材。若更換成不同構圖的模板，仍應人工檢查色鍵與追蹤結果。

## 編輯與輸出行為

- MP4、MOV、WebM、M4V；最多 5 MiB、5 分鐘、4K（最大 4096 × 2160 像素數）。檔名、MIME 與實際容器／視訊均驗證。
- 匯入後顯示原始檔名、解析度、長度、大小；後端轉為低解析度 H.264 預覽，支援 HEVC、10-bit HLG/PQ、手機旋轉 metadata 與無音訊影片。
- 桌機滑鼠拖曳；手機單指拖曳、雙指縮放；鍵盤可操作滑桿與音訊選項。縮放 1–3 倍，X/Y 是各方向可移動範圍的 -100% 至 +100%，邊界會限制住以免露底。
- Canvas 使用與 FFmpeg 對應的 RGB 色鍵及去綠溢色公式。預覽靜音、時間同步、循環播放，可拖曳時間軸檢查手機展開後的構圖。
- 正式輸出為白底 → 使用者影片 → 去綠模板。使用固定尺寸的 perspective 座標轉換實作動態 cover，避免 FFmpeg overlay 對動態尺寸的截斷；最終影像保留來源比例。
- 來源短於模板時，從指定時間開始，抵達來源結尾後從頭循環。長於模板時則取指定開始時間後的模板長度。
- 模板音訊／來源音訊／靜音三選一。音訊不足會補靜音；來源音訊隨短片循環，沒有音訊時輸出有效的靜音 MP4。
- H.264、yuv420p、AAC（有選定音訊時）、faststart、1920 × 1080、固定 29.97 fps。輸出約 5.84 秒，與 5.824 秒模板的差距小於一格，來自固定幀率取整。
- 合成完成會捲動至成品、提供播放、下載、重新編輯。下載透過瀏覽器原生串流，不將完整成品載入 Node.js 記憶體。

## API

`GET /api/template` 提供追蹤設定與大小上限，並設定匿名 HttpOnly session Cookie。

本機 `POST /api/upload` 接受 multipart `file`。串流存檔後執行 ffprobe 與靜音 H.264 預覽轉碼，回傳 `uploadId`、原始 metadata、`previewUrl`。

本機 `POST /api/render` 接受 multipart：

| 欄位                  | 值                                                   |
| --------------------- | ---------------------------------------------------- |
| `file`                | 原始影片；也可改傳本次 session 的 `uploadId`，二擇一 |
| `startTime`           | 0 至來源長度之前，單位秒                             |
| `scale`               | 1–3，預設 1                                          |
| `offsetX` / `offsetY` | -1 至 1，預設 0                                      |
| `audioMode`           | `template` / `user` / `mute`                         |

POST 回應為 NDJSON 串流，例：

```json
{"type":"progress","stage":"processing","progress":5}
{"type":"progress","stage":"compositing","progress":45}
{"type":"heartbeat"}
{"type":"complete","resultId":"...","url":"/api/media/...?access=...","info":{}}
```

HTTP 標頭尚未送出時的同源、忙碌與頻率錯誤使用 403 / 429 等狀態；開始串流後的驗證、轉碼或合成失敗以 `{"type":"error","code":"error.codec","params":{},"error":"已翻譯的訊息"}` 回傳。可用 `X-Frame-Language: zh-Hant | zh-Hans | en` 選擇 API 錯誤語言，省略時為繁體中文；網站會自動送出。用戶端必須檢查事件，不可只依 HTTP 200 判定成功。心跳每 2 秒送出；精確合成進度取自 FFmpeg `-progress`，介面另外顯示經過秒數。

`GET /api/media/:id?access=...` 為短效唯讀影片連結，支援 HTTP Range（含 suffix Range）及 `&download=1`。連結具有獨立 192-bit 隨機權杖，讓原生播放器在沒有送 Cookie 時仍可播放；知道 id 而沒有 Cookie 或權杖不能讀取。預覽權杖只提供轉碼後的預覽，不暴露原始影片。`DELETE /api/media/:id` 必須使用原本的 session，唯讀權杖不能用來刪除。

## 暫存、安全與部署限制

- Busboy 串流至 `mkdtemp` 隨機私人目錄，固定內部檔名。不用 `request.formData()`、`arrayBuffer()` 讀取完整上傳，也不拼接 shell 指令。
- 只開啟 mov / matroska / webm 解封裝器及 file / pipe 協定；使用者影片不能要求 FFmpeg 下載外部 URL。ffprobe 的資訊輸出有大小及時間上限。
- 預設最多同時 2 個上傳／轉碼／合成工作，每 10 分鐘最多 20 次昂貴操作。未信任代理時使用全伺服器共用頻率上限，不能靠偽造標頭繞過；設定可信任代理後按 IP 限制。
- FFmpeg 最多 180 秒；完整請求最多 240 秒。使用者取消／中斷串流會終止子程序並清理工作目錄，成功合成後立即刪除直接上傳與 filter 中間檔。
- 供「重新編輯」使用的來源和預覽，以及下載成品，保留至離開／更換／刪除，或閒置 30 分鐘後清理；每分鐘回收一次。異常關閉的過期目錄也會在啟動後／下一次工作時回收。重新啟動伺服器會失去進行中的編輯 session。
- 原始來源、預覽與成品不放在 public，不會被打包至部署產物。沒有媒體內容、檔名、原始 stderr 或 access token 日誌；關閉 Modern.js 請求記錄。反向代理也應關閉媒體請求的 access log，避免記錄短效連結。
- 預覽直接使用短效串流 URL，沒有建立 Object URL。系統分享另有上述成品記憶體上限。失敗、切換、離開時會取消進行中的傳輸與刪除暫存資產。
- 預設磁碟模式需要單一 Node.js process 與可寫磁碟。Vercel 使用下方私有 Blob 模式，跨 instance 保存資產及限流。仍不支援靜態匯出或 Edge Runtime。
- 建議至少 2 個 CPU、2 GB RAM、數 GB 可用暫存空間；實際時間隨來源與硬體而變。
- 追蹤是綠幕範圍隨時間變化的 cover，不包含摺疊面板的 3D 透視重建。Canvas 降採樣與瀏覽器解碼可能有少量邊緣／時間差；最終以正式輸出為準。HDR 轉 SDR 的色調映射可能與手機相簿觀感不同。
- Windows 的 WebKit 自動化環境需要允許原生媒體子系統讀取本機網站；受限沙箱內連公開 H.264 模板也可能回報不支援。WebKit 測試不等於 iPhone／Safari 實機驗收。

完整設定見 [.env.example](../.env.example)。

## Vercel

`vercel.json` 使用 Modern.js 的 Build Output API，建置指令為 `npm run deploy`。產物含原生 FFmpeg、ffprobe、模板與串流 Node function（最長 300 秒）；不使用 Edge。請讓 Vercel 在 Linux 建置，不要上傳 Windows 的預建產物。

Vercel 的 function 請求／回應限制為 4.5 MB，且程式目錄唯讀。因此：

1. 在本專案連接 **Private Vercel Blob**，建議與 function 同區域。連接 Production／Preview，使用自動提供的 `BLOB_STORE_ID` 、`BLOB_WEBHOOK_PUBLIC_KEY` 與 OIDC；不必建立長效讀寫 token。
2. 設定隨機的 `CRON_SECRET`，讓 Vercel 每日呼叫 `/api/cleanup`。Hobby 的每日排程已列於設定檔。
3. 保留 `MEDIA_TEMP_DIR` 或留白均可；Vercel 自動改用作業系統 `/tmp`。若設定 `APP_ORIGIN`，Production 與 Preview 必須各自符合實際網域。
4. 重新部署，使用小型影片完成上傳、合成、播放與下載；再用大於 4.5 MB 的素材確認直傳流程。

瀏覽器先用 `/api/blob-ticket` 驗證檔名／MIME／大小，再透過 `/api/blob-upload` 取得只允許單一來源路徑的短效上傳簽章，直接串流至私有 Blob。`/api/upload` 只收小型 multipart `cloudId`；`/api/render` 收 `uploadId` 與編輯選項。使用者影片不經過 Vercel function 的上傳大小限制，仍限制 5 MiB。後端下載至私人暫存目錄後執行真正的 FFmpeg。

資產 metadata、每 IP 配額及工作數使用 Blob 條件寫入，跨冷啟動仍有效。預覽／下載回傳 60 秒內到期的私有簽名 URL，以避免大型影片回應經過 function。原始影片不提供讀取連結。未連接儲存時回傳明確的三語 `error.cloudStorage`，不再只有 generic error。

資產建立 30 分鐘後停止存取；更換影片、離開或失敗會要求刪除。瀏覽器異常關閉、網路中斷留下的檔案由每日排程清除，正常排程下最久約再保留 24 小時；排程失敗則需修復後清理。私有儲存及傳輸會使用 Vercel Blob 配額，本專案不會自動升級付費方案。5 分鐘高解析度／HDR 影片可能仍超過 function 的 CPU、暫存空間或時間限制，較重工作請使用 Docker／一般 Node server。

本機測試 Blob adapter 可設 `MEDIA_STORAGE=blob` 並使用開發環境憑證。正式雲端驗收需要真實私有 Blob；離線測試的儲存替身只用於測試，不會進入正式 API。

## Docker

```sh
docker build -t phone-meme .
docker run --rm --init -p 3000:3000 --memory=2g --cpus=2 phone-meme
```

Docker runtime 安裝系統 FFmpeg，以非 root 使用者執行。已附上預處理的 public 模板，不需要 Docker build 時重新分析素材。

公開部署請設 `APP_ORIGIN=https://你的網域`，並使用 HTTPS 反向代理。例如 Nginx 的相關設定：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 201m;
    client_body_timeout 60s;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_buffering off;
    proxy_request_buffering off;
    access_log off;
}
```

只有 Node 無法被外界直接存取、且代理會覆寫 X-Forwarded-For 時，才設 `TRUST_PROXY=1`。私人成品不可由 CDN 快取。

## 測試

```sh
npm run test:fixtures
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npm run verify:video
# 驗證本機 Vercel 產物，不會部署或建立雲端資源
npm run deploy -- vercel
npm run verify:deployment
```

Playwright 會在 port 3100 啟動**正式版**伺服器，使用獨立暫存目錄與測試限流設定。請先停止佔用該 port 的其他服務。Windows 建議在一般終端機執行完整媒體測試。`test:fixtures` 的旋轉 fixture 產生指令需要 FFmpeg 6+。

Vitest 涵蓋 cover／縮放／位置、數值驗證、MIME／副檔名／大小／長度、旋轉、短片循環、三種音訊、無音訊、HEVC HLG、WebM、原生 API、Range、唯讀連結與刪除權限、取消／timeout／暫存清理及 7 個時間點的像素驗證。

Playwright 覆蓋桌機 Chromium、Android 尺寸 Chromium、iPhone 尺寸 WebKit 的匯入、調整、真實產生、播放、下載與重新編輯，以及錯誤／取消；原生單指／雙指手勢使用 Chromium CDP 驗證。

另測試 320–1440px 與橫向尺寸的右側浮動列、安全間距、44px 以上點擊範圍、狀態保留、GitHub 連結、分享 dialog 焦點、真實 MP4 檔案分享、三個社群 intent、下載及取消／失敗提示。

多語系測試另涵蓋三種語言的伺服器 HTML、來源連結、Cookie 偏好、完整英譯、前後端錯誤、切換時保留編輯值、合成中及完成後切換語言，並實際播放、下載 MP4。`npm test -- tests/i18n.test.ts` 可單獨檢查語言字典與錯誤參數。

`verify:video` 實際合成並執行 ffprobe，檢查 1920 × 1080、H.264、yuv420p、長度及整段可解碼，再擷取開頭、中間、結尾影格。也可驗證現有 MP4：`npm run verify:video -- path/to/video.mp4`。

## 主要檔案

| 路徑                                                   | 用途                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `src/components/editor.tsx`                            | 匯入、進度、編輯控制、成品下載                          |
| `src/components/share-panel.tsx`、`src/lib/sharing.ts` | 系統檔案分享、社群 intent 與分享 dialog                 |
| `public/brand/`、`scripts/prepare-brand.mjs`           | SVG 品牌素材、favicon／主畫面圖示與總覽                 |
| `src/components/preview.tsx`                           | 同步 Canvas 色鍵、拖曳與雙指縮放                        |
| `src/components/result-player.tsx`                     | 行動成品播放及捲動定位                                  |
| `src/components/language-provider.tsx`                 | 不重載的語言切換、網址與偏好記憶                        |
| `src/lib/i18n.ts`、`src/lib/errors.ts`                 | 三語字典、素材來源、穩定錯誤代碼與安全回應解碼          |
| `src/routes/page.data.ts`、`server/modern.server.ts` | Modern.js 路由、SSR 語言、Hono API middleware |
| `src/lib/composition.ts`                               | 前後端共用 cover、驗證、FFmpeg filter 產生              |
| `src/lib/process.ts`                                   | 原生工具解析、ffprobe、timeout 與取消                   |
| `src/lib/server.ts`                                    | 磁碟串流、session／唯讀權杖、限流、工作數、回收與 Range |
| `server/routes/*`、`server/cloud-api.ts`、`server/cloud-store.ts` | 原生影片 API、Vercel 私有儲存、跨 instance 配額 |
| `scripts/prepare-template.ts`                          | 真實模板分析、逐格追蹤與預覽準備                        |
| `scripts/verify-video.ts`                              | 實際輸出與影格驗證                                      |
| `scripts/start.mjs`                                    | Modern.js 正式啟動                       |
| `tests/`、`e2e/`                                       | 單元／原生整合／像素與瀏覽器測試                        |
| `evidence/`                                            | 實際輸出、ffprobe 結果、影格與 UI 截圖                  |
| `docs/verification.md`                                 | 本次已執行的驗證結果與限制                              |

程式碼沿用儲存庫既有 [MIT License](../LICENSE)。模板影片屬第三方素材，來源已標示，MIT 程式授權不代表授予該影片的著作權。

技術依據：[Modern.js 部署](https://modernjs.dev/guides/basic-features/deploy.html)、[FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)、[Playwright 瀏覽器與平台差異](https://playwright.dev/docs/browsers)。
