import { z } from 'zod';
import { MediaError } from './errors';
import { foldProjection, FOLD_BLUR } from './fold-effect';
export { MediaError } from './errors';

export type Rect = { x: number; y: number; width: number; height: number };
export type MediaInfo = {
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasAudio: boolean;
  codec: string;
  rotation: number;
  hdr: boolean;
};
export type Template = {
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasAudio: boolean;
  frames: Rect[];
  similarity: number;
  blend: number;
  keyColor: string;
};
export const optionsSchema = z.object({
  startTime: z.coerce.number().finite().min(0).default(0),
  scale: z.coerce.number().finite().min(1).max(3).default(1),
  offsetX: z.coerce.number().finite().min(-1).max(1).default(0),
  offsetY: z.coerce.number().finite().min(-1).max(1).default(0),
  audioMode: z.enum(['template', 'user', 'mute']).default('template'),
  foldEffect: z.enum(['on', 'off']).default('on'),
});
export type EditOptions = z.infer<typeof optionsSchema>;
export const defaultOptions: EditOptions = {
  startTime: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  audioMode: 'template',
  foldEffect: 'on',
};
export function parseOptions(fields: Record<string, unknown>): EditOptions {
  const parsed = optionsSchema.safeParse(fields);
  if (!parsed.success) throw new MediaError('error.invalidOptions');
  return parsed.data;
}
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 2;
export function validateDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) throw new MediaError('error.unreadable');
}
export function uploadLimit(megabytes?: string) {
  const configured = Number(megabytes);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(MAX_UPLOAD_BYTES, Math.floor(configured * 1024 ** 2))
    : MAX_UPLOAD_BYTES;
}
export function validateFile(name: string, mime: string, size: number, maxBytes = MAX_UPLOAD_BYTES) {
  if (
    !/\.(mp4|mov|webm|m4v)$/i.test(name) ||
    !['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'application/octet-stream'].includes(
      mime.toLowerCase(),
    )
  )
    throw new MediaError('error.fileType');
  if (size <= 0) throw new MediaError('error.emptyFile');
  if (size > maxBytes)
    throw new MediaError('error.fileSize', 413, { size: Math.round(maxBytes / 1024 ** 2) });
}
type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  sample_aspect_ratio?: string;
  color_transfer?: string;
  disposition?: { attached_pic?: number };
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
};
export function parseProbe(probe: {
  streams?: ProbeStream[];
  format?: { duration?: string; format_name?: string };
}): MediaInfo {
  const video = probe.streams?.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const duration = Number(probe.format?.duration ?? video?.duration);
  const width = Number(video?.width);
  const height = Number(video?.height);
  if (!video || !Number.isFinite(duration) || duration <= 0 || !width || !height)
    throw new MediaError('error.unreadable');
  if (width * height > 4096 * 2160 || width > 4096 || height > 4096) throw new MediaError('error.resolution');
  const rotation =
    ((Number(
      video.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0,
    ) %
      360) +
      360) %
    360;
  const [a, b] = (video.avg_frame_rate ?? '30/1').split('/').map(Number);
  const [sn, sd] = (video.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const displayWidth = Math.round(width * (sn > 0 && sd > 0 ? sn / sd : 1));
  return {
    width: rotation === 90 || rotation === 270 ? height : displayWidth,
    height: rotation === 90 || rotation === 270 ? displayWidth : height,
    duration,
    rotation,
    fps: a / b || 30,
    codec: video.codec_name ?? '',
    hasAudio: !!probe.streams?.some((s) => s.codec_type === 'audio'),
    hdr: ['smpte2084', 'arib-std-b67'].includes(video.color_transfer ?? ''),
  };
}
export function cover(media: Pick<MediaInfo, 'width' | 'height'>, rect: Rect, options: EditOptions): Rect {
  const factor = Math.max(rect.width / media.width, rect.height / media.height) * options.scale;
  const width = Math.ceil((media.width * factor) / 2) * 2;
  const height = Math.round((width * media.height) / media.width / 2) * 2;
  return {
    width,
    height,
    x: rect.x + ((rect.width - width) / 2) * (1 - options.offsetX),
    y: rect.y + ((rect.height - height) / 2) * (1 - options.offsetY),
  };
}
export function frameAt(template: Template, time: number): Rect {
  return template.frames[Math.min(template.frames.length - 1, Math.max(0, Math.floor(time * template.fps)))];
}
export function contentFrame(template: Template, time: number, options: EditOptions): Rect {
  const rect = frameAt(template, time);
  return options.foldEffect === 'on' ? foldProjection(template, rect) : rect;
}
// Piecewise linear expressions use the same per-frame tracking table as Canvas.
// Store expressions in a private file to avoid the Windows command-line length limit.
function expression(values: number[]) {
  const points: { n: number; value: number }[] = [];
  for (let n = 0; n < values.length; n += 3) points.push({ n, value: values[n] });
  if (points.at(-1)?.n !== values.length - 1) points.push({ n: values.length - 1, value: values.at(-1)! });
  let result = String(points.at(-1)!.value);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    result = `if(lt(n,${b.n}),${a.value}+(${b.value - a.value})*(n-${a.n})/${b.n - a.n},${result})`;
  }
  return result;
}
function foldFilter(template: Template) {
  // Keep original pixels while limiting effect buffers to the screen's envelope.
  const left = Math.max(0, Math.floor((Math.min(...template.frames.map((r) => r.x)) - 16) / 2) * 2);
  const top = Math.max(0, Math.floor((Math.min(...template.frames.map((r) => r.y)) - 16) / 2) * 2);
  const right = Math.min(
    template.width,
    Math.ceil((Math.max(...template.frames.map((r) => r.x + r.width)) + 16) / 2) * 2,
  );
  const bottom = Math.min(
    template.height,
    Math.ceil((Math.max(...template.frames.map((r) => r.y + r.height)) + 16) / 2) * 2,
  );
  const width = right - left,
    height = bottom - top;
  const masks = [0, 2]
    .map(
      (i) =>
        `[masksrc${i}]${i === 2 ? 'negate,' : ''}crop=${width}:2:${left}:0,scale=${width}:${height}:flags=neighbor,format=gbrp[foldmask${i}];\n`,
    )
    .join('');
  return (
    `[2:v:0]setpts=PTS-STARTPTS,fps=${template.fps},format=gbrp,extractplanes=r+b[masksrc0][masksrc2];\n` +
    masks +
    `[projected]crop=${width}:${height}:${left}:${top},format=gbrp,split=2[sharp][softsrc];\n` +
    `[softsrc]gblur=sigma=${FOLD_BLUR}:steps=3[soft];\n` +
    `[sharp][soft][foldmask0]maskedmerge[blurred];\n` +
    `[blurred][foldmask2]blend=all_mode=multiply,pad=${template.width}:${template.height}:${left}:${top},format=rgba[content];\n`
  );
}
export function buildRenderSpec(
  media: MediaInfo,
  template: Template,
  options: EditOptions,
  input: string,
  templatePath: string,
  output: string,
  filterPath: string,
) {
  validateDuration(media.duration);
  options = parseOptions(options);
  if (options.startTime >= media.duration) throw new MediaError('error.startTime');
  const transforms = template.frames.map((rect) =>
    cover(media, options.foldEffect === 'on' ? foldProjection(template, rect) : rect, options),
  );
  const coordinate = (values: number[]) => expression(values.map((v) => Math.round(v))).replaceAll('n', 'on');
  const x = coordinate(transforms.map((t) => t.x));
  const y = coordinate(transforms.map((t) => t.y));
  const right = coordinate(transforms.map((t) => t.x + t.width));
  const bottom = coordinate(transforms.map((t) => t.y + t.height));
  const fps = template.fps;
  // FFmpeg autorotation runs before these filters; force square pixels for anamorphic input.
  const tone = media.hdr
    ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,'
    : '';
  // Fixed-size frames avoid overlay retaining stale dimensions during the unfolding.
  // The two transforms cancel the intermediate aspect change: final content retains
  // its original aspect ratio and is positioned using the shared cover geometry.
  let filter =
    `[0:v:0]setpts=PTS-STARTPTS,${tone}fps=${fps},scale=${template.width}:${template.height},setsar=1,perspective=x0='${x}':y0='${y}':x1='${right}':y1='${y}':x2='${x}':y2='${bottom}':x3='${right}':y3='${bottom}':sense=destination:eval=frame:interpolation=linear,format=rgba[${options.foldEffect === 'on' ? 'projected' : 'content'}];\n` +
    (options.foldEffect === 'on' ? foldFilter(template) : '') +
    `color=c=white:s=${template.width}x${template.height}:r=${fps}:d=${template.duration}[base];\n` +
    `[base][content]overlay=0:0:shortest=1[screen];\n` +
    `[1:v:0]setpts=PTS-STARTPTS,fps=${fps},tpad=stop_mode=clone:stop_duration=0.1,format=rgba,colorkey=${template.keyColor}:${template.similarity}:${template.blend},despill=type=green[phone];\n` +
    `[screen][phone]overlay=0:0:shortest=1,format=yuv420p[out]`;
  const audioInput =
    options.audioMode === 'template' && template.hasAudio
      ? 1
      : options.audioMode === 'user' && media.hasAudio
        ? 0
        : null;
  if (audioInput !== null)
    filter += `;\n[${audioInput}:a:0]asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0,apad,atrim=duration=${template.duration}[audio]`;
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-filter_complex_threads',
    '2',
    '-threads',
    '2',
    '-stream_loop',
    '-1',
    '-ss',
    String(options.startTime),
    // Bound input decoding too; output -t alone can leave high-resolution frames queued.
    '-t',
    String(template.duration),
    '-protocol_whitelist',
    'file,pipe',
    '-format_whitelist',
    'mov,matroska,webm',
    '-i',
    input,
    '-threads',
    '2',
    '-i',
    templatePath,
    ...(options.foldEffect === 'on'
      ? ['-threads', '1', '-i', templatePath.replace(/[^\\/]+$/, 'fold-mask.mkv')]
      : []),
    '-filter_complex_script',
    filterPath,
    '-map',
    '[out]',
  ];
  args.push(
    ...(audioInput === null
      ? ['-an']
      : ['-map', '[audio]', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2']),
  );
  args.push(
    '-t',
    String(template.duration),
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-preset',
    'veryfast',
    // Avoid x264 retaining lookahead frames alongside the RGBA compositing buffers.
    '-tune',
    'zerolatency',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-map_metadata',
    '-1',
    '-progress',
    'pipe:1',
    '-nostats',
    output,
  );
  return { args, filter };
}
