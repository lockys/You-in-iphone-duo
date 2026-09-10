import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { serveTemplatePreview } from '../server/template-preview';

it('serves seekable template byte ranges without loading the entire video', async () => {
  const file = await readFile('public/templates/preview.mp4');
  const url = 'http://localhost/templates/preview.mp4';
  const head = await serveTemplatePreview(new Request(url, { method: 'HEAD' }));
  expect(head.headers.get('content-length')).toBe(String(file.length));
  expect(head.headers.get('accept-ranges')).toBe('bytes');
  expect(await head.text()).toBe('');
  for (const [range, first, last] of [
    ['bytes=0-15', 0, 15],
    ['bytes=-16', file.length - 16, file.length - 1],
  ] as const) {
    const response = await serveTemplatePreview(new Request(url, { headers: { range } }));
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes ${first}-${last}/${file.length}`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(file.subarray(first, last + 1));
  }
  for (const range of ['bytes=-0', 'bytes=20-10', `bytes=${file.length}-`, 'bytes=0-1,3-4'])
    expect((await serveTemplatePreview(new Request(url, { headers: { range } }))).status).toBe(416);
});
