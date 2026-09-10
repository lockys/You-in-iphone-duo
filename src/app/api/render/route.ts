import path from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { buildRenderSpec, MediaError, parseOptions } from '@/lib/composition';
import { binary, probe, runProcess } from '@/lib/process';
import {
  acquire,
  createAsset,
  dispose,
  findAsset,
  jsonError,
  loadTemplate,
  mediaUrl,
  receiveMultipart,
  releaseAsset,
  session,
  streamTask,
  type Asset,
} from '@/lib/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    release = acquire(request);
    const auth = session(request);
    const template = await loadTemplate();
    const result = await createAsset(auth.owner);
    return streamTask(request, auth.cookie, async (send, signal) => {
      let source: Asset | undefined;
      try {
        const upload = await receiveMultipart(request, result.dir, signal);
        const options = parseOptions(upload.fields);
        if (upload.file && upload.fields.uploadId) throw new MediaError('error.oneSource');
        send({ type: 'progress', stage: 'processing', progress: 5 });
        let input = upload.file;
        let info;
        if (upload.fields.uploadId) {
          source = findAsset(upload.fields.uploadId, auth.owner);
          source.busy++;
          input = source.file;
          info = source.info;
        }
        if (!input) throw new MediaError('error.uploadFirst');
        info ??= await probe(input, signal);
        const output = path.join(result.dir, 'result.mp4');
        const filter = path.join(result.dir, 'filter.txt');
        const spec = buildRenderSpec(
          info,
          template,
          options,
          input,
          path.resolve('public/templates/8150.mp4'),
          output,
          filter,
        );
        await writeFile(filter, spec.filter);
        send({ type: 'progress', stage: 'compositing', progress: 10 });
        await runProcess(binary('ffmpeg'), spec.args, {
          signal,
          onProgress: (seconds) =>
            send({
              type: 'progress',
              stage: 'compositing',
              progress: Math.min(97, 10 + (85 * seconds) / template.duration),
            }),
        });
        // The downloadable artifact alone remains; raw upload and filter intermediates are removed.
        if (upload.file) await rm(upload.file, { force: true });
        await rm(filter, { force: true });
        result.file = output;
        result.info = await probe(output, signal);
        send({ type: 'complete', resultId: result.id, url: mediaUrl(result), info: result.info });
      } catch (error) {
        await dispose(result);
        throw error;
      } finally {
        if (signal.aborted) await dispose(result);
        if (source) await releaseAsset(source);
        await releaseAsset(result);
        release?.();
      }
    });
  } catch (error) {
    release?.();
    return jsonError(error, request);
  }
}
