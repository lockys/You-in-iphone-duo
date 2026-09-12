import { expect, test } from '@playwright/test';
import { request as httpRequest } from 'node:http';
import path from 'node:path';

// Real slow multipart connections hold workers without a mock API.
async function occupyWorker() {
  const request = httpRequest('http://127.0.0.1:3100/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=queue-test' },
  });
  request.on('error', () => {});
  const started = new Promise<void>((resolve, reject) => {
    request.once('error', reject);
    request.once('response', (response) => {
      response.once('data', () => resolve());
      response.resume();
    });
  });
  request.write(
    '--queue-test\r\nContent-Disposition: form-data; name="file"; filename="slow.mp4"\r\nContent-Type: video/mp4\r\n\r\n',
  );
  try {
    await started;
  } catch (error) {
    request.destroy();
    throw error;
  }
  return () => request.destroy();
}

test('busy server shows a cancellable queue and continues a real upload and render', async ({ page }) => {
  const freeFirst = await occupyWorker();
  let freeSecond = () => {};
  try {
    freeSecond = await occupyWorker();
    await page.goto('/?lang=en');
    const picker = page.locator('input[type=file]');
    await expect(picker).toBeEnabled();
    await picker.setInputFiles(path.resolve('tests/fixtures/grid.mp4'));
    await expect(page.locator('.progress-region')).toContainText('Queued · position 1');
    await expect(page.locator('.progress-region progress')).not.toHaveAttribute('value');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.progress-region')).toHaveCount(0);
    await picker.setInputFiles(path.resolve('tests/fixtures/grid.mp4'));
    await expect(page.locator('.progress-region')).toContainText('Queued · position 1');
    freeFirst();
    freeSecond();
    await expect(page.getByRole('button', { name: 'Make my meme' })).toBeEnabled();
    await expect(page.getByTestId('preview-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Make my meme' }).click();
    await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toBeVisible({
      timeout: 90000,
    });
  } finally {
    freeFirst();
    freeSecond();
  }
});
