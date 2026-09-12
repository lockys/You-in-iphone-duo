import { errorPayload } from './errors';
import { languageHeader, resolveLocale } from './i18n';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import { MediaError, type MediaInfo, type Template, validateFile, uploadLimit } from './composition';

// Vercel's application bundle is read-only. Never resolve its temp files under cwd,
// even when a copied .env.example still specifies the local relative directory.
export const cacheRoot =
  process.env.VERCEL === '1'
    ? path.join(tmpdir(), 'iphone-duo-media')
    : path.resolve(process.env.MEDIA_TEMP_DIR || '.media-cache');
export const maxBytes = uploadLimit(process.env.MAX_UPLOAD_MB);
const ttl = Number(process.env.MEDIA_TTL_MS || 1200000);
export type Asset = {
  id: string;
  readToken: string;
  owner: string;
  dir: string;
  file: string;
  preview?: string;
  info?: MediaInfo;
  size?: number;
  created: number;
  touched: number;
  busy: number;
  deleting?: boolean;
};
type State = {
  assets: Map<string, Asset>;
  limits: Map<string, { time: number; count: number }>;
  active: number;
  cleanup?: Promise<void>;
  timer?: NodeJS.Timeout;
};
const globalState = globalThis as typeof globalThis & { memeState?: State };
const state: State = (globalState.memeState ??= { assets: new Map(), limits: new Map(), active: 0 });

export function session(request: Request) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)meme-session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token = cookie || randomBytes(32).toString('hex');
  return {
    owner: createHash('sha256').update(token).digest('hex'),
    cookie: cookie
      ? undefined
      : `meme-session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
  };
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // A Node adapter may normalize request.url to localhost even when a
  // browser visits 127.0.0.1. Host is the browser-visible authority; forwarded
  // headers are deliberately not trusted for this check.
  const expected = process.env.APP_ORIGIN;
  let matches = true;
  if (origin) {
    try {
      const parsed = new URL(origin);
      matches = expected
        ? parsed.origin === new URL(expected).origin
        : ['http:', 'https:'].includes(parsed.protocol) &&
          parsed.host === (request.headers.get('host') || new URL(request.url).host);
    } catch {
      matches = false;
    }
  }
  if (!matches || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new MediaError('error.origin', 403);
}
export function checkQuota(request: Request) {
  checkOrigin(request);
  const ip =
    process.env.TRUST_PROXY === '1'
      ? request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
      : 'local';
  const key = createHash('sha256').update(ip).digest('hex');
  const now = Date.now();
  for (const [k, v] of state.limits) if (now - v.time > 600000) state.limits.delete(k);
  const limit = state.limits.get(key) ?? { time: now, count: 0 };
  if (limit.count >= Number(process.env.RATE_LIMIT_MAX || 20)) throw new MediaError('error.rateLimit', 429);
  if (!state.limits.has(key) && state.limits.size >= 10000) throw new MediaError('error.busy', 429);
  limit.count++;
  state.limits.set(key, limit);
}
async function sweep() {
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  const now = Date.now();
  for (const asset of state.assets.values())
    if (now - asset.touched > ttl && !asset.busy) await dispose(asset);
  // Crash leftovers are isolated underneath the configured cache root.
  const retained = new Set([...state.assets.values()].map((a) => a.dir));
  for (const entry of await readdir(/* turbopackIgnore: true */ cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^meme-[a-zA-Z0-9]+$/.test(entry.name)) continue;
    const candidate = path.join(/* turbopackIgnore: true */ cacheRoot, entry.name);
    if (!retained.has(candidate) && now - (await stat(/* turbopackIgnore: true */ candidate)).mtimeMs > ttl)
      await rm(candidate, { recursive: true, force: true });
  }
}
export async function cleanup() {
  if (state.cleanup) return state.cleanup;
  state.cleanup = sweep().finally(() => {
    state.cleanup = undefined;
  });
  return state.cleanup;
}
state.timer ??= setInterval(() => {
  void cleanup().catch(() => {});
}, 60000);
state.timer.unref();
export async function createAsset(owner: string) {
  await cleanup();
  const dir = await mkdtemp(path.join(cacheRoot, 'meme-'));
  const asset: Asset = {
    id: randomBytes(24).toString('hex'),
    readToken: randomBytes(24).toString('hex'),
    owner,
    dir,
    file: path.join(dir, 'source'),
    created: Date.now(),
    touched: Date.now(),
    busy: 1,
  };
  state.assets.set(asset.id, asset);
  return asset;
}
export function findAsset(id: string, owner: string, readToken?: string): Asset {
  if (!/^[a-f0-9]{48}$/.test(id)) throw new MediaError('error.expired', 404);
  const asset = state.assets.get(id);
  const allowedRead =
    asset &&
    readToken &&
    /^[a-f0-9]{48}$/.test(readToken) &&
    timingSafeEqual(Buffer.from(readToken), Buffer.from(asset.readToken));
  if (
    !asset ||
    (asset.owner !== owner && !allowedRead) ||
    asset.deleting ||
    (!asset.busy && Date.now() - asset.touched > ttl)
  )
    throw new MediaError('error.expired', 404);
  asset.touched = Date.now();
  return asset;
}
// Native media stacks may omit cookies (notably Windows WebKit). A separate,
// unguessable, temporary read capability permits playback only, never mutation.
export function mediaUrl(asset: Asset, preview = false) {
  return `/api/media/${asset.id}?access=${asset.readToken}${preview ? '&preview=1' : ''}`;
}
export async function dispose(asset: Asset) {
  asset.deleting = true;
  if (asset.busy) return;
  state.assets.delete(asset.id);
  await rm(asset.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
export async function releaseAsset(asset: Asset) {
  asset.busy = Math.max(0, asset.busy - 1);
  if (asset.deleting) await dispose(asset);
}

export async function receiveMultipart(request: Request, dir: string, signal: AbortSignal) {
  if (!request.body) throw new MediaError('error.missingBody');
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data')) throw new MediaError('error.multipart');
  if (Number(request.headers.get('content-length') || 0) > maxBytes + 65536)
    throw new MediaError('error.fileSize', 413, { size: Math.round(maxBytes / 1024 ** 2) });
  const fields: Record<string, string> = {};
  let file: string | undefined;
  let size = 0;
  let fileError: unknown;
  const writes: Promise<void>[] = [];
  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({
      headers: { 'content-type': contentType },
      // Busboy emits limit when the threshold is reached, even at exact EOF.
      limits: { fileSize: maxBytes + 1, files: 1, fields: 13, fieldSize: 256, parts: 14 },
    });
  } catch {
    throw new MediaError('error.invalidForm');
  }
  parser.on('file', (name, stream, info) => {
    try {
      if (name !== 'file') throw new MediaError('error.fileField');
      validateFile(info.filename, info.mimeType, 1, maxBytes);
      file = path.join(dir, 'source');
      stream.on('data', (data: Buffer) => {
        size += data.length;
      });
      stream.on('limit', () => {
        fileError = new MediaError('error.fileSize', 413, { size: Math.round(maxBytes / 1024 ** 2) });
      });
      writes.push(
        pipeline(stream, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal }).catch((error) => {
          fileError ??= error;
        }),
      );
    } catch (error) {
      fileError = error;
      stream.resume();
    }
  });
  parser.on('field', (name, value, info) => {
    if (
      ![
        'uploadId',
        'startTime',
        'scale',
        'offsetX',
        'offsetY',
        'audioMode',
        'foldEffect',
        'openUploadId',
        'openStartTime',
        'openScale',
        'openOffsetX',
        'openOffsetY',
      ].includes(name) ||
      name in fields ||
      info.valueTruncated
    )
      fileError = new MediaError('error.invalidFields');
    else fields[name] = value;
  });
  for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const)
    parser.on(event, () => {
      fileError = new MediaError('error.oneFile');
    });
  let total = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _, callback) {
      total += chunk.length;
      callback(total > maxBytes + 65536 ? new MediaError('error.bodySize', 413) : null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(request.body as import('node:stream/web').ReadableStream),
      counter,
      parser,
      { signal },
    );
  } catch (error) {
    fileError ??= signal.aborted
      ? new MediaError('error.uploadCancelled', 499)
      : error instanceof MediaError
        ? error
        : new MediaError('error.uploadInterrupted');
  }
  await Promise.all(writes);
  if (fileError) throw fileError;
  if (file && !size) throw new MediaError('error.emptyFile');
  return { fields, file, size };
}
export function templatePath(file: 'template.json' | '8150.mp4' | 'preview.mp4') {
  return path.join(
    process.env.TEMPLATE_DIR || fileURLToPath(new URL('../../public/templates/', import.meta.url)),
    file,
  );
}
export async function loadTemplate(): Promise<Template> {
  try {
    return JSON.parse(await readFile(templatePath('template.json'), 'utf8'));
  } catch {
    throw new MediaError('error.templateMissing', 503);
  }
}
export function jsonError(error: unknown, request?: Request) {
  const known = error instanceof MediaError;
  return Response.json(errorPayload(error, resolveLocale(request?.headers.get(languageHeader))), {
    status: known ? error.status : 500,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export function streamTask(
  request: Request,
  cookie: string | undefined,
  task: (send: (data: Record<string, unknown>) => void, signal: AbortSignal) => Promise<void>,
) {
  const controller = new AbortController();
  let ended = false;
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const stream = new ReadableStream({
    async start(sink) {
      const send = (data: Record<string, unknown>) => {
        if (!ended && !controller.signal.aborted) {
          try {
            sink.enqueue(new TextEncoder().encode(JSON.stringify(data) + '\n'));
          } catch {
            controller.abort();
          }
        }
      };
      const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 2000);
      const timeout = setTimeout(
        () => {
          send({
            type: 'error',
            ...errorPayload(
              new MediaError('error.timeout', 504),
              resolveLocale(request.headers.get(languageHeader)),
            ),
          });
          controller.abort();
        },
        Number(process.env.REQUEST_TIMEOUT_MS || 240000),
      );
      try {
        await task(send, controller.signal);
      } catch (error) {
        send({
          type: 'error',
          ...errorPayload(error, resolveLocale(request.headers.get(languageHeader))),
        });
      } finally {
        clearInterval(timeout);
        clearInterval(heartbeat);
        request.signal.removeEventListener('abort', abort);
        if (!ended) {
          ended = true;
          try {
            sink.close();
          } catch {}
        }
      }
    },
    cancel() {
      ended = true;
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
}
export async function serveAsset(request: Request, id: string) {
  const asset = findAsset(
    id,
    session(request).owner,
    new URL(request.url).searchParams.get('access') || undefined,
  );
  const target = asset.preview || asset.file; // A preview capability never exposes the original upload.
  if (!target) throw new MediaError('error.previewPending', 404);
  const size = (await stat(target)).size;
  let start = 0;
  let end = size - 1;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(size - 1, Number(match[2]));
    }
    if (start > end || start >= size)
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  asset.busy++;
  const file = createReadStream(target, { start, end });
  const abort = () => file.destroy();
  request.signal.addEventListener('abort', abort, { once: true });
  file.once('close', () => {
    request.signal.removeEventListener('abort', abort);
    void releaseAsset(asset);
  });
  return new Response(Readable.toWeb(file) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      ...(new URL(request.url).searchParams.has('download')
        ? { 'Content-Disposition': 'attachment; filename="phone-meme.mp4"' }
        : {}),
    },
  });
}
export async function saveFilter(dir: string, filter: string) {
  const target = path.join(dir, 'filter.txt');
  await writeFile(target, filter);
  return target;
}
