import path from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { buildRenderSpec, MediaError, parseOptions, parseSecondOptions } from '../../src/lib/composition';
import { binary, probe, runProcess } from '../../src/lib/process';
import {
  checkQuota,
  createAsset,
  dispose,
  findAsset,
  jsonError,
  loadTemplate,
  templatePath,
  mediaUrl,
  receiveMultipart,
  releaseAsset,
  session,
  streamTask,
  type Asset,
} from '../../src/lib/server';
import { localQueue, waitForSlot } from '../../src/lib/work-queue';
export async function POST(request: Request, quotaAlreadyAcquired = false) {
  try {
    if (!quotaAlreadyAcquired) checkQuota(request);
    const auth = session(request);
    const template = await loadTemplate();
    return streamTask(request, auth.cookie, async (send, signal) => {
      const release = quotaAlreadyAcquired
        ? async () => {}
        : await waitForSlot(localQueue, signal, (position) =>
            send({ type: 'progress', stage: 'queued', position }),
          );
      let source: Asset | undefined;
      let openSource: Asset | undefined;
      let result: Asset | undefined;
      try {
        result = await createAsset(auth.owner);
        const upload = await receiveMultipart(request, result.dir, signal);
        const options = parseOptions(upload.fields);
        const openOptions = parseSecondOptions(upload.fields, options);
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
        if (upload.fields.openUploadId) {
          openSource = findAsset(upload.fields.openUploadId, auth.owner);
          openSource.busy++;
          if (!openSource.info) throw new MediaError('error.uploadFirst');
        }
        const output = path.join(result.dir, 'result.mp4');
        const filter = path.join(result.dir, 'filter.txt');
        const spec = buildRenderSpec(
          info,
          template,
          options,
          input,
          templatePath('8150.mp4'),
          output,
          filter,
          openSource ? { file: openSource.file, info: openSource.info!, options: openOptions } : undefined,
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
        if (result) await dispose(result);
        throw error;
      } finally {
        try {
          if (result && signal.aborted) await dispose(result);
          if (source) await releaseAsset(source);
          if (openSource) await releaseAsset(openSource);
          if (result) await releaseAsset(result);
        } finally {
          await release();
        }
      }
    });
  } catch (error) {
    return jsonError(error, request);
  }
}
