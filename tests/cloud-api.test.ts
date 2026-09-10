import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

const store = vi.hoisted(() => new Map<string, { bytes: Buffer; etag: string; uploadedAt: Date }>());
vi.mock('@vercel/blob', async (original) => {
  const actual = await original<typeof import('@vercel/blob')>();
  return {
    ...actual,
    get: vi.fn(async (key: string, options: { access: string }) => {
      expect(options.access).toBe('private');
      const item = store.get(key);
      if (!item) return null;
      return {
        statusCode: 200,
        stream: new Response(Uint8Array.from(item.bytes)).body,
        headers: new Headers(),
        blob: { size: item.bytes.length, etag: item.etag, pathname: key },
      };
    }),
    put: vi.fn(
      async (
        key: string,
        body: unknown,
        options: { access: string; ifMatch?: string; allowOverwrite?: boolean },
      ) => {
        expect(options.access).toBe('private');
        const prior = store.get(key);
        if ((options.ifMatch && prior?.etag !== options.ifMatch) || (!options.allowOverwrite && prior))
          throw new actual.BlobPreconditionFailedError();
        const bytes =
          typeof body === 'string'
            ? Buffer.from(body)
            : body instanceof Readable
              ? Buffer.concat(await Array.fromAsync(body))
              : Buffer.from(body as Uint8Array);
        const etag = `${Math.random()}`;
        store.set(key, { bytes, etag, uploadedAt: new Date() });
        return { etag, pathname: key };
      },
    ),
    del: vi.fn(async (keys: string | string[]) => {
      for (const key of [keys].flat()) store.delete(key);
    }),
    list: vi.fn(async () => ({
      blobs: [...store].map(([pathname, item]) => ({ pathname, uploadedAt: item.uploadedAt })),
      hasMore: false,
    })),
    // Replace only the remote issuer; exercise the SDK's actual URL signing protocol.
    issueSignedToken: vi.fn(async (options: import('@vercel/blob').IssueSignedTokenOptions) => ({
      delegationToken:
        Buffer.from(JSON.stringify({ storeId: 'store_test', ...options })).toString('base64url') +
        '.test-only',
      clientSigningToken: Buffer.alloc(32, 1).toString('base64url'),
      validUntil: options.validUntil!,
    })),
  };
});

const origin = 'https://example.test';
const cookie = 'meme-session=' + 'a'.repeat(64);
function req(path: string, body?: FormData | Record<string, unknown>, auth = cookie) {
  return new Request(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: auth,
      origin,
      ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
async function events(response: Response) {
  return (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}
beforeEach(() => {
  store.clear();
  vi.stubEnv('MEDIA_STORAGE', 'blob');
  vi.stubEnv('BLOB_STORE_ID', 'store_test');
  vi.stubEnv('BLOB_WEBHOOK_PUBLIC_KEY', 'test-public-key');
  vi.stubEnv('RATE_LIMIT_MAX', '100');
  vi.stubEnv('MAX_CONCURRENT_JOBS', '2');
});
afterEach(() => vi.unstubAllEnvs());

it('未連接雲端儲存時回傳明確三語錯誤，並驗證 ticket 檔案類型', async () => {
  const { routeCloudApi: api } = await import('../server/cloud-api');
  vi.stubEnv('BLOB_STORE_ID', '');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
  const response = await api(req('/api/blob-ticket', { name: 'a.mp4', mime: 'video/mp4', size: 10 }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: 'error.cloudStorage' });
  vi.stubEnv('BLOB_STORE_ID', 'store_test');
  const invalid = await api(req('/api/blob-ticket', { name: 'a.html', mime: 'text/html', size: 10 }));
  expect(invalid.status).toBe(400);
});

it('Blob ticket 限制 5 MB，超過一個位元組即拒絕且不建立素材', async () => {
  const { routeCloudApi: api } = await import('../server/cloud-api');
  const exact = await api(
    req('/api/blob-ticket', { name: 'exact.mp4', mime: 'video/mp4', size: 5 * 1024 ** 2 }),
  );
  expect(exact.status).toBe(200);
  const before = [...store.keys()].filter((key) => key.includes('/assets/'));
  const oversized = await api(
    req('/api/blob-ticket', { name: 'large.mp4', mime: 'video/mp4', size: 5 * 1024 ** 2 + 1 }),
  );
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toMatchObject({ code: 'error.fileSize', params: { size: 5 } });
  expect([...store.keys()].filter((key) => key.includes('/assets/'))).toEqual(before);
});

it('六分鐘影片跨冷啟動完成真實上傳、FFmpeg 合成、私有下載及刪除', async () => {
  let { routeCloudApi: api } = await import('../server/cloud-api');
  const bytes = await readFile('tests/fixtures/long.mp4');
  const ticket = await (
    await api(req('/api/blob-ticket', { name: 'silent.mp4', mime: 'video/mp4', size: bytes.length }))
  ).json();
  const signing = await api(
    req('/api/blob-upload', {
      type: 'blob.generate-presigned-url',
      payload: { pathname: ticket.pathname, clientPayload: ticket.id, multipart: true },
    }),
  );
  expect(signing.status).toBe(200);
  expect(await signing.json()).toMatchObject({
    type: 'blob.generate-presigned-url',
    presignedUrlPayload: { signature: expect.any(String) },
  });
  const sdk = await import('@vercel/blob');
  expect(sdk.issueSignedToken).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: ticket.pathname,
      operations: ['put'],
      maximumSizeInBytes: bytes.length,
    }),
  );
  const wrong = await api(
    req('/api/blob-upload', {
      type: 'blob.generate-presigned-url',
      payload: { pathname: ticket.pathname.replace('/source', '/manifest.json'), clientPayload: ticket.id },
    }),
  );
  expect(wrong.status).toBe(400);
  store.set(ticket.pathname, { bytes, etag: 'source', uploadedAt: new Date() });
  const form = new FormData();
  form.set('cloudId', ticket.id);
  const uploaded = await events(await api(req('/api/upload', form)));
  expect(uploaded.at(-1), JSON.stringify(uploaded)).toMatchObject({
    type: 'complete',
    uploadId: ticket.id,
    info: { codec: 'h264', duration: 360 },
  });
  vi.resetModules();
  ({ routeCloudApi: api } = await import('../server/cloud-api'));
  const edit = new FormData();
  edit.set('uploadId', ticket.id);
  edit.set('audioMode', 'mute');
  edit.set('startTime', '305');
  const rendered = await events(await api(req('/api/render', edit)));
  const done = rendered.at(-1);
  expect(done, JSON.stringify(rendered)).toMatchObject({
    type: 'complete',
    info: { width: 1920, height: 1080, codec: 'h264' },
  });
  expect(done.info.duration).toBeGreaterThan(5.8);
  expect(done.info.duration).toBeLessThan(5.9);
  const resultBytes = [...store].find(([key]) => key.endsWith(`${done.resultId}/result.mp4`))![1].bytes;
  expect(resultBytes.toString('ascii', 4, 8)).toBe('ftyp');
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/cloud-output.mp4', resultBytes);
  const { binary, runProcess } = await import('../src/lib/process');
  const probe = JSON.parse(
    await runProcess(binary('ffprobe'), [
      '-v',
      'error',
      '-show_streams',
      '-of',
      'json',
      'evidence/cloud-output.mp4',
    ]),
  );
  expect(probe.streams[0].pix_fmt).toBe('yuv420p');
  vi.resetModules();
  ({ routeCloudApi: api } = await import('../server/cloud-api'));
  expect(
    (await api(req(`/api/media/${done.resultId}`, undefined, 'meme-session=' + 'b'.repeat(64)))).status,
  ).toBe(404);
  const playable = await api(req(done.url, undefined, ''));
  expect(playable.status).toBe(307);
  expect(playable.headers.get('location')).toContain('/result.mp4');
  expect(playable.headers.get('cache-control')).toBe('private, no-store');
  const download = await api(req(done.url + '&download=1'));
  expect(new URL(download.headers.get('location')!).searchParams.get('download')).toBe('1');
  const denied = await api(new Request(origin + done.url, { method: 'DELETE', headers: { origin } }));
  expect(denied.status).toBe(404);
  const deleted = await api(
    new Request(origin + done.url, { method: 'DELETE', headers: { origin, cookie } }),
  );
  expect(deleted.status).toBe(204);
  expect((await api(req(done.url))).status).toBe(404);
  expect([...store.keys()].some((key) => key.endsWith(`${done.resultId}/result.mp4`))).toBe(false);
});

it('損壞影片不留下原始 Blob，缺少簽章設定與清理未授權皆明確拒絕', async () => {
  const { routeCloudApi: api } = await import('../server/cloud-api');
  const bytes = Buffer.from('not a movie');
  const ticket = await (
    await api(req('/api/blob-ticket', { name: 'broken.mp4', mime: 'video/mp4', size: bytes.length }))
  ).json();
  vi.stubEnv('BLOB_WEBHOOK_PUBLIC_KEY', '');
  const signing = await api(req('/api/blob-upload', {}));
  expect(signing.status).toBe(503);
  expect(await signing.json()).toMatchObject({ code: 'error.cloudStorage' });
  store.set(ticket.pathname, { bytes, etag: 'bad-source', uploadedAt: new Date() });
  const form = new FormData();
  form.set('cloudId', ticket.id);
  expect((await events(await api(req('/api/upload', form)))).at(-1)).toMatchObject({
    type: 'error',
    code: 'error.codec',
  });
  expect(store.has(ticket.pathname)).toBe(false);
  vi.stubEnv('CRON_SECRET', 'test-cron');
  expect((await api(req('/api/cleanup'))).status).toBe(401);
  expect(
    (await api(new Request(origin + '/api/cleanup', { headers: { authorization: 'Bearer test-cron' } })))
      .status,
  ).toBe(200);
});

it('跨 instance 的工作數上限與限流不可由更換匿名 session 繞過', async () => {
  vi.stubEnv('MAX_CONCURRENT_JOBS', '1');
  const first = await import('../server/cloud-store');
  const release = await first.acquireCloud(req('/'));
  vi.resetModules();
  const second = await import('../server/cloud-store');
  await expect(second.acquireCloud(req('/', undefined, 'other'))).rejects.toMatchObject({
    code: 'error.concurrent',
  });
  await release();
  const next = await second.acquireCloud(req('/'));
  await next();
  vi.stubEnv('RATE_LIMIT_MAX', '1');
  await expect(second.acquireCloud(req('/'))).rejects.toMatchObject({ code: 'error.rateLimit' });
});

it('拒絕路徑穿越、過期存取，清理範圍只限本專案過期素材', async () => {
  const { getCloudAsset, sweepCloud } = await import('../server/cloud-store');
  await expect(getCloudAsset('../secrets', 'a')).rejects.toMatchObject({ code: 'error.expired' });
  const expired = `${Date.now() - 1000}-${'f'.repeat(48)}`;
  await expect(getCloudAsset(expired, 'a')).rejects.toMatchObject({ code: 'error.expired' });
  store.set(`iphone-duo/v1/assets/${expired}/source`, {
    bytes: Buffer.from('test'),
    etag: '1',
    uploadedAt: new Date(),
  });
  store.set('another-project/source', { bytes: Buffer.from('test'), etag: '1', uploadedAt: new Date() });
  expect(await sweepCloud()).toBe(1);
  expect(store.has('another-project/source')).toBe(true);
});
