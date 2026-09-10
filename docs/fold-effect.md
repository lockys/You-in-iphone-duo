# Fold effect / 摺疊效果

以 [chuspeeism/iphone-duo 的 screenShader](https://github.com/chuspeeism/iphone-duo/blob/2662ebbeb6aa844cd4f6888f7d6f8958662249fd/main.js#L161) 為基礎，將固定正面投影、smoothstep、1.35 次方模糊漸層與雙倍變暗漸層移植到現有影片合成。版權為 © 2026 jadon7，MIT 授權全文位於 [public/licenses/iphone-duo-MIT.txt](../public/licenses/iphone-duo-MIT.txt)。

Adapted from the upstream screen shader: fixed front projection, smoothstep motion, the 1.35-power blur gradient, and double-strength darkening. Copyright © 2026 jadon7, MIT; the complete notice is retained above.

- 手機外螢幕顯示畫面右半部，展開後呈現完整構圖；影像維持原始比例。
- 轉動面逐漸模糊、變暗，固定面保持清晰。設定可關閉，即時預覽與 MP4 共用設定。
- 原始 8150.mp4 提供真實摺疊動作、手部及邊框；本功能沒有加入 Apple 3D 模型、圖片或 Three.js。
- 外螢幕／內螢幕交界校準為 2.52 秒，3.32 秒完全展開。這組校準只適用於目前模板。

The filmed template supplies the phone's physical fold and occlusion. This is a 2D adaptation, not a new 3D animation or an orbitable model. The projection reveals the left half as the phone opens, keeping the video's aspect ratio. The moving face fades through blur and shadow; the fixed face stays clear. The switch controls both preview and MP4 export.

For bounded native rendering, blur interpolates between clear and Gaussian-blurred video rather than reproducing the original shader's 25 texture taps and mipmaps. Canvas uses three box passes as a portable Gaussian approximation, including Safari without Canvas filters. Small blur and edge differences are expected. The timing and tracked geometry are specific to 8150.mp4; a different template needs recalibration.
