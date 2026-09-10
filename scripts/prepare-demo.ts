import { binary, runProcess } from '../src/lib/process';

// Precompose the empty editor view once, avoiding per-frame Canvas work on phones.
await runProcess(binary('ffmpeg'), [
  '-v',
  'error',
  '-y',
  '-i',
  'public/templates/preview.mp4',
  '-filter_complex',
  'color=c=0xf1edff:s=768x432:r=30000/1001[base];[0:v]scale=768:432,chromakey=0x00ff00:0.12:0.06,despill=green[phone];[base][phone]overlay=shortest=1[out]',
  '-map',
  '[out]',
  '-an',
  '-c:v',
  'libx264',
  '-preset',
  'fast',
  '-crf',
  '23',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  'public/templates/demo.mp4',
]);
await runProcess(binary('ffmpeg'), [
  '-v',
  'error',
  '-y',
  '-i',
  'public/templates/demo.mp4',
  '-frames:v',
  '1',
  '-q:v',
  '3',
  'public/templates/demo-poster.jpg',
]);
