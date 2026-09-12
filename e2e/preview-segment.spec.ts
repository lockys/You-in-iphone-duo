import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { binary, runProcess } from '../src/lib/process';
import { occupyWorker } from './helpers/queue';

test.beforeAll(async () => {
  await mkdir('evidence', { recursive: true });
  await runProcess(binary('ffmpeg'), [
    '-v',
    'error',
    '-y',
    '-i',
    'tests/fixtures/dual-red.mp4',
    '-i',
    'tests/fixtures/dual-blue.mp4',
    '-filter_complex',
    '[0:v]scale=128:72,setsar=1[a];[1:v]setsar=1[b];[a][b]concat=n=2:v=1:a=0[out]',
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    'evidence/two-colors.mp4',
  ]);
});
test('changing the source start updates the real short preview with local timing', async ({ page }) => {
  await page.goto('/?lang=en');
  await page.getByLabel('Choose a video file').setInputFiles(path.resolve('evidence/two-colors.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  await page.getByTestId('preview-anchor').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  const timeline = page.getByRole('slider', { name: 'Preview timeline' });
  const canvas = page.getByTestId('preview-canvas');
  const channel = (c: number) =>
    canvas.evaluate(
      (canvas: HTMLCanvasElement, index: number) =>
        canvas.getContext('2d')!.getImageData(405, 140, 1, 1).data[index],
      c,
    );
  await timeline.fill('0.3');
  await expect.poll(() => channel(0)).toBeGreaterThan(180);
  const updated = page.waitForResponse(
    (response) => response.url().includes('/api/preview') && response.status() === 200,
  );
  await page.getByLabel('Start time', { exact: true }).fill('1.2');
  await updated;
  await expect(page.locator('.video-loader')).toHaveCount(0);
  await timeline.fill('0.3');
  await expect.poll(() => channel(2)).toBeGreaterThan(180);
  const changed = await page.locator('video.source-video').nth(1).getAttribute('src');
  // Fast scrubbing is coalesced; returning to a cached start reuses its URL.
  await page.getByLabel('Start time', { exact: true }).fill('0.2');
  await page.getByLabel('Start time', { exact: true }).fill('0.4');
  await page.getByLabel('Start time', { exact: true }).fill('1.2');
  await expect(page.locator('.video-loader')).toHaveCount(0);
  await expect(page.locator('video.source-video').nth(1)).toHaveAttribute('src', changed!);
  await expect(page.getByRole('button', { name: 'Play preview', exact: true })).toBeVisible();
  await expect(page.locator('.error-banner')).toHaveCount(0);
});
test('a queued preview can be cancelled and retried without losing the upload', async ({ page }) => {
  await page.goto('/?lang=en');
  await page.getByLabel('Choose a video file').setInputFiles(path.resolve('tests/fixtures/grid.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  const source = await page.locator('video.source-video').nth(1).getAttribute('src');
  const first = await occupyWorker();
  const second = await occupyWorker();
  try {
    await page.getByLabel('Start time', { exact: true }).fill('0.5');
    await expect(page.locator('.video-loader')).toContainText('Queued · position 1');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry preview' })).toBeVisible();
    await expect(page.locator('video.source-video').nth(1)).toHaveAttribute('src', source!);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    first();
    second();
    await page.getByRole('button', { name: 'Retry preview' }).click();
    await expect(page.locator('.video-loader')).toHaveCount(0);
    await expect(page.locator('video.source-video').nth(1)).not.toHaveAttribute('src', source!);
    await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  } finally {
    first();
    second();
  }
});

test('preview completion keeps Create under the pointer', async ({ page }) => {
  await page.goto('/?lang=en');
  await page.getByLabel('Choose a video file').setInputFiles(path.resolve('tests/fixtures/grid.mp4'));
  const create = page.getByRole('button', { name: 'Make my meme' });
  await expect(create).toBeEnabled();
  const first = await occupyWorker();
  const second = await occupyWorker();
  try {
    await page.getByLabel('Start time', { exact: true }).fill('0.5');
    await expect(page.locator('.video-loader')).toContainText('Queued · position 1');
    const box = (await create.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    first();
    second();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    const ready = (await create.boundingBox())!;
    expect(Math.abs(ready.y - box.y)).toBeLessThan(1);
    await page.mouse.up();
    await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toBeVisible({
      timeout: 90000,
    });
  } finally {
    await page.mouse.up();
    first();
    second();
  }
});
