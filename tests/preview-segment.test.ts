import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { POST as upload } from '../server/routes/upload';
import { POST as preview } from '../server/routes/preview';
import { GET as media } from '../server/routes/media';
import { dispose, findAsset, session } from '../src/lib/server';
import { probe } from '../src/lib/process';
import { previewArgs, previewKey, previewStart } from '../src/lib/preview-segment';
import template from '../public/templates/template.json';

const cookie = 'meme-session=' + 'e'.repeat(64);
function req(body?: FormData, auth = cookie) {
  return new Request('http://localhost/api/preview', {
    method: 'POST',
    body,
    headers: { origin: 'http://localhost', cookie: auth },
  });
}
async function done(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .at(-1);
}
let id: string;
beforeAll(async () => {
  vi.stubEnv('RATE_LIMIT_MAX', '200');
  const form = new FormData();
  form.set('file', new File([await readFile('tests/fixtures/long.mp4')], 'long.mp4', { type: 'video/mp4' }));
  const result = await done(await upload(req(form)));
  expect(result).toMatchObject({ type: 'complete', info: { duration: 360 }, previewStartTime: 0 });
  expect(result.previewDuration).toBe(template.duration);
  id = result.uploadId;
});
afterAll(async () => {
  if (id) await dispose(findAsset(id, session(req()).owner));
  vi.unstubAllEnvs();
});
function form(start: string, source = id) {
  const body = new FormData();
  body.set('uploadId', source);
  body.set('startTime', start);
  return body;
}

it('keeps full source metadata but bounds every preview decode and output', async () => {
  const asset = findAsset(id, session(req()).owner);
  const info = await probe(asset.preview!);
  expect(info.duration).toBeCloseTo(template.duration, 1);
  expect(asset.info!.duration).toBe(360);
  const args = previewArgs(asset.info!, 'in.mp4', 'out.mp4', 305, template.duration);
  expect(args.filter((value) => value === '-t')).toHaveLength(2);
  expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2)).toEqual(['-ss', '305']);
  expect(() => previewStart(-1, asset.info!)).toThrow();
  expect(() => previewStart(360, asset.info!)).toThrow();
  expect(previewKey(305)).toMatch(/^[a-f0-9]{24}$/);
});
it('seeks to 305 seconds, serves Range and caches at most four completed segments', async () => {
  const first = await done(await preview(req(form('305'))));
  expect(first).toMatchObject({ type: 'complete', uploadId: id, previewStartTime: 305 });
  const asset = findAsset(id, session(req()).owner);
  const files = await readdir(asset.dir);
  const again = await done(await preview(req(form('305'))));
  expect(again.previewUrl).toBe(first.previewUrl);
  expect(await readdir(asset.dir)).toEqual(files);
  const read = await media(
    new Request('http://localhost' + first.previewUrl, { headers: { range: 'bytes=0-31' } }),
    { params: Promise.resolve({ id }) },
  );
  expect(read.status).toBe(206);
  expect((await read.arrayBuffer()).byteLength).toBe(32);
  for (const start of ['10', '20', '30', '40'])
    expect(await done(await preview(req(form(start))))).toMatchObject({ type: 'complete' });
  expect(asset.segments).toHaveLength(4);
  expect((await readdir(asset.dir)).filter((file) => file.endsWith('.mp4'))).toHaveLength(4);
  expect(
    (await media(new Request('http://localhost' + first.previewUrl), { params: Promise.resolve({ id }) }))
      .status,
  ).toBe(404);
});
it('rejects foreign IDs, invalid time, file bodies and path traversal without losing the source', async () => {
  expect(await done(await preview(req(form('0'), 'meme-session=' + 'f'.repeat(64))))).toMatchObject({
    code: 'error.expired',
  });
  expect(await done(await preview(req(form('NaN'))))).toMatchObject({ code: 'error.invalidFields' });
  expect(await done(await preview(req(form('0', '../source'))))).toMatchObject({ code: 'error.expired' });
  const invalid = form('0');
  invalid.set('file', new File(['bad'], 'bad.mp4'));
  expect((await preview(req(invalid))).status).toBe(400);
  const oversized = new Request('http://localhost/api/preview', {
    method: 'POST',
    headers: { origin: 'http://localhost', cookie, 'content-type': 'multipart/form-data; boundary=test' },
    body: new Uint8Array(40000),
  });
  expect((await preview(oversized)).status).toBe(400);
  expect(findAsset(id, session(req()).owner).info!.duration).toBe(360);
});
it('failed preview generation removes partial files but keeps the source and last preview', async () => {
  const asset = findAsset(id, session(req()).owner);
  const original = await readFile(asset.file);
  const files = await readdir(asset.dir);
  await writeFile(asset.file, 'broken');
  try {
    expect(await done(await preview(req(form('99'))))).toMatchObject({ type: 'error', code: 'error.codec' });
    expect(await readdir(asset.dir)).toEqual(files);
    expect(asset.deleting).not.toBe(true);
  } finally {
    await writeFile(asset.file, original);
  }
});
