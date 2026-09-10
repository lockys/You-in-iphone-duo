import { brandName } from './brand';
export const locales = ['zh-Hant', 'zh-Hans', 'en'] as const;
export type Locale = (typeof locales)[number];
export const languageNames: Record<Locale, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  en: 'English',
};
export const htmlLanguages: Record<Locale, string> = {
  'zh-Hant': 'zh-Hant-TW',
  'zh-Hans': 'zh-Hans-CN',
  en: 'en',
};
export const languageCookie = 'frame-language';
export const languageHeader = 'x-frame-language';
export const templateSource = {
  name: '@MurdoinkGS · X',
  url: 'https://x.com/MurdoinkGS/status/2097794206525788302',
};
export function resolveLocale(value: unknown): Locale {
  return locales.find((locale) => locale === value) ?? 'zh-Hant';
}
export type MessageParams = Record<string, string | number>;
// Each entry must provide all three languages, including accessible labels and errors.
export const messages = {
  title: [brandName, brandName, brandName],
  metaTitle: [brandName, brandName, brandName],
  metaDescription: [
    '匯入影片，自動填入手機綠幕，輕鬆製作可下載的高畫質 MP4 迷因。',
    '导入视频，自动填入手机绿幕，轻松制作可下载的高清 MP4 趣味视频。',
    'Upload a video, fit it into the phone green screen, and download your meme as a high-quality MP4.',
  ],
  language: ['網站語言', '网站语言', 'Website language'],
  workspace: ['匯入與預覽', '导入与预览', 'Upload and preview'],
  importTitle: ['匯入你的影片', '导入你的视频', 'Add your video'],
  chooseFile: ['選擇影片檔案', '选择视频文件', 'Choose a video file'],
  drop: ['點擊選擇，或把影片拖曳到這裡', '点击选择，或将视频拖到这里', 'Choose a video or drag it here'],
  fileLimits: [
    '支援 iPhone 影片，最大 {size} MB・不限秒數',
    '支持 iPhone 视频，最大 {size} MB・不限时长',
    'iPhone videos supported · Up to {size} MB · No duration limit',
  ],
  replace: ['更換影片', '更换视频', 'Replace video'],
  previewTitle: ['看看效果', '看看效果', 'See it in action'],
  loadingTemplate: ['正在載入模板…', '正在加载模板…', 'Loading template…'],
  source: ['模板影片來源', '模板视频来源', 'Template video source'],
  sourceLink: ['在新分頁開啟影片來源', '在新标签页打开视频来源', 'Open video source in a new tab'],
  privacy: [
    '影片只用於本次製作，暫存檔會自動清除。',
    '视频仅用于本次制作，临时文件会自动清除。',
    'Your video is used only for this edit. Temporary files are deleted automatically.',
  ],
  controls: ['編輯設定', '编辑设置', 'Edit settings'],
  controlsTitle: ['調整畫面', '调整画面', 'Adjust video'],
  startTime: ['開始時間', '开始时间', 'Start time'],
  seconds: ['秒', '秒', 's'],
  startSlider: ['開始時間滑桿', '开始时间滑块', 'Start time slider'],
  startHelp: ['短影片會自動循環。', '短视频会自动循环。', 'Short videos loop automatically.'],
  scale: ['畫面縮放', '画面缩放', 'Zoom'],
  cover: ['填滿螢幕', '填满屏幕', 'Fill screen'],
  triple: ['3 倍', '3 倍', '3×'],
  horizontal: ['X 水平位置', 'X 水平位置', 'X position'],
  vertical: ['Y 垂直位置', 'Y 垂直位置', 'Y position'],
  reset: ['重設位置', '重置位置', 'Reset position'],
  sound: ['影片聲音', '视频声音', 'Audio'],
  audioOptions: ['音訊選項', '音频选项', 'Audio options'],
  templateAudio: ['模板原音', '模板原声', 'Template'],
  userAudio: ['我的影片', '我的视频', 'My video'],
  mute: ['靜音', '静音', 'Mute'],
  noAudio: [
    '這支影片沒有音訊，將輸出靜音版本。',
    '此视频没有音轨，将输出静音版本。',
    'This video has no audio. The export will be silent.',
  ],
  export: ['輸出影片', '导出视频', 'Export'],
  downloadAgain: ['再次下載 MP4', '再次下载 MP4', 'Download MP4 again'],
  download: ['下載 MP4', '下载 MP4', 'Download MP4'],
  editAgain: ['重新編輯', '重新编辑', 'Edit again'],
  render: ['產生迷因', '生成视频', 'Make my meme'],
  working: ['處理中', '处理中', 'Working'],
  progress: ['影片處理進度', '视频处理进度', 'Video processing progress'],
  elapsed: ['已經過 {seconds} 秒', '已用时 {seconds} 秒', '{seconds}s elapsed'],
  cancel: ['取消處理', '取消处理', 'Cancel'],
  attention: ['請留意', '请注意', 'Please check'],
  closeError: ['關閉錯誤訊息', '关闭错误信息', 'Dismiss error'],
  reload: ['重新載入', '重新加载', 'Reload'],
  'stage.uploading': ['正在上傳', '正在上传', 'Uploading'],
  'stage.processing': ['正在處理影片', '正在处理视频', 'Processing video'],
  'stage.compositing': ['正在合成', '正在合成', 'Compositing'],
  'stage.complete': ['已完成', '已完成', 'Complete'],
  'stage.error': ['處理失敗', '处理失败', 'Processing failed'],
  canvas: ['手機迷因即時合成預覽', '手机视频实时合成预览', 'Live phone meme preview'],
  pipTitle: ['浮動即時預覽', '浮动实时预览', 'Floating live preview'],
  pipLabel: ['預覽', '预览', 'Preview'],
  pipMove: ['拖曳或使用方向鍵移動預覽', '拖动或使用方向键移动预览', 'Drag or use arrow keys to move preview'],
  pipReturn: ['回到完整預覽', '返回完整预览', 'Return to full preview'],
  pipClose: ['關閉浮動預覽', '关闭浮动预览', 'Dismiss floating preview'],
  pause: ['暫停預覽', '暂停预览', 'Pause preview'],
  play: ['播放預覽', '播放预览', 'Play preview'],
  timeline: ['預覽時間軸', '预览时间轴', 'Preview timeline'],
  previewMuted: ['預覽靜音', '预览静音', 'Preview muted'],
  restart: ['從頭預覽', '从头预览', 'Restart preview'],
  gestureHelp: [
    '拖曳調整畫面・手機可用雙指縮放',
    '拖动调整画面・手机可用双指缩放',
    'Drag to position · Pinch to zoom on mobile',
  ],
  result: ['合成結果', '合成结果', 'Finished video'],
  playResult: ['播放成品', '播放成品', 'Play finished video'],
  sourceCode: ['原始碼', '源代码', 'Source code'],
  actions: ['影片操作', '视频操作', 'Video actions'],
  actionRender: ['產生', '生成', 'Create'],
  actionEdit: ['編輯', '编辑', 'Edit'],
  actionCancel: ['取消', '取消', 'Cancel'],
  actionDownload: ['下載', '下载', 'Save'],
  actionShare: ['分享', '分享', 'Share'],
  closeShare: ['關閉分享', '关闭分享', 'Close sharing'],
  shareTitle: ['分享作品', '分享作品', 'Share your video'],
  shareVideo: ['分享影片', '分享视频', 'Share video'],
  sharePreparing: ['準備分享…', '正在准备分享…', 'Preparing to share…'],
  shareRetry: ['重新準備分享', '重新准备分享', 'Retry sharing'],
  shareTo: ['分享到 {platform}', '分享到 {platform}', 'Share to {platform}'],
  shareCaption: [
    '用 You, in iPhoneDuo 製作的影片。',
    '用 You, in iPhoneDuo 制作的视频。',
    'Made with You, in iPhoneDuo.',
  ],
  shareHelp: [
    '社群按鈕會下載 MP4 並開啟貼文，請手動附加影片。',
    '社交按钮会下载 MP4 并打开发帖页面，请手动添加视频。',
    'Social buttons download your MP4 and open a post. Attach the video to finish.',
  ],
  shareAttach: [
    '請將下載的 MP4 加入 {platform} 貼文。',
    '请将下载的 MP4 添加到 {platform} 帖子中。',
    'Attach the downloaded MP4 to your {platform} post.',
  ],
  shareHandedOff: ['已交給系統分享選單。', '已交给系统分享菜单。', 'Handed off to the share sheet.'],
  'error.shareSize': [
    '影片太大，請下載 MP4 後分享。',
    '视频太大，请下载 MP4 后分享。',
    'This video is too large to share directly. Download the MP4 instead.',
  ],
  'error.sharePrepare': [
    '無法準備分享，請重試或下載 MP4。',
    '无法准备分享，请重试或下载 MP4。',
    'Could not prepare the video. Retry or download the MP4.',
  ],
  'error.shareFailed': [
    '分享未完成，請重試或下載 MP4 後分享。',
    '分享未完成，请重试或下载 MP4 后分享。',
    'Sharing did not finish. Try again or download the MP4.',
  ],
  'error.invalidOptions': [
    '編輯參數不正確，請重設位置後再試一次。',
    '编辑参数不正确，请重置位置后重试。',
    'Invalid edit settings. Reset the position and try again.',
  ],
  'error.fileType': [
    '請匯入 MP4、MOV 或 WebM 影片。',
    '请导入 MP4、MOV 或 WebM 视频。',
    'Please choose an MP4, MOV, or WebM video.',
  ],
  'error.emptyFile': [
    '影片是空白檔案，請重新選擇。',
    '视频文件为空，请重新选择。',
    'The video file is empty. Please choose another file.',
  ],
  'error.fileSize': [
    '影片不能超過 {size} MB。',
    '视频不能超过 {size} MB。',
    'The video must be no larger than {size} MB.',
  ],
  'error.unreadable': [
    '無法讀取影片，請確認檔案完整且含有影像。',
    '无法读取视频，请确认文件完整且包含画面。',
    'Cannot read this video. Check that the file is complete and contains video.',
  ],
  'error.resolution': [
    '影片解析度最高支援 4K，請降低解析度後再試。',
    '视频分辨率最高支持 4K，请降低分辨率后重试。',
    'Video resolution is limited to 4K. Please lower the resolution and try again.',
  ],
  'error.startTime': [
    '開始時間必須小於影片長度。',
    '开始时间必须小于视频时长。',
    'The start time must be before the end of the video.',
  ],
  'error.origin': [
    '請從本站頁面重新操作。',
    '请从本网站页面重新操作。',
    'Please try again from this website.',
  ],
  'error.rateLimit': [
    '操作太頻繁，請稍候幾分鐘再試。',
    '操作太频繁，请稍等几分钟再试。',
    'Too many requests. Please wait a few minutes and try again.',
  ],
  'error.concurrent': [
    '目前有人正在產生影片，請稍候再試。',
    '当前有视频正在生成，请稍后重试。',
    'A video is already being processed. Please wait and try again.',
  ],
  'error.busy': [
    '目前服務忙碌，請稍候再試。',
    '当前服务繁忙，请稍后重试。',
    'The service is busy. Please try again shortly.',
  ],
  'error.expired': [
    '影片連結無效或已過期，請重新匯入。',
    '视频链接无效或已过期，请重新导入。',
    'This video link is invalid or expired. Please upload your video again.',
  ],
  'error.missingBody': ['未收到上傳內容。', '未收到上传内容。', 'No upload was received.'],
  'error.multipart': ['請使用影片上傳表單。', '请使用视频上传表单。', 'Please use the video upload form.'],
  'error.invalidForm': ['上傳表單格式不正確。', '上传表单格式不正确。', 'The upload form is invalid.'],
  'error.fileField': ['影片欄位名稱不正確。', '视频字段名称不正确。', 'The video upload field is invalid.'],
  'error.sizeLimit': [
    '影片超過允許的大小上限。',
    '视频超出允许的大小上限。',
    'The video exceeds the allowed file size.',
  ],
  'error.invalidFields': [
    '上傳參數格式不正確。',
    '上传参数格式不正确。',
    'The upload parameters are invalid.',
  ],
  'error.oneFile': [
    '一次只能處理一支影片。',
    '一次只能处理一个视频。',
    'Please upload only one video at a time.',
  ],
  'error.bodySize': ['上傳內容過大。', '上传内容过大。', 'The upload is too large.'],
  'error.uploadCancelled': ['已取消上傳。', '已取消上传。', 'Upload cancelled.'],
  'error.uploadInterrupted': [
    '上傳中斷，請重新匯入影片。',
    '上传中断，请重新导入视频。',
    'The upload was interrupted. Please upload your video again.',
  ],
  'error.templateMissing': [
    '模板尚未準備完成，請稍後再試。',
    '模板尚未准备完成，请稍后重试。',
    'The template is not ready yet. Please try again later.',
  ],
  'error.cloudStorage': [
    '雲端影片暫存尚未設定，請連接 Vercel 私有 Blob 儲存。',
    '云端视频暂存尚未配置，请连接 Vercel 私有 Blob 存储。',
    'Cloud video storage is not configured. Connect a private Vercel Blob store.',
  ],
  'error.generic': [
    '處理失敗，請稍後再試。',
    '处理失败，请稍后重试。',
    'Something went wrong. Please try again.',
  ],
  'error.timeout': [
    '處理逾時，請使用較短影片再試。',
    '处理超时，请使用较短的视频重试。',
    'Processing timed out. Please try a shorter video.',
  ],
  'error.previewPending': ['預覽尚未完成。', '预览尚未完成。', 'The preview is not ready yet.'],
  'error.cancelled': ['已取消處理。', '已取消处理。', 'Processing cancelled.'],
  'error.processTimeout': [
    '處理時間過長，請使用較短或較低解析度的影片再試。',
    '处理时间过长，请使用较短或较低分辨率的视频重试。',
    'Processing took too long. Try a shorter or lower-resolution video.',
  ],
  'error.probeLimit': [
    '影片資訊超出處理上限。',
    '视频信息超出处理上限。',
    'The video metadata exceeds the processing limit.',
  ],
  'error.binaryMissing': [
    '影片處理工具無法啟動，請稍後再試。',
    '视频处理工具无法启动，请稍后重试。',
    'The video processing tools could not start. Please try again later.',
  ],
  'error.hdrUnsupported': [
    '目前無法處理 HDR 影片，請改用一般影片。',
    '当前无法处理 HDR 视频，请改用普通视频。',
    'HDR processing is unavailable. Please try a standard video.',
  ],
  'error.codec': [
    '無法處理這支影片，檔案可能損毀或使用不支援的編碼。',
    '无法处理此视频，文件可能已损坏或使用了不支持的编码。',
    'Cannot process this video. The file may be damaged or use an unsupported codec.',
  ],
  'error.chooseFile': ['請先選擇一支影片。', '请先选择一个视频。', 'Please choose a video first.'],
  'error.oneSource': [
    '請只提供一個影片來源。',
    '请只提供一个视频来源。',
    'Please provide only one video source.',
  ],
  'error.uploadFirst': [
    '請先匯入影片再產生迷因。',
    '请先导入视频再生成。',
    'Please upload a video before making your meme.',
  ],
  'error.invalidResponse': [
    '回應格式不正確，請再試一次。',
    '响应格式不正确，请重试。',
    'The server returned an invalid response. Please try again.',
  ],
  'error.incomplete': [
    '處理未完成，請重新操作。',
    '处理未完成，请重试。',
    'Processing did not finish. Please try again.',
  ],
  'error.network': [
    '連線中斷，請確認網路後再試。',
    '连接中断，请检查网络后重试。',
    'The connection was interrupted. Check your network and try again.',
  ],
  'error.canvas': [
    '瀏覽器無法建立影片預覽，請使用新版 Chrome 或 Safari。',
    '浏览器无法创建视频预览，请使用新版 Chrome 或 Safari。',
    'Your browser could not create the preview. Please use a recent Chrome or Safari version.',
  ],
  'error.previewRead': [
    '無法讀取預覽影片，請重新整理頁面後再試。',
    '无法读取预览视频，请刷新页面后重试。',
    'Cannot read the preview. Please reload the page and try again.',
  ],
  'error.templateRead': [
    '模板讀取失敗，請重新整理頁面。',
    '模板读取失败，请刷新页面。',
    'The template could not load. Please reload the page.',
  ],
  'error.previewExpired': [
    '預覽已過期或無法播放，請重新匯入影片。',
    '预览已过期或无法播放，请重新导入视频。',
    'The preview has expired or cannot play. Please upload your video again.',
  ],
  'error.previewPlay': [
    '無法播放預覽，請再點一次播放。',
    '无法播放预览，请再次点击播放。',
    'The preview could not play. Please press play again.',
  ],
  'error.resultExpired': [
    '成品已過期或無法播放，請重新產生。',
    '成品已过期或无法播放，请重新生成。',
    'The finished video has expired or cannot play. Please generate it again.',
  ],
  'error.resultPlay': [
    '無法播放成品，請下載 MP4 後使用系統播放器開啟。',
    '无法播放成品，请下载 MP4 后使用系统播放器打开。',
    'The finished video could not play. Download the MP4 and open it in your video player.',
  ],
} satisfies Record<string, readonly [string, string, string]>;
export type MessageKey = keyof typeof messages;
export type ErrorCode = Extract<MessageKey, `error.${string}`>;
export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  return messages[key][locales.indexOf(locale)].replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
