import { expect, test } from '@playwright/test';
import path from 'node:path';

const versions = [
  {
    locale: 'zh-Hant',
    html: 'zh-Hant-TW',
    title: 'You, in iPhoneDuo',
    invalid: '請匯入 MP4、MOV 或 WebM 影片。',
    damaged: '無法處理這支影片',
  },
  {
    locale: 'zh-Hans',
    html: 'zh-Hans-CN',
    title: 'You, in iPhoneDuo',
    invalid: '请导入 MP4、MOV 或 WebM 视频。',
    damaged: '无法处理此视频',
  },
  {
    locale: 'en',
    html: 'en',
    title: 'You, in iPhoneDuo',
    invalid: 'Please choose an MP4, MOV, or WebM video.',
    damaged: 'Cannot process this video.',
  },
] as const;

test('三種語言網址、來源、記憶偏好與真實 API 錯誤', async ({ page, request }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  for (const version of versions) {
    const html = await (await request.get(`/?lang=${version.locale}`)).text();
    expect(html).toContain(`<html lang="${version.html}"`);
    expect(html).toContain(version.title);
    expect(html.match(/<title>/g)).toHaveLength(1);
    await page.goto(`/?lang=${version.locale}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(version.title);
    await expect(page.locator('html')).toHaveAttribute('lang', version.html);
    await expect(page.getByRole('combobox')).toHaveValue(version.locale);
    const source = page.getByTestId('template-source');
    await expect(source).toHaveText('@MurdoinkGS · X');
    await expect(source).toHaveAttribute('href', 'https://x.com/MurdoinkGS/status/2097794206525788302');
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('image') });
    await expect(page.locator('.error-banner[role="alert"]')).toContainText(version.invalid);
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('invalid video') });
    await expect(page.locator('.error-banner[role="alert"]')).toContainText(version.damaged);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: `evidence/i18n-${version.locale}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
  // An existing error switches languages immediately; it does not stay in the request's language.
  await page.getByRole('combobox').selectOption('zh-Hans');
  await expect(page.locator('.error-banner[role="alert"]')).toContainText('无法处理此视频');
  await page.goto('/');
  await expect(page.getByRole('combobox')).toHaveValue('zh-Hans');
  await page.getByRole('combobox').selectOption('en');
  await expect(page).toHaveURL(/lang=en/);
  await expect(page).toHaveTitle('You, in iPhoneDuo');
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Upload a video/);
  const bodyText = await page.locator('body').evaluate((body) => {
    const copy = body.cloneNode(true) as HTMLElement;
    copy.querySelector('.language-picker')?.remove();
    copy.querySelectorAll('script').forEach((script) => script.remove());
    return copy.textContent;
  });
  expect(bodyText).not.toMatch(/[\u3400-\u9fff]/);
  await page.reload();
  await expect(page.getByRole('combobox')).toHaveValue('en');
  expect(pageErrors).toEqual([]);
});

test('切換語言保留影片與調整值，處理中及成品仍可切換、播放、下載', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?lang=en');
  await expect(page.getByLabel('Choose a video file')).toBeEnabled();
  await page.getByLabel('Choose a video file').setInputFiles(path.resolve('tests/fixtures/portrait.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  await page.getByLabel('Zoom', { exact: true }).fill('1.4');
  await page.getByLabel('X position').fill('0.2');
  await page.getByLabel('Y position').fill('-0.3');
  await page.getByLabel('Start time', { exact: true }).fill('0.4');
  await page.getByRole('radio', { name: 'My video', exact: true }).check();
  const source = await page.locator('video.source-video').nth(1).getAttribute('src');
  await page.getByRole('combobox').selectOption('zh-Hans');
  await expect(page.getByLabel('画面缩放', { exact: true })).toHaveValue('1.4');
  await expect(page.getByLabel('开始时间', { exact: true })).toHaveValue('0.4');
  await expect(page.getByLabel('X 水平位置')).toHaveValue('0.2');
  await expect(page.getByLabel('Y 垂直位置')).toHaveValue('-0.3');
  await expect(page.getByRole('radio', { name: '我的视频', exact: true })).toBeChecked();
  await expect(page.locator('video.source-video').nth(1)).toHaveAttribute('src', source!);
  await page.getByRole('combobox').selectOption('en');
  await page.screenshot({ path: `evidence/i18n-en-edit-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Make my meme' }).click();
  await expect(page.getByLabel('Video processing progress')).toBeVisible();
  await page.getByRole('combobox').selectOption('zh-Hans');
  await expect(page.getByRole('link', { name: '下载 MP4', exact: true })).toBeVisible({ timeout: 90000 });
  const url = await page.getByRole('link', { name: '下载 MP4', exact: true }).getAttribute('href');
  await page.getByRole('combobox').selectOption('en');
  await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toHaveAttribute('href', url!);
  await page.getByRole('button', { name: 'Play finished video' }).click();
  await expect
    .poll(() =>
      page.getByLabel('Finished video', { exact: true }).evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(0.05);
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download MP4', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('phone-meme.mp4');
  await download.saveAs(`evidence/i18n-${testInfo.project.name}.mp4`);
  await page.getByRole('combobox').selectOption('zh-Hant');
  await page.getByRole('button', { name: '重新編輯' }).click();
  await expect(page.getByLabel('畫面縮放', { exact: true })).toHaveValue('1.4');
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});
