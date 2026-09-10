import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { templatePath, jsonError } from '../src/lib/server';

// Modern's Node static response omits byte ranges and Content-Length. Chromium
// then reports a zero-length seekable range even after buffering the whole clip.
export async function serveTemplatePreview(request: Request) {
  try {
    const file = templatePath('preview.mp4');
    const { size } = await stat(file);
    const range = request.headers.get('range');
    let start = 0,
      end = size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return unsatisfiable(size);
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
        return unsatisfiable(size);
    }
    const headers = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Cache-Control': 'public, max-age=86400, no-transform',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    };
    if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
    const stream = createReadStream(file, { start, end });
    const abort = () => stream.destroy();
    request.signal.addEventListener('abort', abort, { once: true });
    stream.once('close', () => request.signal.removeEventListener('abort', abort));
    if (request.signal.aborted) abort();
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    return jsonError(error, request);
  }
}
function unsatisfiable(size: number) {
  return new Response(null, {
    status: 416,
    headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
  });
}
