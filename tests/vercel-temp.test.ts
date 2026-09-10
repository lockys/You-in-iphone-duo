import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
    mkdir: (...args: Parameters<typeof fs.mkdir>) => {
      if (path.resolve(String(args[0])).startsWith(process.cwd())) {
        throw Object.assign(new Error('read-only deployment'), { code: 'EROFS' });
      }
      return fs.mkdir(...args);
    },
  };
});

afterEach(() => vi.unstubAllEnvs());
it('Vercel 的唯讀專案目錄不會讓真實上傳回傳 error.generic', async () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('MEDIA_TEMP_DIR', '.media-cache');
  const { POST } = await import('../server/routes/upload');
  const { cacheRoot, findAsset, dispose } = await import('../src/lib/server');
  const form = new FormData();
  form.set(
    'file',
    new File([await readFile('tests/fixtures/silent.mp4')], 'test.mp4', { type: 'video/mp4' }),
  );
  const response = await POST(new Request('https://example.test/api/upload', { method: 'POST', body: form }));
  const events = (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(events.at(-1), JSON.stringify(events)).toMatchObject({ type: 'complete' });
  expect(cacheRoot).toBe(path.join(tmpdir(), 'iphone-duo-media'));
  const { session } = await import('../src/lib/server');
  const owner = session(
    new Request('https://example.test', { headers: { cookie: response.headers.get('set-cookie')! } }),
  ).owner;
  await dispose(findAsset(events.at(-1).uploadId, owner));
});
