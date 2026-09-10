import { expect, test } from '@playwright/test';
import path from 'node:path';

test('捲出畫面自動浮動、即時調整、拖曳、關閉與返回原預覽', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 553, height: 898 });
  await page.goto('/?lang=zh-Hant');
  await expect(page.getByLabel('選擇影片檔案')).toBeEnabled();
  await page.locator('.controls-card').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('floating-preview')).toHaveCount(0);
  await page.getByLabel('選擇影片檔案').setInputFiles(path.resolve('tests/fixtures/grid.mp4'));
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  const anchor = page.getByTestId('preview-anchor');
  const canvas = page.getByTestId('preview-canvas');
  const floating = page.getByTestId('floating-preview');
  await anchor.scrollIntoViewIfNeeded();
  await expect(floating).toHaveCount(0);
  await page.getByRole('button', { name: /暫停預覽|播放預覽/ }).evaluate((button: HTMLButtonElement) => {
    if (button.getAttribute('aria-label') === '暫停預覽') button.click();
  });
  await page.getByLabel('預覽時間軸').fill('2.8');
  const original = await canvas.elementHandle();
  const source = await page.locator('video.source-video').nth(1).elementHandle();
  await page.locator('.controls-card').scrollIntoViewIfNeeded();
  await expect(floating).toBeVisible();
  await expect(floating).toBeInViewport();
  expect(
    await original!.evaluate(
      (element) => element === document.querySelector('[data-testid="preview-canvas"]'),
    ),
  ).toBe(true);
  expect(
    await source!.evaluate((element) => element === document.querySelectorAll('video.source-video')[1]),
  ).toBe(true);
  await expect(page.locator('video.source-video')).toHaveCount(2);
  const pixels = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
      let color = 0,
        hash = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] - data[i + 1] > 20 && data[i + 2] - data[i] > 25) color++;
        hash = (hash + data[i] * ((i % 127) + 1)) >>> 0;
      }
      return { color, hash };
    });
  await expect.poll(async () => (await pixels()).color).toBeGreaterThan(1000);
  const beforeHash = (await pixels()).hash;
  await page.getByLabel('畫面縮放', { exact: true }).fill('2');
  await expect.poll(async () => (await pixels()).hash).not.toBe(beforeHash);
  await page.getByLabel('X 水平位置').fill('0.2');
  const before = (await floating.boundingBox())!;
  await page.mouse.move(before.x + 40, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 110, before.y + 200, { steps: 6 });
  await page.mouse.up();
  const moved = (await floating.boundingBox())!;
  expect(moved.x - before.x).toBeGreaterThan(40);
  expect(moved.y - before.y).toBeGreaterThan(100);
  await expect(page.getByLabel('X 水平位置')).toHaveValue('0.2');
  await expect(page.getByLabel('畫面縮放', { exact: true })).toHaveValue('2');
  const handle = page.getByRole('button', { name: '拖曳或使用方向鍵移動預覽' });
  await handle.focus();
  await handle.press('ArrowDown');
  expect((await floating.boundingBox())!.y).toBeGreaterThan(moved.y);
  if (testInfo.project.name === 'mobile-chromium') {
    const box = (await floating.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + 70, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...point, y: point.y + 70 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await floating.boundingBox())!.y - box.y).toBeGreaterThan(50);
    await expect(page.getByLabel('X 水平位置')).toHaveValue('0.2');
  }
  await page.getByRole('button', { name: '回到完整預覽' }).click();
  await expect(floating).toHaveCount(0);
  await expect(anchor).toBeInViewport();
  await expect(page.getByRole('button', { name: '播放預覽' })).toBeFocused();
  await page.locator('.controls-card').scrollIntoViewIfNeeded();
  await expect(floating).toBeVisible();
  await page.getByRole('button', { name: '關閉浮動預覽' }).click();
  await expect(floating).toHaveCount(0);
  await page.getByLabel('Y 垂直位置').fill('0.3');
  await expect(floating).toHaveCount(0);
  await anchor.scrollIntoViewIfNeeded();
  await expect(anchor).toBeInViewport();
  await page.locator('.controls-card').scrollIntoViewIfNeeded();
  await expect(floating).toBeVisible();
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(floating).toBeInViewport();
  await expect
    .poll(async () => {
      const box = (await floating.boundingBox())!;
      const rail = (await page.getByTestId('action-rail').boundingBox())!;
      return box.x + box.width <= rail.x - 8 && box.y + box.height <= 700;
    })
    .toBe(true);
  await page.screenshot({ path: `evidence/floating-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});
