import { expect, test } from '@playwright/test';
import path from 'node:path';
import { createDualFixtures } from '../tests/dual-fixtures';

test.beforeAll(createDualFixtures);
test('two independently edited videos switch in preview and the downloaded MP4', async ({ page }, info) => {
  await page.goto('/?lang=en');
  await expect(page.getByRole('button', { name: 'One video', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Two videos', exact: true }).click();
  const picker = page.locator('input[type=file]');
  await expect(picker).toBeEnabled();
  await picker.setInputFiles(path.resolve('tests/fixtures/dual-red.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  await page.getByRole('slider', { name: 'Zoom', exact: true }).fill('1.3');
  await page.getByRole('button', { name: /Unfolded video/ }).click();
  await picker.setInputFiles(path.resolve('tests/fixtures/dual-blue.mp4'));
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  await page.getByRole('slider', { name: 'Zoom', exact: true }).fill('1.6');
  await page.getByRole('button', { name: /Folded video/ }).click();
  await expect(page.getByRole('slider', { name: 'Zoom', exact: true })).toHaveValue('1.3');
  await page.getByRole('button', { name: /Unfolded video/ }).click();
  await expect(page.getByRole('slider', { name: 'Zoom', exact: true })).toHaveValue('1.6');
  await page.getByRole('button', { name: 'One video', exact: true }).click();
  await expect(page.locator('.clip-picker')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Zoom', exact: true })).toHaveValue('1.6');
  await expect(page.locator('.drop-copy')).toContainText('dual-blue.mp4');
  await page.getByRole('button', { name: 'Two videos', exact: true }).click();
  await expect(page.getByRole('button', { name: /Folded video.*dual-red/ })).toBeVisible();
  await page.getByTestId('preview-anchor').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  const canvas = page.getByTestId('preview-canvas');
  for (const [time, channel] of [
    [1, 0],
    [4, 2],
  ] as const) {
    await page.getByRole('slider', { name: 'Preview timeline' }).fill(String(time));
    await expect
      .poll(() =>
        canvas.evaluate(
          (canvas: HTMLCanvasElement, c: number) =>
            canvas.getContext('2d')!.getImageData(405, 140, 1, 1).data[c],
          channel,
        ),
      )
      .toBeGreaterThan(180);
  }
  await canvas.screenshot({ path: `evidence/dual-preview-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Make my meme' }).click();
  const link = page.getByRole('link', { name: 'Download MP4', exact: true });
  await expect(link).toBeVisible({ timeout: 90000 });
  const download = page.waitForEvent('download');
  await link.click();
  await (await download).saveAs(`evidence/dual-${info.project.name}.mp4`);
  await page.getByRole('button', { name: 'Edit again', exact: true }).click();
  await expect(page.getByRole('button', { name: /Folded video.*dual-red/ })).toBeVisible();
  await page.getByRole('button', { name: /Folded video/ }).click();
  await page.getByRole('button', { name: 'Remove this video', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
  await page.getByRole('slider', { name: 'Preview timeline' }).fill('1');
  await expect
    .poll(() =>
      canvas.evaluate(
        (canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(405, 140, 1, 1).data[2],
      ),
    )
    .toBeGreaterThan(180);
});
