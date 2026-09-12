import path from 'node:path';
import { binary, probe, runProcess } from '../../src/lib/process';
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
        asset.preview = path.join(asset.dir, 'preview.mp4');
        const tone = asset.info.hdr
          ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,'
          : '';
        await runProcess(
          binary('ffmpeg'),
          [
            '-v',
            'error',
            '-y',
            '-threads',
            '2',
            '-protocol_whitelist',
            'file,pipe',
            '-i',
            asset.file,
            '-map',
            '0:v:0',
            '-vf',
            `${tone}scale=${asset.info.width}:${asset.info.height},setsar=1,scale=w='min(960,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30`,
            '-an',
            '-c:v',
            'libx264',
            '-threads',
            '2',
            '-preset',
            'ultrafast',
            '-crf',
            '26',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            '-map_metadata',
            '-1',
            '-progress',
            'pipe:1',
            asset.preview,
          ],
          {
            signal,
            onProgress: (seconds) =>
              send({
                type: 'progress',
                stage: 'processing',
                progress: Math.min(98, 5 + (90 * seconds) / asset!.info!.duration),
              }),
          },
        );
        send({
          type: 'complete',
          uploadId: asset.id,
          info: asset.info,
          size: asset.size,
          previewUrl: mediaUrl(asset, true),
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
