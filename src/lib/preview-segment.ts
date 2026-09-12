import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { MediaError, type MediaInfo } from './composition';
import { binary, runProcess } from './process';
import { loadTemplate, type Asset } from './server';

export type PreviewSegment = { key: string; startTime: number; duration: number; file: string };
export function previewStart(value: unknown, info: MediaInfo) {
  const start = Number(value ?? 0);
  if (!Number.isFinite(start) || start < 0 || start >= info.duration)
    throw new MediaError('error.invalidFields', 400);
  return start;
}
export function previewKey(start: number) {
  return createHash('sha256').update(`segment-v1:${start}`).digest('hex').slice(0, 24);
}
export function previewArgs(info: MediaInfo, input: string, output: string, start: number, duration: number) {
  const tone = info.hdr
    ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,'
    : '';
  return [
    '-v',
    'error',
    '-y',
    '-threads',
    '2',
    '-stream_loop',
    '-1',
    '-ss',
    String(start),
    '-t',
    String(duration),
    '-protocol_whitelist',
    'file,pipe',
    '-format_whitelist',
    'mov,matroska,webm',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-vf',
    `${tone}scale=${info.width}:${info.height},setsar=1,scale=w='min(960,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30`,
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
    '-t',
    String(duration),
    '-movflags',
    '+faststart',
    '-map_metadata',
    '-1',
    '-progress',
    'pipe:1',
    output,
  ];
}
export async function preparePreview(
  asset: Asset,
  start: number,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  if (!asset.info) throw new MediaError('error.uploadFirst');
  start = previewStart(start, asset.info);
  const key = previewKey(start);
  const cached = asset.segments?.find((item) => item.key === key);
  if (cached) return cached;
  const duration = (await loadTemplate()).duration;
  const file = path.join(asset.dir, `preview-${randomUUID()}.mp4`);
  try {
    await runProcess(binary('ffmpeg'), previewArgs(asset.info, asset.file, file, start, duration), {
      signal,
      onProgress: (seconds) => progress(Math.min(98, 5 + (90 * seconds) / duration)),
    });
    signal.throwIfAborted();
    if (asset.deleting) throw new MediaError('error.expired', 404);
    // Only publish complete files. Requests for the same key may finish together.
    const duplicate = asset.segments?.find((item) => item.key === key);
    if (duplicate) {
      await rm(file, { force: true });
      return duplicate;
    }
    const segment = { key, startTime: start, duration, file };
    asset.segments = [...(asset.segments || []), segment];
    const evicted = asset.segments.splice(0, Math.max(0, asset.segments.length - 4));
    asset.preview = file;
    await Promise.all(evicted.map((item) => rm(item.file, { force: true }).catch(() => {})));
    return segment;
  } catch (error) {
    await rm(file, { force: true }).catch(() => {});
    throw error;
  }
}
