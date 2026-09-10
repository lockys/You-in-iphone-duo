# You, in iPhoneDuo 實作計畫

**目標：** 可在這台 Windows 電腦、一般 Node.js Server 或 Docker 執行，實際輸出原生 FFmpeg 合成的 MP4。

**架構：** Modern.js SSR、Rspack 與 Hono Node middleware；Busboy 串流 multipart 到私人暫存目錄；FFmpeg 子程序以參數陣列執行。前端 Canvas 色鍵合成，與後端共享 cover、scale、offset 參數。輸入先經 ffprobe 驗證，瀏覽器不支援的手機編碼自動轉成靜音預覽 MP4。

**素材狀態：** 已從使用者提供的 X 貼文下載 8150.mp4，保留原始檔並完成 174 格分析與真實輸出驗證。

## 1. 素材與工具

- [x] 安裝 Modern.js 3.9、React、TypeScript、Tailwind、Vitest、Playwright、原生 FFmpeg / ffprobe。
- [x] template:prepare 以 ffprobe 讀取 duration、fps、codec、rotation；逐格抽樣綠色邊界；保留原始素材並複製至 public/templates/8150.mp4；儲存來源與擷取影格。

## 2. 合成與驗證核心

- [x] 先測試 cover、縮放位移夾限、有限數值、檔名與 MIME、duration、rotation、短片循環與三種音訊，再實作共享純函式。
- [x] 輸出白底、裁切後使用者影片、colorkey + despill 模板三層；固定 1920×1080、H.264、yuv420p、AAC、faststart。
- [x] 短片使用 stream_loop 與 seek，長片從 startTime 擷取。缺音訊則保持靜音。

## 3. 安全串流 API

- [x] POST /api/upload 處理媒體驗證與必要的預覽轉碼；POST /api/render 接受 multipart file 或已驗證的 uploadId 與編輯參數。
- [x] 5 MiB、5 秒、解析度上限；隨機目錄及所有權 token；同站檢查；IP/全域速率與並行上限；timeout、取消終止子程序；回收來源、中間與過期成品。
- [x] POST 回傳 NDJSON 階段與進度；GET 私人成品支援 Range；DELETE 取消/刪除；不記錄媒體內容。

## 4. 行動編輯器

- [x] 繁體中文、拖放、檔案資訊、同步靜音循環預覽、Canvas 色鍵、滑鼠/單指拖曳、雙指縮放、startTime/scale/X/Y/音訊控制。
- [x] 所有工作有載入/取消/錯誤狀態；使用短效串流 URL，避免建立 Object URL；取消和切換來源回收私人暫存；產生後預覽、下載、重新編輯。

## 5. 驗收與交付

- [x] lint、typecheck、Vitest、真實 API 測試、Playwright 完整流程、production build。
- [x] 以小型來源測試影片與真實 8150.mp4 合成，完成色鍵校準與折疊／展開影格驗證。
- [x] ffprobe 驗證輸出，開頭/中間/結尾擷取影格並檢視。
- [x] .env.example、Dockerfile、README、工具安裝、開發/正式啟動、測試與已知限制。

## 6. 品牌、分享與 iPhone Duo 適配

- [x] 三語介面、來源標示、不重載的語言切換及真實 API 錯誤翻譯。
- [x] You, in iPhoneDuo 名稱、可編輯 SVG Logo、精簡介面、GitHub 原始碼連結。
- [x] 閱讀 Apple 指南，加入固定右側操作列、安全空間、尺寸切換時保留狀態，局部控制留在內容旁。
- [x] 系統 MP4 檔案分享，Threads／X／Bluesky 發文 intent 與下載後手動附檔。
- [x] 開發／正式版改用 Rspack，修正 standalone 追蹤缺檔，驗證真實影片流程。
- [x] 分享驗證、右側位置與窄螢幕測試、WebKit dialog 焦點修正。

## Modern.js 與 Vercel 修正（2026-09-10）

- [x] 將 Next.js 前端與 API 遷移至 Modern.js／Hono，保留三語、右側操作列、浮動預覽及分享。
- [x] 重現唯讀部署目錄錯誤，改用 /tmp；新增 Private Blob 直傳與跨 instance metadata、限流及工作數。
- [x] 使用真實 FFmpeg 執行單元／API、瀏覽器與部署產物驗證，更新 Docker 及雙語 README。
- [ ] 取得建立 Private Blob 的授權，連接 Production／Preview、設定 Cron secret，再完成正式雲端實測。
