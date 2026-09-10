import { expect, test } from '@playwright/test';
import path from 'node:path';

test('真實 MP4 分享、社群下載、系統取消及錯誤處理', async ({ page }, testInfo) => {
  const shares: { size: number; type: string; url?: string; header: string; text: string }[] = [];
  const opened: string[] = [];
  await page.exposeFunction('captureShare', (data: (typeof shares)[number]) => shares.push(data));
  await page.exposeFunction('captureIntent', (url: string) => opened.push(url));
  // Only OS/external platform boundaries are simulated. Upload, rendering and files remain real.
  await page.addInitScript(() => {
    const state = window as unknown as {
      shareOutcome: string;
      captureShare: (data: object) => Promise<void>;
      captureIntent: (url: string) => void;
    };
    state.shareOutcome = 'success';
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: ShareData) => !!data.files?.[0]?.size,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        if (state.shareOutcome === 'cancel') throw new DOMException('Cancelled', 'AbortError');
        if (state.shareOutcome === 'error') throw new DOMException('Unavailable', 'NotAllowedError');
        const file = data.files![0];
        await state.captureShare({
          size: file.size,
          type: file.type,
          url: data.url,
          header: await file.slice(4, 8).text(),
          text: data.text,
        });
      },
    });
    document.addEventListener('click', (event) => {
      const link = (event.target as Element).closest('.social-buttons a');
      if (!link) return;
      event.preventDefault();
      state.captureIntent(link.getAttribute('href')!);
    });
  });
  await page.goto('/?lang=en');
  await expect(page.getByLabel('Choose a video file')).toBeEnabled();
  await page.getByLabel('Choose a video file').setInputFiles(path.resolve('tests/fixtures/portrait.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  await page.getByRole('button', { name: 'Make my meme' }).click();
  await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toBeVisible({ timeout: 90000 });
  const trigger = page.getByRole('button', { name: 'Share your video', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Share your video' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share video', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Share video', exact: true }).click();
  await expect(page.getByText('Handed off to the share sheet.')).toBeVisible();
  expect(shares).toHaveLength(1);
  expect(shares[0]).toMatchObject({ type: 'video/mp4', header: 'ftyp' });
  expect(shares[0].size).toBeGreaterThan(1000);
  expect(shares[0].url).toBeUndefined();
  expect(shares[0].text).toContain('#uiniphoneduo');
  await page.evaluate(() => {
    (window as unknown as { shareOutcome: string }).shareOutcome = 'cancel';
  });
  await page.getByRole('button', { name: 'Share video', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { shareOutcome: string }).shareOutcome = 'error';
  });
  await page.getByRole('button', { name: 'Share video', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Sharing did not finish');
  const notice = dialog.getByRole('alert');
  await expect(notice).toBeInViewport();
  expect((await notice.boundingBox())!.y).toBeLessThan(40);
  await page.screenshot({ path: `evidence/top-share-error-${testInfo.project.name}.png` });
  await notice.getByRole('button', { name: 'Dismiss error' }).click();
  await expect(notice).toHaveCount(0);
  await expect(dialog).toBeVisible();
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'Download MP4', exact: true }).click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe('phone-meme.mp4');
  for (const platform of ['Threads', 'X', 'Bluesky']) {
    const link = page.getByRole('link', { name: `Share to ${platform}`, exact: true });
    const href = (await link.getAttribute('href'))!;
    expect(decodeURIComponent(href)).toContain('#uiniphoneduo');
    const android = await page.evaluate(() => /Android/i.test(navigator.userAgent));
    expect(href.startsWith('intent://')).toBe(android);
    if (android) expect(href).toContain('S.browser_fallback_url=https%3A');
    await link.click();
    await expect(dialog.getByRole('status')).toContainText(`to your ${platform} post`);
  }
  expect(opened).toHaveLength(3);
  expect(opened.join(' ')).not.toMatch(/access=|api\/media|localhost|127\.0\.0\.1/);
  await page.screenshot({ path: `evidence/share-${testInfo.project.name}.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: 'Close sharing' }).click();
  await expect(trigger).toBeFocused();
});
