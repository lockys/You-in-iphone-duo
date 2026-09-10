import { expect, test } from '@playwright/test';
import path from 'node:path';

test('右側浮動操作列、縮放視窗與編輯狀態連續性', async ({ page }, testInfo) => {
  await page.goto('/?lang=en');
  await expect(page.getByLabel('Choose a video file')).toBeEnabled();
  await page.getByLabel('Choose a video file').setInputFiles(path.resolve('tests/fixtures/silent.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  await page.getByLabel('Zoom', { exact: true }).fill('1.5');
  await page.getByLabel('X position').fill('0.3');
  const source = await page.locator('video.source-video').nth(1).getAttribute('src');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 744, height: 410 },
    { width: 1040, height: 744 },
    { width: 1440, height: 1080 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByLabel('Zoom', { exact: true }).scrollIntoViewIfNeeded();
    const geometry = await page.evaluate(() => {
      const rail = document.querySelector('.action-rail')!.getBoundingClientRect();
      const content = document.querySelector('.editor-layout')!.getBoundingClientRect();
      const button = document.querySelector('.rail-primary')!.getBoundingClientRect();
      return {
        right: innerWidth - rail.right,
        top: rail.top,
        bottom: rail.bottom,
        height: innerHeight,
        gap: rail.left - content.right,
        width: button.width,
        buttonHeight: button.height,
        overflow: document.documentElement.scrollWidth > innerWidth,
        position: getComputedStyle(document.querySelector('.action-rail')!).position,
      };
    });
    expect(geometry.position).toBe('fixed');
    expect(geometry.right).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThan(32);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.gap).toBeGreaterThanOrEqual(8);
    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.overflow).toBe(false);
    await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('1.5');
    await expect(page.getByLabel('X position')).toHaveValue('0.3');
    await expect(page.locator('video.source-video').nth(1)).toHaveAttribute('src', source!);
    await expect(page.getByRole('button', { name: 'Make my meme' })).toBeInViewport();
    if (viewport.width === 744) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `evidence/duo-landscape-${testInfo.project.name}.png`, fullPage: true });
    }
  }
  await expect(page.getByRole('link', { name: /GitHub Source code/ })).toHaveAttribute(
    'href',
    'https://github.com/lockys/iphone-duo-green-screen-tool',
  );
});
