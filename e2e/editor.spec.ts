import { expect, test } from '@playwright/test';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

test('影片載入時在容器內顯示 loader，播放後移除', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/templates/demo.mp4', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/?lang=en', { waitUntil: 'domcontentloaded' });
    const loader = page.locator('.demo-preview .video-loader');
    await expect(loader).toBeVisible();
    await expect(loader).toHaveText('Loading video…');
    release();
    await page.getByTestId('demo-video').scrollIntoViewIfNeeded();
    await expect(loader).toHaveCount(0);
    await expect
      .poll(() => page.getByTestId('demo-video').evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.1);
  } finally {
    release();
  }
});

test('初始預覽不等待模板 API，靜音行內自動播放且可暫停', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/template', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/?lang=en', { waitUntil: 'domcontentloaded' });
    const demo = page.getByTestId('demo-video');
    await demo.scrollIntoViewIfNeeded();
    await expect(demo).toHaveAttribute('poster', '/templates/demo-poster.jpg');
    await expect.poll(() => demo.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
    expect(await demo.evaluate((v: HTMLVideoElement) => v.muted && v.playsInline && !v.paused)).toBe(true);
    await page.locator('.demo-preview .playback button').click();
    expect(await demo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await page.locator('.demo-play').click();
    await expect.poll(() => demo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  } finally {
    release();
  }
});

test('減少動態效果時顯示海報並允許手動播放', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?lang=en');
  const demo = page.getByTestId('demo-video');
  await demo.scrollIntoViewIfNeeded();
  await expect(page.locator('.demo-play')).toBeVisible();
  expect(await demo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.locator('.demo-play').click();
  await expect.poll(() => demo.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
});

test('長影片不限秒數，可選 305 秒；超大替換檔仍保留編輯並顯示三語錯誤', async ({ page }) => {
  await page.goto('/?lang=zh-Hant');
  const picker = page.locator('input[type=file]');
  await expect(picker).toBeEnabled();
  await expect(page.locator('.step-icon')).toHaveCount(3);
  await picker.setInputFiles(path.resolve('tests/fixtures/long.mp4'));
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled({ timeout: 60000 });
  await expect(page.getByText(/360.00 秒 · 160 × 90/)).toBeVisible();
  await page.locator('#start-time').fill('305');
  await expect(page.locator('#start-time')).toHaveValue('305');
  await page.locator('#scale').fill('1.4');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (
      ['/api/upload', '/api/blob-ticket'].includes(new URL(request.url()).pathname) ||
      request.method() === 'DELETE'
    )
      requests.push(request.url());
  });
  for (const [locale, message] of [
    ['zh-Hant', '影片不能超過 20 MB。'],
    ['zh-Hans', '视频不能超过 20 MB。'],
    ['en', 'The video must be no larger than 20 MB.'],
  ]) {
    await page.getByRole('combobox').selectOption(locale);
    await page.locator('.controls-card').scrollIntoViewIfNeeded();
    await picker.setInputFiles({
      name: 'large.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.alloc(20 * 1024 ** 2 + 1),
    });
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('alert')).toBeInViewport();
    await expect(page.locator('#scale')).toHaveValue('1.4');
    await expect(page.locator('#scale')).toBeEnabled();
    await expect(page.locator('#start-time')).toHaveValue('305');
    await expect(page.getByText('long.mp4', { exact: true })).toBeAttached();
    await expect(picker).toHaveValue('');
  }
  expect(requests).toEqual([]);
});

test('匯入、同步預覽、位置縮放、產生、下載與重新編輯', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'You, in iPhoneDuo' })).toBeVisible();
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: '摺疊效果' })).toBeChecked();
  await expect(page.getByRole('switch', { name: '摺疊效果' })).toBeDisabled();
  await expect(page.getByLabel('選擇影片檔案')).toBeEnabled();
  await page.screenshot({ path: `evidence/ui-${testInfo.project.name}-empty.png`, fullPage: true });
  await page.getByLabel('選擇影片檔案').setInputFiles(path.resolve('tests/fixtures/portrait.mp4'));
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  await expect(page.getByText(/1.50 秒 · 360 × 640/)).toBeVisible();
  await page.getByRole('switch', { name: '摺疊效果' }).uncheck();
  await expect(page.getByRole('switch', { name: '摺疊效果' })).not.toBeChecked();
  await page.getByRole('switch', { name: '摺疊效果' }).check();
  await page.getByLabel('畫面縮放', { exact: true }).fill('1.5');
  await page.getByLabel('X 水平位置').fill('0.2');
  await page.getByLabel('Y 垂直位置').fill('-0.2');
  await page.getByLabel('開始時間', { exact: true }).fill('0.5');
  const canvas = page.getByTestId('preview-canvas');
  await page.getByTestId('preview-anchor').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /暫停預覽|播放預覽/ }).evaluate((button: HTMLButtonElement) => {
    if (button.getAttribute('aria-label') === '播放預覽') button.click();
  });
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
        let colorful = 0;
        for (let i = 0; i < data.length; i += 4)
          if (
            data[i + 3] === 255 &&
            Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 150
          )
            colorful++;
        return colorful;
      }),
    )
    .toBeGreaterThan(1000);
  const canvasData = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await writeFile(
    `evidence/canvas-${testInfo.project.name}.png`,
    Buffer.from(canvasData.split(',')[1], 'base64'),
  );
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2 + 8, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel('X 水平位置')).not.toHaveValue('0.2');
  await page.screenshot({ path: `evidence/ui-${testInfo.project.name}-editing.png`, fullPage: true });
  await page.getByRole('button', { name: '重設位置' }).click();
  await expect(page.getByLabel('畫面縮放', { exact: true })).toHaveValue('1');
  await page.getByRole('radio', { name: '模板原音' }).check();
  await page.getByRole('button', { name: '產生迷因' }).click();
  await expect(page.getByLabel('影片處理進度')).toBeVisible();
  await expect(page.getByRole('link', { name: '下載 MP4' })).toBeVisible({ timeout: 90000 });
  const video = page.getByLabel('合成結果');
  await page.getByRole('button', { name: '播放成品', exact: true }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.05);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: '下載 MP4' }).click();
  const download = await downloadEvent;
  await download.saveAs(`evidence/e2e-${testInfo.project.name}.mp4`);
  expect(download.suggestedFilename()).toBe('phone-meme.mp4');
  await page.screenshot({ path: `evidence/ui-${testInfo.project.name}-complete.png`, fullPage: true });
  await page.getByRole('button', { name: '重新編輯' }).click();
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('無音訊、取消處理與錯誤提示', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('選擇影片檔案')).toBeEnabled();
  await page
    .getByLabel('選擇影片檔案')
    .setInputFiles({ name: 'bad.mp4', mimeType: 'video/mp4', buffer: Buffer.from('broken') });
  await expect(page.locator('.error-banner')).toContainText('無法處理這支影片');
  await page.getByLabel('選擇影片檔案').setInputFiles(path.resolve('tests/fixtures/silent.mp4'));
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  await page.getByRole('radio', { name: '我的影片' }).check();
  await expect(page.getByText('這支影片沒有音訊，將輸出靜音版本。')).toBeVisible();
  await page.getByRole('button', { name: '產生迷因' }).click();
  await page.getByRole('button', { name: '取消處理' }).click();
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('20 MB 上限會在影片傳輸前拒絕超大檔案', async ({ page }) => {
  let uploaded = false;
  page.on('request', (request) => {
    if (['/api/upload', '/api/blob-ticket'].includes(new URL(request.url()).pathname)) uploaded = true;
  });
  await page.goto('/?lang=zh-Hant');
  await expect(page.getByLabel('選擇影片檔案')).toBeEnabled();
  await expect(page.getByText('支援 iPhone 影片，最大 20 MB・不限秒數')).toBeVisible();
  await page.locator('.controls-card').scrollIntoViewIfNeeded();
  await page.getByLabel('選擇影片檔案').setInputFiles({
    name: 'too-large.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.alloc(20 * 1024 ** 2 + 1),
  });
  await expect(page.locator('.error-banner')).toContainText('影片不能超過 20 MB');
  await expect(page.locator('.error-banner')).toBeInViewport();
  const notice = (await page.locator('.error-banner').boundingBox())!;
  expect(notice.y).toBeGreaterThanOrEqual(12);
  expect(notice.y).toBeLessThan(40);
  expect(notice.x).toBeGreaterThanOrEqual(12);
  expect(notice.x + notice.width).toBeLessThanOrEqual(page.viewportSize()!.width - 12);
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeDisabled();
  expect(uploaded).toBe(false);
  await page.screenshot({ path: `evidence/top-error-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '關閉錯誤訊息' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
