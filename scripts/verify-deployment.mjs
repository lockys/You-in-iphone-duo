import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

// Exercise the actual Build Output API artifact, without cloud credentials or network services.
const root = path.resolve('.vercel/output/functions/index.func');
process.env.VERCEL = '1';
process.env.BLOB_STORE_ID = '';
process.env.BLOB_READ_WRITE_TOKEN = '';
process.env.NODE_ENV = 'production';
const { default: handler } = await import(pathToFileURL(path.join(root, 'index.js')));
const server = createServer(handler);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const home = await fetch(`${origin}/?lang=en`);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<title[^>]*>You, in iPhoneDuo<\/title>/);
  const response = await fetch(`${origin}/api/template`);
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.storage, 'blob');
  assert.equal(config.template.width, 1920);
  const missing = await fetch(`${origin}/api/blob-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify({ name: 'test.mp4', mime: 'video/mp4', size: 10 }),
  });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'error.cloudStorage');
  const { binary, runProcess } = await import(pathToFileURL(path.join(root, 'src/lib/process.js')));
  for (const kind of ['ffmpeg', 'ffprobe']) {
    assert.ok(binary(kind).startsWith(root), 'Binary must resolve inside the artifact');
    await runProcess(binary(kind), ['-version']);
  }
  assert.equal(
    (await readdir(root)).some((name) => name.startsWith('.env')),
    false,
  );
  const vc = JSON.parse(await readFile(path.join(root, '.vc-config.json'), 'utf8'));
  assert.equal(vc.supportsResponseStreaming, true);
  assert.equal(vc.maxDuration, 300);
  console.log(
    'Vercel artifact passed: SSR, API, templates, native binaries, streaming, and clear missing-storage error.',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
