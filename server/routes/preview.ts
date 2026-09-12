import {
  checkQuota,
  findAsset,
  jsonError,
  mediaUrl,
  releaseAsset,
  session,
  streamTask,
} from '../../src/lib/server';
import { MediaError } from '../../src/lib/composition';
import { preparePreview, previewStart } from '../../src/lib/preview-segment';
import { localQueue, waitForSlot } from '../../src/lib/work-queue';

export async function POST(request: Request) {
  try {
    checkQuota(request);
    const auth = session(request);
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
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type') || '' },
    })
      .formData()
      .catch(() => {
        throw new MediaError('error.invalidForm');
      });
    if (
      [...form].some(
        ([key, value]) =>
          !['uploadId', 'startTime'].includes(key) ||
          typeof value !== 'string' ||
          form.getAll(key).length !== 1,
      )
    )
      throw new MediaError('error.invalidFields');
    return streamTask(request, auth.cookie, async (send, signal) => {
      let source;
      let release: (() => Promise<void>) | undefined;
      try {
        source = findAsset(String(form.get('uploadId')), auth.owner);
        source.busy++;
        if (!source.info) throw new MediaError('error.uploadFirst');
        const start = previewStart(form.get('startTime'), source.info);
        release = await waitForSlot(localQueue, signal, (position) =>
          send({ type: 'progress', stage: 'queued', position }),
        );
        send({ type: 'progress', stage: 'processing', progress: 5 });
        const segment = await preparePreview(source, start, signal, (progress) =>
          send({ type: 'progress', stage: 'processing', progress }),
        );
        send({
          type: 'complete',
          uploadId: source.id,
          previewUrl: `${mediaUrl(source, true)}&segment=${segment.key}`,
          previewStartTime: segment.startTime,
          previewDuration: segment.duration,
        });
      } finally {
        try {
          if (source) await releaseAsset(source);
        } finally {
          await release?.();
        }
      }
    });
  } catch (error) {
    return jsonError(error, request);
  }
}
