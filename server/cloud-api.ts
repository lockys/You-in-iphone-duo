import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as blob from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { errorFromResponse, MediaError } from '../src/lib/errors';
import { validateFile } from '../src/lib/composition';
import {
  checkOrigin,
  createAsset,
  dispose,
  findAsset,
  jsonError,
  loadTemplate,
  maxBytes,
  releaseAsset,
  session,
  streamTask,
  type Asset,
} from '../src/lib/server';
import { POST as localUpload } from './routes/upload';
import { POST as localRender } from './routes/render';
import {
  acquireCloud,
  checkCloudRate,
  assertCloud,
  assetKey,
  cloudMediaUrl,
  cloudReadUrl,
  eraseCloudAsset,
  getCloudAsset,
  newCloudAsset,
  sweepCloud,
  updateCloudAsset,
  type CloudAsset,
} from './cloud-store';

type Send = (event: Record<string, unknown>) => void;
async function smallBody(request: Request) {
  if (!request.body) throw new MediaError('error.missingBody');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) throw new MediaError('error.invalidForm');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function fields(request: Request) {
  const text = await smallBody(request);
  const form = await new Response(text, {
    headers: { 'content-type': request.headers.get('content-type') || '' },
  })
    .formData()
    .catch(() => {
      throw new MediaError('error.invalidForm');
    });
  if ([...form.values()].some((value) => typeof value !== 'string'))
    throw new MediaError('error.invalidFields');
  return form;
}
async function jsonBody(request: Request) {
  const text = await smallBody(request);
  try {
    return JSON.parse(text);
  } catch {
    throw new MediaError('error.invalidForm');
  }
}
function bridge(
  request: Request,
  endpoint: string,
  body: BodyInit,
  signal: AbortSignal,
  contentType?: string,
) {
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.delete('content-type');
  if (contentType) headers.set('content-type', contentType);
  return new Request(new URL(endpoint, request.url), {
    method: 'POST',
    headers,
    body,
    signal,
    duplex: 'half',
  } as RequestInit);
}
async function consume(response: Response, send: Send) {
  if (!response.ok) throw errorFromResponse(await response.json());
  if (!response.body) throw new MediaError('error.incomplete');
  let pending = '';
  const decoder = new TextDecoder();
  let complete: Record<string, unknown> | undefined;
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'error') throw errorFromResponse(event);
      if (event.type === 'complete') complete = event;
      else send(event);
    }
  }
  if (!complete) throw new MediaError('error.incomplete');
  return complete;
}
async function original(asset: CloudAsset, signal: AbortSignal) {
  const result = await blob.get(assetKey(asset.id, 'source'), {
    access: 'private',
    useCache: false,
    abortSignal: signal,
  });
  if (!result || result.statusCode !== 200) throw new MediaError('error.expired', 404);
  validateFile(`source.${asset.extension}`, asset.mime, result.blob.size, maxBytes);
  if (result.blob.size !== asset.size) throw new MediaError('error.invalidForm');
  return result.stream;
}
async function publishFile(
  asset: CloudAsset,
  part: 'preview.mp4' | 'result.mp4',
  file: string,
  signal: AbortSignal,
) {
  await blob.put(assetKey(asset.id, part), createReadStream(file), {
    access: 'private',
    contentType: 'video/mp4',
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    multipart: true,
    abortSignal: signal,
  });
}
async function removeIfPresent(asset: CloudAsset) {
  try {
    const current = await getCloudAsset(asset.id, asset.owner);
    await eraseCloudAsset(current.value, current.etag);
  } catch {}
}

async function ticket(request: Request) {
  checkOrigin(request);
  assertCloud();
  await checkCloudRate(request);
  const input = await jsonBody(request);
  if (!input || typeof input !== 'object') throw new MediaError('error.invalidForm');
  if (typeof input.name !== 'string' || typeof input.mime !== 'string' || typeof input.size !== 'number')
    throw new MediaError('error.invalidForm');
  validateFile(input.name, input.mime, input.size, maxBytes);
  const auth = session(request);
  const asset = await newCloudAsset(auth.owner, {
    kind: 'source',
    size: input.size,
    mime: input.mime,
    extension: input.name.split('.').at(-1)!.toLowerCase(),
  });
  return Response.json(
    { id: asset.id, pathname: assetKey(asset.id, 'source') },
    {
      headers: {
        ...(auth.cookie ? { 'Set-Cookie': auth.cookie } : {}),
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
async function signUpload(request: Request) {
  checkOrigin(request);
  assertCloud();
  if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY) throw new MediaError('error.cloudStorage', 503);
  const body = (await jsonBody(request)) as HandleUploadPresignedBody;
  if (
    !body ||
    body.type !== 'blob.generate-presigned-url' ||
    !body.payload ||
    typeof body.payload.pathname !== 'string'
  )
    throw new MediaError('error.invalidForm');
  const result = await handleUploadPresigned({
    body,
    request,
    getSignedToken: async (pathname, clientPayload) => {
      const { value: asset } = await getCloudAsset(String(clientPayload), session(request).owner);
      if (asset.status !== 'pending' || asset.kind !== 'source' || pathname !== assetKey(asset.id, 'source'))
        throw new MediaError('error.invalidFields');
      return {
        token: await blob.issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: [asset.mime],
          maximumSizeInBytes: asset.size,
          validUntil: Math.min(asset.expires, Date.now() + 300000),
        }),
        urlOptions: { allowOverwrite: false, addRandomSuffix: false, cacheControlMaxAge: 60 },
      };
    },
  });
  return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function upload(request: Request) {
  checkOrigin(request);
  assertCloud();
  const form = await fields(request);
  const auth = session(request);
  const found = await getCloudAsset(String(form.get('cloudId')), auth.owner);
  if (found.value.kind !== 'source' || found.value.status !== 'pending')
    throw new MediaError('error.busy', 409);
  const claimed = await updateCloudAsset({ ...found.value, status: 'processing' }, found.etag);
  const asset = found.value;
  return streamTask(request, auth.cookie, async (send, signal) => {
    let local: Asset | undefined;
    let release: (() => Promise<void>) | undefined;
    try {
      release = await acquireCloud(request, signal, (position) =>
        send({ type: 'progress', stage: 'queued', position }),
      );
      const source = await original(asset, signal);
      const boundary = `meme-${randomBytes(12).toString('hex')}`;
      async function* multipart() {
        yield Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="source.${asset.extension}"\r\nContent-Type: ${asset.mime}\r\n\r\n`,
        );
        for await (const chunk of source) yield chunk;
        yield Buffer.from(`\r\n--${boundary}--\r\n`);
      }
      const done = await consume(
        await localUpload(
          bridge(
            request,
            '/api/upload',
            Readable.toWeb(Readable.from(multipart())) as ReadableStream,
            signal,
            `multipart/form-data; boundary=${boundary}`,
          ),
          true,
        ),
        send,
      );
      local = findAsset(String(done.uploadId), auth.owner);
      await publishFile(asset, 'preview.mp4', local.preview!, signal);
      const ready: CloudAsset = { ...asset, status: 'ready', info: local.info };
      await updateCloudAsset(ready, claimed.etag);
      send({
        type: 'complete',
        uploadId: asset.id,
        info: local.info,
        size: asset.size,
        previewUrl: cloudMediaUrl(ready),
      });
    } catch (error) {
      await removeIfPresent(asset);
      await blob.del(assetKey(asset.id, 'preview.mp4')).catch(() => {});
      throw error;
    } finally {
      try {
        if (local) await dispose(local);
      } finally {
        await release?.();
      }
    }
  });
}
async function render(request: Request) {
  checkOrigin(request);
  assertCloud();
  const form = await fields(request);
  const auth = session(request);
  const { value: source } = await getCloudAsset(String(form.get('uploadId')), auth.owner);
  if (source.kind !== 'source' || source.status !== 'ready' || !source.info)
    throw new MediaError('error.uploadFirst');
  const openSource = form.get('openUploadId')
    ? (await getCloudAsset(String(form.get('openUploadId')), auth.owner)).value
    : undefined;
  if (openSource && (openSource.kind !== 'source' || openSource.status !== 'ready' || !openSource.info))
    throw new MediaError('error.uploadFirst');
  return streamTask(request, auth.cookie, async (send, signal) => {
    let local: Asset | undefined;
    let openLocal: Asset | undefined;
    let output: Asset | undefined;
    let result: CloudAsset | undefined;
    let release: (() => Promise<void>) | undefined;
    try {
      release = await acquireCloud(request, signal, (position) =>
        send({ type: 'progress', stage: 'queued', position }),
      );
      local = await createAsset(auth.owner);
      local.info = source.info;
      send({ type: 'progress', stage: 'processing', progress: 3 });
      await pipeline(
        Readable.fromWeb((await original(source, signal)) as import('node:stream/web').ReadableStream),
        createWriteStream(local.file, { flags: 'wx', mode: 0o600 }),
        { signal },
      );
      form.set('uploadId', local.id);
      if (openSource) {
        openLocal = await createAsset(auth.owner);
        openLocal.info = openSource.info;
        await pipeline(
          Readable.fromWeb((await original(openSource, signal)) as import('node:stream/web').ReadableStream),
          createWriteStream(openLocal.file, { flags: 'wx', mode: 0o600 }),
          { signal },
        );
        form.set('openUploadId', openLocal.id);
      }
      const done = await consume(await localRender(bridge(request, '/api/render', form, signal), true), send);
      output = findAsset(String(done.resultId), auth.owner);
      await getCloudAsset(source.id, auth.owner); // A deleted source must not publish a new result.
      if (openSource) await getCloudAsset(openSource.id, auth.owner);
      result = await newCloudAsset(auth.owner, {
        kind: 'result',
        size: 0,
        mime: 'video/mp4',
        extension: 'mp4',
      });
      const manifest = await getCloudAsset(result.id, auth.owner);
      await publishFile(result, 'result.mp4', output.file, signal);
      result = { ...result, status: 'ready', info: output.info };
      await updateCloudAsset(result, manifest.etag);
      send({ type: 'complete', resultId: result.id, url: cloudMediaUrl(result), info: output.info });
    } catch (error) {
      if (result) await removeIfPresent(result);
      throw error;
    } finally {
      try {
        if (output) await dispose(output);
        if (openLocal) {
          await dispose(openLocal);
          await releaseAsset(openLocal);
        }
        if (local) {
          await dispose(local);
          await releaseAsset(local);
        }
      } finally {
        await release?.();
      }
    }
  });
}

export async function routeCloudApi(request: Request): Promise<Response> {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/template' && request.method === 'GET') {
      const auth = session(request);
      return Response.json(
        { template: await loadTemplate(), maxBytes, maxDuration: null, storage: 'blob' },
        {
          headers: {
            'Cache-Control': 'private, no-store',
            ...(auth.cookie ? { 'Set-Cookie': auth.cookie } : {}),
          },
        },
      );
    }
    if (pathname === '/api/blob-ticket' && request.method === 'POST') return await ticket(request);
    if (pathname === '/api/blob-upload' && request.method === 'POST') return await signUpload(request);
    if (pathname === '/api/upload' && request.method === 'POST') return await upload(request);
    if (pathname === '/api/render' && request.method === 'POST') return await render(request);
    if (pathname === '/api/cleanup' && request.method === 'GET') {
      if (
        !process.env.CRON_SECRET ||
        request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      )
        return new Response(null, { status: 401 });
      return Response.json(
        { removed: await sweepCloud() },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    const match = /^\/api\/media\/([^/]+)$/.exec(pathname);
    if (match && ['GET', 'DELETE'].includes(request.method)) {
      assertCloud();
      const { value: asset, etag } = await getCloudAsset(
        match[1],
        session(request).owner,
        request.method === 'GET' ? new URL(request.url).searchParams.get('access') || undefined : undefined,
      );
      if (request.method === 'DELETE') {
        checkOrigin(request);
        await eraseCloudAsset(asset, etag);
        return new Response(null, { status: 204 });
      }
      if (asset.status !== 'ready') throw new MediaError('error.previewPending', 404);
      const { presignedUrl } = await cloudReadUrl(asset);
      const location = new URL(request.url).searchParams.has('download')
        ? blob.getDownloadUrl(presignedUrl)
        : presignedUrl;
      return new Response(null, {
        status: 307,
        headers: {
          Location: location,
          'Cache-Control': 'private, no-store',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    return new Response(null, { status: 404 });
  } catch (error) {
    return jsonError(error, request);
  }
}
