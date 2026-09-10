# 驗收紀錄

驗收日期：2026-09-10。Windows、Node.js 24.15.0、Next.js 16.3.4、next-rspack 16.3.4、React 19.3.0、TypeScript 6.0.3。原生 FFmpeg 6.1.1、ffprobe 4.0.2。

## 執行結果

| 檢查                | 結果                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `npm run lint`      | 通過，0 error、0 warning                                                                  |
| `npm run typecheck` | 通過                                                                                      |
| `npm test`          | 5 個測試檔、56 項通過、0 失敗                                                             |
| `npm run build`     | Rspack standalone 建置通過；有套件的 experimental 提醒                                    |
| `npm run test:e2e`  | 22 項通過、0 失敗、0 跳過                                                                 |
| 影片 ffprobe        | 1920 × 1080、H.264 High、yuv420p、29.97 fps、AAC、5.84 秒                                 |
| faststart           | moov atom 位於 mdat 之前                                                                  |
| 完整影片解碼        | FFmpeg 解碼整段至 null output，結束碼 0                                                   |
| 原始模板保留        | 根目錄及 public 內的 8150.mp4 SHA-256 相同                                                |
| 私人檔案隔離        | standalone 只含程式依賴、.next、public、package.json、server.js；沒有使用者暫存與測試素材 |

本次 Vitest 約 23.2 秒，加入浮動預覽後的最終完整 E2E 約 2 分鐘。單次小型素材合成通常約 5–15 秒，取決於當時 CPU 工作量；這不是硬體效能保證。

## 品牌、右側浮動列、分享與 Rspack

浮動預覽後續調整：可拖到最右側並保留安全邊界，視窗採 88% 不透明度。重新執行 lint、typecheck、Rspack build 及三個瀏覽器的浮動預覽專項 E2E，全部通過；確認右側邊界、透明度及 WebKit 實際影片畫面，並更新截圖。此小幅調整未重跑完整 E2E。

後續加入可拖曳浮動預覽，並移除成品的完成標題及留白。專項 E2E 在 Chromium 桌機、手機與 WebKit 全部通過：捲動自動浮出／收回、相同 Canvas／video 元素持續使用、實際像素隨縮放更新、移動視窗不更改裁切值、原生單指事件、方向鍵、關閉後不立刻重現、返回按鈕的焦點及視窗縮放邊界。專項 i18n 測試 6 項通過；lint、typecheck、Rspack build 通過。新增浮動元件的設計 detector 無發現。最終完整 22 項 E2E 全數通過；[浮動預覽截圖](images/floating.png)。

- 全站標題統一為 You, in iPhoneDuo；SVG 主圖示、單色版、字標、favicon、主畫面圖示及 Logo 總覽已產生並檢視。
- 已讀取 [Apple Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo) 全文。右側操作列依「編輯／取消 → 主要動作 → 分享」排列，預留內容安全空間，使用圖示與完整無障礙名稱。
- 三個瀏覽器專案均以 390×844、744×410、1040×744、1440×1080、320×640 驗證：操作列為 fixed、距右側小於 32px、和內容至少間隔 8px、主要按鈕至少 44×44px、無水平溢出、影片與編輯值保持不變。
- 已檢視桌機、WebKit 手機、橫向尺寸、成品與分享視窗截圖。Impeccable detector 僅回報 Arial 常見字體的設計建議；沿用輕量的系統字體方案，不額外下載字型。
- 使用真正產生的 MP4 驗證檔案型別、大小、ftyp 檔頭，系統分享不傳出帶權杖的 URL。Threads／X／Bluesky intent 僅包含文案；三個社群按鈕都能下載成品。系統分享和外部發文邊界以測試替身驗證，未發布任何貼文。
- 分享 dialog 可 Escape／按鈕關閉，焦點回到右側分享按鈕；已修正 WebKit 點擊不自動聚焦造成的返回焦點問題。取消系統分享不報錯，其他失敗有可恢復提示。
- `npm run dev -- --port 3002` 實際切換為 Rspack，首頁回應 200 並包含品牌和浮動列；測試後停止。正式建置及 E2E 使用 standalone。
- 修正 Rspack standalone 漏追蹤 `next-instance-error-state.js` 的啟動失敗，採精確 `outputFileTracingIncludes`，不複製整個 node_modules。套件本身仍為實驗性。

`evidence/` 是在本機產生、已加入 .gitignore 的驗證資料夾，下方相關檔案可由測試重新建立。精選合成測試截圖：[桌機](images/desktop.png)、[手機](images/mobile.png)、[橫向](images/landscape.png)、[分享](images/sharing.png)。

## 來源與多語系驗收

- 預覽與成品區下方均可看到 `@MurdoinkGS · X`，連到使用者提供的原貼文；使用新分頁及 `noopener noreferrer`。
- `?lang=zh-Hant`、`?lang=zh-Hans`、`?lang=en` 直接回傳對應語言的 HTML、`html lang`、標題與說明；三種瀏覽器都驗證通過。
- 切換會更新網址並記住 Cookie 偏好；原始影片、開始時間、X／Y、縮放、音訊選項、處理中的請求、成品連結皆保留。
- 本機驗證錯誤、實際 API 偽裝影片錯誤、HTTP 錯誤和 NDJSON 串流錯誤都有三語翻譯與穩定代碼。已出現的錯誤會隨語言切換即時翻譯；不顯示原始內部錯誤。
- 英文版本扣除語言選單的自稱後，介面沒有殘留中文。三種語言於桌機、Pixel 7 尺寸與 iPhone 13 尺寸均無水平溢出。
- 實際產生、播放並下載三支多語流程 MP4；另以 `npm run verify:video -- evidence/i18n-mobile-chromium.mp4` 驗證編碼、尺寸、時長、AAC、faststart、完整解碼，並檢視開頭／中間／結尾影格。畫面內的綠色色條屬測試輸入本身，手、邊框及背景遮罩正常。
- 已修正 WebKit 下語言切換後分頁標題被延遲 metadata 覆蓋的問題。標題與說明由單一 React 狀態來源管理，並驗證頁面只有一個 `title`。

證據：英文桌機編輯：`evidence/i18n-en-edit-desktop-chromium.png`、英文手機編輯：`evidence/i18n-en-edit-mobile-webkit.png`、簡體中文錯誤畫面：`evidence/i18n-zh-Hans-mobile-webkit.png`、實際多語流程影片：`evidence/i18n-mobile-chromium.mp4`。

標題處理依據：[React title](https://react.dev/reference/react-dom/components/title)、[React meta](https://react.dev/reference/react-dom/components/meta)。原生播放器內建選單仍使用瀏覽器／作業系統語言；這不是網站可控制的文字。

## 瀏覽器實測

- 桌機 Chromium：匯入、預覽畫布實際色彩像素、開始時間、縮放、位置拖曳、重設、音訊選擇、真實 FFmpeg 合成、播放、下載、重新編輯、錯誤與取消。
- Pixel 7 尺寸的 Chromium：上述完整流程，加上經原生 CDP 觸控事件驗證的單指拖曳及雙指縮放；無水平溢出。
- iPhone 13 尺寸的 WebKit：上述完整影片流程、預覽實際像素、播放與下載、錯誤與取消；無水平溢出。
- WebKit 使用一般 Windows 原生媒體權限執行。受限制的子程序沙箱會使公開 H.264 模板也無法播放，因此媒體 E2E 在允許原生媒體的環境完成。

原生影片表面保持完整尺寸並由不透明 Canvas 覆蓋，避免 WebKit 不解碼極小／透明影片的行為。唯讀、短效媒體權杖支援原生播放器不送 Cookie 的情況；刪除與重新合成仍要求原 session。

## 影格與遮罩驗證

分析了原模板 174 格；手機從直式展開成橫式。後端及 Canvas 共用動態 cover 的追蹤資料。色鍵為 `colorkey=0x00ff00:0.18:0.10`，並使用 `despill=green`。

以紫色正方形格線影片合成，抽樣 0、1.2、2.0、2.4、2.9、4.0、5.7 秒：

- 七個時間點的原綠幕核心區均無殘留亮綠色像素，殘留比例 0。
- 紫色覆蓋率約 87.2%–88.9%，其他為來源影片的白色格線；沒有展開時的白色缺口。
- 手、手機邊框與背景平均 RGB 通道誤差約 1.4 / 255（已考慮 despill）；畫面目視無明顯綠邊。
- 格線維持正方形比例，影片沒有被橫向／直向拉伸。
- 實際 H.264 MP4 的開頭、中間、結尾影格均已擷取並檢視。

相關證據：

- 逐格模板分析：`evidence/template-analysis.json`
- 模板總覽：`evidence/template-contact.png`
- 像素檢查數據：`evidence/pixel-verification.json`
- ffprobe 結果：`evidence/output-ffprobe.json`
- 實際格線合成影片：`evidence/grid-output.mp4`
- 桌機下載成品：`evidence/e2e-desktop-chromium.mp4`
- WebKit 下載成品：`evidence/e2e-mobile-webkit.mp4`
- WebKit Canvas 像素影格：`evidence/canvas-mobile-webkit.png`
- 桌機完成畫面：`evidence/ui-desktop-chromium-complete.png`
- WebKit 手機編輯畫面：`evidence/ui-mobile-webkit-editing.png`

## 尚未驗證的範圍

- 沒有實體 iPhone、Android 或 macOS Safari 實機；手機配置為瀏覽器自動化模擬，不冒充實機測試。
- 這台電腦沒有 Docker CLI，Dockerfile 已提供，但沒有執行容器建置／啟動。一般 Node.js 正式伺服器已執行並通過全部 E2E。
- 未進行大規模公網負載測試。預設採單 process、單機磁碟暫存，不宣稱多副本或 Serverless 相容。
- 支援 HEVC HLG 與旋轉 metadata 的原生處理測試，不代表每一款手機的 Dolby Vision 或特殊廠商格式都已測過。
