import { preparePreview } from '../../src/lib/preview-segment';
import { probe } from '../../src/lib/process';
import { MediaError } from '../../src/lib/composition';
import {
  checkQuota,
  createAsset,
  dispose,
  jsonError,
  mediaUrl,
  receiveMultipart,
  releaseAsset,
  session,
  streamTask,
} from '../../src/lib/server';
import { localQueue, waitForSlot } from '../../src/lib/work-queue';
export async function POST(request: Request, quotaAlreadyAcquired = false) {
  try {
    if (!quotaAlreadyAcquired) checkQuota(request);
    const auth = session(request);
    return streamTask(request, auth.cookie, async (send, signal) => {
      const release = quotaAlreadyAcquired
        ? async () => {}
        : await waitForSlot(localQueue, signal, (position) =>
            send({ type: 'progress', stage: 'queued', position }),
          );
      let asset;
      try {
        asset = await createAsset(auth.owner);
        const upload = await receiveMultipart(request, asset.dir, signal);
        if (!upload.file) throw new MediaError('error.chooseFile');
        send({ type: 'progress', stage: 'processing', progress: 5 });
        asset.info = await probe(upload.file, signal);
        asset.size = upload.size;
        const segment = await preparePreview(asset, 0, signal, (progress) =>
          send({ type: 'progress', stage: 'processing', progress }),
        );
        send({
          type: 'complete',
          uploadId: asset.id,
          info: asset.info,
          size: asset.size,
          previewUrl: `${mediaUrl(asset, true)}&segment=${segment.key}`,
          previewStartTime: segment.startTime,
          previewDuration: segment.duration,
        });
      } catch (error) {
        if (asset) await dispose(asset);
        throw error;
      } finally {
        try {
          if (asset) {
            if (signal.aborted) await dispose(asset);
            await releaseAsset(asset);
          }
        } finally {
          await release();
        }
      }
    });
  } catch (error) {
    return jsonError(error, request);
  }
}
