import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { POST as render } from '../server/routes/render';
import { GET as getTemplate } from '../server/routes/template';
import { POST as upload } from '../server/routes/upload';
import { GET as media, DELETE as remove } from '../server/routes/media';
import { acquire, cacheRoot, checkOrigin, receiveMultipart } from '../src/lib/server';
import { binary, runProcess } from '../src/lib/process';
import { locales, translate } from '../src/lib/i18n';
let cookie = '';
const url = 'http://localhost:3000';
function request(endpoint: string, body: FormData) {
  return new Request(url + endpoint, { method: 'POST', body, headers: { cookie, origin: url } });
}
async function events(response: Response): Promise<Record<string, unknown>[]> {
  return (await response.text())
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
async function fixture(name = 'silent.mp4') {
  return new File([await readFile(`tests/fixtures/${name}`)], name, {
    type: name.endsWith('.mov') ? 'video/quicktime' : name.endsWith('.webm') ? 'video/webm' : 'video/mp4',
  });
}
beforeAll(async () => {
  vi.stubEnv('RATE_LIMIT_MAX', '100');
  const result = await getTemplate(new Request(url + '/api/template'));
  cookie = result.headers.get('set-cookie')!.split(';')[0];
});
afterAll(() => vi.unstubAllEnvs());
describe('原生 API 整合', () => {
  it('六分鐘影片可匯入並從第 305 秒合成，API 僅宣告大小上限', async () => {
    const config = await (await getTemplate(new Request(url + '/api/template'))).json();
    expect(config).toMatchObject({ maxBytes: 20 * 1024 ** 2, maxDuration: null });
    const form = new FormData();
    form.set('file', await fixture('long.mp4'));
    const imported = (await events(await upload(request('/api/upload', form)))).at(-1)!;
    expect(imported).toMatchObject({ type: 'complete', info: { duration: 360 } });
    const ids = [String(imported.uploadId)];
    try {
      const next = new FormData();
      next.set('uploadId', ids[0]);
      next.set('startTime', '305');
      const done = (await events(await render(request('/api/render', next)))).at(-1)!;
      expect(done).toMatchObject({ type: 'complete', info: { codec: 'h264' } });
      expect((done.info as { duration: number }).duration).toBeCloseTo(5.84, 1);
      ids.push(String(done.resultId));
    } finally {
      for (const id of ids)
        await remove(new Request(url + `/api/media/${id}`, { method: 'DELETE', headers: { cookie } }), {
          params: Promise.resolve({ id }),
        });
    }
  });
  it('磁碟串流接受恰好 20 MB，超過一個位元組即拒絕', async () => {
    await mkdir(cacheRoot, { recursive: true });
    const dir = await mkdtemp(`${cacheRoot}/limit-`);
    try {
      const form = new FormData();
      form.set('file', new File([Buffer.alloc(20 * 1024 ** 2)], 'exact.mp4', { type: 'video/mp4' }));
      const exact = await receiveMultipart(request('/api/upload', form), dir, new AbortController().signal);
      expect(exact.size).toBe(20 * 1024 ** 2);
      await rm(exact.file!);
      form.set('file', new File([Buffer.alloc(20 * 1024 ** 2 + 1)], 'large.mp4', { type: 'video/mp4' }));
      await expect(
        receiveMultipart(request('/api/upload', form), dir, new AbortController().signal),
      ).rejects.toMatchObject({ status: 413 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.each(locales)('%s 的 HTTP 與串流錯誤均回傳譯文及穩定代碼', async (locale) => {
    const blocked = await render(
      new Request(url + '/api/render', {
        method: 'POST',
        headers: { origin: 'https://other.test', 'x-frame-language': locale },
      }),
    );
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({
      code: 'error.origin',
      error: translate(locale, 'error.origin'),
    });
    const req = request('/api/upload', new FormData());
    req.headers.set('x-frame-language', locale);
    const streamed = (await events(await upload(req))).at(-1);
    expect(streamed).toMatchObject({
      type: 'error',
      code: 'error.chooseFile',
      error: translate(locale, 'error.chooseFile'),
    });
  });
  it('同源 127.0.0.1 Host 不受 Next 內部 localhost URL 正規化影響', () => {
    expect(() =>
      checkOrigin(new Request(url, { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })),
    ).not.toThrow();
    expect(() =>
      checkOrigin(new Request(url, { headers: { host: '127.0.0.1:3000', origin: 'https://attacker.test' } })),
    ).toThrow();
  });
  it('拒絕非 multipart 與跨站請求', async () => {
    const r = await render(
      new Request(url + '/api/render', {
        method: 'POST',
        body: '{}',
        headers: { origin: 'https://other.test' },
      }),
    );
    expect(r.status).toBe(403);
    const body = await events(await render(new Request(url + '/api/render', { method: 'POST', body: '{}' })));
    expect(body.at(-1)).toMatchObject({ type: 'error' });
  });
  it('偽裝影片與參數錯誤會清理獨立目錄', async () => {
    const before = await readdir(cacheRoot);
    const form = new FormData();
    form.set('file', new File(['not a video'], 'bad.mp4', { type: 'video/mp4' }));
    const result = await events(await render(request('/api/render', form)));
    expect(result.at(-1)?.type).toBe('error');
    expect(await readdir(cacheRoot)).toEqual(before);
  });
  it('直接串流 multipart 真正產出可讀取、可 Range 下載的 MP4；跨使用者無法讀取', async () => {
    const form = new FormData();
    form.set('file', await fixture('long.mp4'));
    form.set('audioMode', 'user');
    form.set('startTime', '305');
    const body = await events(await render(request('/api/render', form)));
    const done = body.at(-1)!;
    expect(done, JSON.stringify(body)).toMatchObject({
      type: 'complete',
      info: { width: 1920, height: 1080, codec: 'h264', hasAudio: false },
    });
    const id = String(done.resultId);
    const context = { params: Promise.resolve({ id }) };
    expect((await media(new Request(url + `/api/media/${id}`), context)).status).toBe(404);
    const capability = await media(new Request(url + done.url, { headers: { range: 'bytes=0-3' } }), context);
    expect(capability.status).toBe(206);
    await capability.arrayBuffer();
    expect((await remove(new Request(url + done.url, { method: 'DELETE' }), context)).status).toBe(404);
    const range = await media(
      new Request(url + done.url, { headers: { cookie, range: 'bytes=0-31' } }),
      context,
    );
    expect(range.status).toBe(206);
    expect((await range.arrayBuffer()).byteLength).toBe(32);
    const invalid = await media(
      new Request(url + done.url, { headers: { cookie, range: 'bytes=999999999-' } }),
      context,
    );
    expect(invalid.status).toBe(416);
    expect(
      (await remove(new Request(url + done.url, { method: 'DELETE', headers: { cookie } }), context)).status,
    ).toBe(204);
  });
  it('旋轉 MOV 先轉預覽再合成；結果保留直式資訊及模板音訊', async () => {
    const form = new FormData();
    form.set('file', await fixture('rotated.mov'));
    const imported = (await events(await upload(request('/api/upload', form)))).at(-1)!;
    expect(imported).toMatchObject({
      type: 'complete',
      info: { width: 360, height: 640, rotation: 90, hasAudio: false },
    });
    const next = new FormData();
    next.set('uploadId', String(imported.uploadId));
    next.set('audioMode', 'template');
    next.set('scale', '1.2');
    const done = (await events(await render(request('/api/render', next)))).at(-1)!;
    expect(done).toMatchObject({ type: 'complete', info: { hasAudio: true, codec: 'h264' } });
    for (const id of [done.resultId, imported.uploadId])
      await remove(new Request(url + `/api/media/${id}`, { method: 'DELETE', headers: { cookie } }), {
        params: Promise.resolve({ id: String(id) }),
      });
  });
  it('限制並行數及短時間重複要求', () => {
    const a = acquire(new Request(url)),
      b = acquire(new Request(url));
    expect(() => acquire(new Request(url))).toThrow('目前有人');
    a();
    b();
    const previous = process.env.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_MAX = '1';
    expect(() => acquire(new Request(url))).toThrow('操作太頻繁');
    if (previous) process.env.RATE_LIMIT_MAX = previous;
    else delete process.env.RATE_LIMIT_MAX;
  });
  it('取消訊號終止原生 FFmpeg 子程序', async () => {
    const controller = new AbortController();
    const running = runProcess(
      binary('ffmpeg'),
      ['-re', '-f', 'lavfi', '-i', 'color=s=32x32:r=1', '-f', 'null', '-'],
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 100);
    await expect(running).rejects.toThrow('已取消');
  });
  it('處理 timeout 確實終止子程序', async () => {
    await expect(
      runProcess(binary('ffmpeg'), ['-re', '-f', 'lavfi', '-i', 'color=s=32x32:r=1', '-f', 'null', '-'], {
        timeout: 100,
      }),
    ).rejects.toThrow('處理時間過長');
  });
  it.each(['hevc-hlg.mov', 'sample.webm'])('%s 可匯入並轉成 H.264 預覽', async (name) => {
    const form = new FormData();
    form.set('file', await fixture(name));
    const imported = (await events(await upload(request('/api/upload', form)))).at(-1)!;
    expect(imported, JSON.stringify(imported)).toMatchObject({
      type: 'complete',
      info: { width: 360, height: 640, hasAudio: true },
    });
    await remove(
      new Request(url + `/api/media/${imported.uploadId}`, { method: 'DELETE', headers: { cookie } }),
      { params: Promise.resolve({ id: String(imported.uploadId) }) },
    );
  });
  it('取消回應串流會停止合成並清理工作目錄', async () => {
    const before = (await readdir(cacheRoot)).sort();
    const form = new FormData();
    form.set('file', await fixture());
    const response = await render(request('/api/render', form));
    const reader = response.body!.getReader();
    let text = '';
    while (!text.includes('compositing')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    expect(text).toContain('compositing');
    await reader.cancel();
    await expect.poll(async () => (await readdir(cacheRoot)).sort(), { timeout: 5000 }).toEqual(before);
  });
  it('串流處理前拒絕超大 content-length，並清除目錄', async () => {
    const before = (await readdir(cacheRoot)).sort();
    const form = new FormData();
    form.set('file', await fixture());
    const req = request('/api/render', form);
    req.headers.set('content-length', String(21 * 1024 ** 2));
    expect((await events(await render(req))).at(-1)).toMatchObject({
      type: 'error',
      error: '影片不能超過 20 MB。',
    });
    expect((await readdir(cacheRoot)).sort()).toEqual(before);
  });
});
