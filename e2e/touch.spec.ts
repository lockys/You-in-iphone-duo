import { expect, test } from '@playwright/test';
import path from 'node:path';

test('單指拖曳與雙指縮放使用原生觸控事件', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('選擇影片檔案')).toBeEnabled();
  await page.getByLabel('選擇影片檔案').setInputFiles(path.resolve('tests/fixtures/grid.mp4'));
  await expect(page.getByRole('button', { name: '產生迷因' })).toBeEnabled();
  const canvas = page.getByTestId('preview-canvas');
  await page.getByTestId('preview-anchor').scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + 100,
    y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x, y, id: 1 },
      { x: x + 50, y, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x, y, id: 1 },
      { x: x + 100, y, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByLabel('畫面縮放', { exact: true })).toHaveValue('2');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 20, y: y + 10, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByLabel('X 水平位置')).not.toHaveValue('0');
});
