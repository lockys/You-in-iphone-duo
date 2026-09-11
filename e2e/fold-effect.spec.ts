import { expect, test } from '@playwright/test';
import path from 'node:path';

test('fold switch changes the preview and exported video with matching screen shading', async ({
  page,
}, testInfo) => {
  await page.goto('/?lang=en');
  const picker = page.locator('input[type=file]');
  await expect(picker).toBeEnabled();
  await picker.setInputFiles(path.resolve('tests/fixtures/grid.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  for (const [locale, label] of [
    ['zh-Hant', '摺疊效果'],
    ['zh-Hans', '折叠效果'],
    ['en', 'Fold effect'],
  ]) {
    await page.getByRole('combobox').selectOption(locale);
    await expect(page.getByRole('switch', { name: label })).toBeChecked();
  }
  const canvas = page.getByTestId('preview-canvas');
  await page.getByTestId('preview-anchor').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator('video.source-video')
        .first()
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(3);
  // Use the real pause control so late metadata events cannot restart playback.
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  await page.getByRole('slider', { name: 'Preview timeline' }).fill('2.9');
  await expect
    .poll(() =>
      page
        .locator('video.source-video')
        .first()
        .evaluate((v: HTMLVideoElement) => Math.abs(v.currentTime - 2.9)),
    )
    .toBeLessThan(0.1);
  // WebKit can settle a seek a couple of frames later. Compare that same frame.
  const sampledTime = await page
    .locator('video.source-video')
    .first()
    .evaluate((video: HTMLVideoElement) => video.currentTime);
  // Sample green-screen interior away from hands and bezel, on both sides of the hinge.
  const sample = async () =>
    canvas.evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')!;
      const mean = (x: number) => {
        const data = ctx.getImageData(x, 140, 40, 40).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        return sum / (data.length / 4);
      };
      return { left: mean(260), right: mean(484) };
    });
  await expect
    .poll(async () => {
      const s = await sample();
      return s.right - s.left;
    })
    .toBeGreaterThan(12);
  const enabled = await sample();
  await canvas.screenshot({ path: `evidence/fold-preview-${testInfo.project.name}.png` });
  await page.getByRole('switch', { name: 'Fold effect' }).uncheck();
  await expect.poll(async () => (await sample()).left).toBeGreaterThan(enabled.left + 10);
  await page.getByRole('switch', { name: 'Fold effect' }).check();
  await page.getByRole('button', { name: 'Make my meme' }).click();
  await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toBeVisible({ timeout: 90000 });
  const video = page.locator('.result-preview video');
  await expect(video).toBeAttached();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate(async (video: HTMLVideoElement, time: number) => {
    video.autoplay = false;
    video.pause();
    if (video.readyState < 1)
      await new Promise<void>((resolve) =>
        video.addEventListener('loadedmetadata', () => resolve(), { once: true }),
      );
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.currentTime = time;
    });
    video.pause();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, sampledTime);
  const exported = await video.evaluate((video: HTMLVideoElement) => {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 432;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(video, 0, 0, 768, 432);
    const mean = (x: number) => {
      const data = ctx.getImageData(x, 140, 40, 40).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      return sum / (data.length / 4);
    };
    return { left: mean(260), right: mean(484) };
  });
  expect(exported.right - exported.left).toBeGreaterThan(12);
  expect(Math.abs(exported.left - enabled.left)).toBeLessThan(18);
  expect(Math.abs(exported.right - enabled.right)).toBeLessThan(18);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download MP4', exact: true }).click();
  await (await downloadEvent).saveAs(`evidence/fold-${testInfo.project.name}.mp4`);
});
