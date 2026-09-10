import { expect, test } from '@playwright/test';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

test('匯入、同步預覽、位置縮放、產生、下載與重新編輯', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'You, in iPhoneDuo' })).toBeVisible();
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeDisabled();
  await expect(page.getByLabel('選擇影片檔案')).toBeEnabled();
  await page.screenshot({ path: `evidence/ui-${testInfo.project.name}-empty.png`, fullPage: true });
  await page.getByLabel('選擇影片檔案').setInputFiles(path.resolve('tests/fixtures/portrait.mp4'));
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  await expect(page.getByText(/1.50 秒 · 360 × 640/)).toBeVisible();
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
