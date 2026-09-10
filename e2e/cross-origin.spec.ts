import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';

test('Blob 跨網域重新導向後仍可讀取合成預覽像素', async ({ page }) => {
  let media: Buffer = Buffer.alloc(0);
  const cdn = createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': media.length,
      'Access-Control-Allow-Origin': '*',
    });
    response.end(media);
  });
  cdn.listen(0, '127.0.0.1');
  await once(cdn, 'listening');
  const address = cdn.address();
  if (!address || typeof address === 'string') throw new Error('Missing media server');
  const cdnUrl = `http://127.0.0.1:${address.port}/preview.mp4`;
  try {
    // Keep the real upload/transcode API; change only the media delivery origin.
    await page.route('**/api/media/**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const headers = route.request().headers();
      delete headers.range;
      const original = await route.fetch({ headers });
      expect(original.status()).toBe(200);
      media = await original.body();
      await route.fulfill({ status: 307, headers: { location: cdnUrl } });
    });
    await page.goto('/?lang=zh-Hant');
    await expect(page.getByLabel('選擇影片檔案')).toBeEnabled();
    await page.getByLabel('選擇影片檔案').setInputFiles(path.resolve('tests/fixtures/portrait.mp4'));
    await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
    await expect
      .poll(() =>
        page
          .locator('video.source-video')
          .nth(1)
          .evaluate((video: HTMLVideoElement) => video.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() =>
        page.getByTestId('preview-canvas').evaluate((canvas: HTMLCanvasElement) => {
          const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
          let colorful = 0;
          for (let i = 0; i < data.length; i += 4)
            if (
              Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) >
              150
            )
              colorful++;
          return colorful;
        }),
      )
      .toBeGreaterThan(1000);
    await expect(page.locator('.error-banner')).toHaveCount(0);
  } finally {
    cdn.closeAllConnections();
    await new Promise<void>((resolve) => cdn.close(() => resolve()));
  }
});
