import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { binary } from '../src/lib/process';
import { foldState, foldWeights } from '../src/lib/fold-effect';
import type { Template } from '../src/lib/composition';

const template: Template = JSON.parse(await readFile('public/templates/template.json', 'utf8'));
// The red and blue lossless channels hold the blur and shadow masks.
// Repeated rows encode cheaply because the gradients are horizontal.
const maskHeight = 16; // FFV1 level 3 needs enough rows for its slices.
const child = spawn(
  binary('ffmpeg'),
  [
    '-v',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pixel_format',
    'rgb24',
    '-video_size',
    `${template.width}x${maskHeight}`,
    '-framerate',
    String(template.fps),
    '-i',
    'pipe:0',
    '-an',
    '-c:v',
    'ffv1',
    '-level',
    '3',
    '-pix_fmt',
    'bgr0',
    'public/templates/fold-mask.mkv',
  ],
  { windowsHide: true, stdio: ['pipe', 'ignore', 'inherit'] },
);
const completed = once(child, 'close');
for (let n = 0; n < template.frames.length; n++) {
  const state = foldState(template, template.frames[n], n / template.fps);
  const frame = Buffer.alloc(template.width * maskHeight * 3);
  for (let x = 0; x < template.width; x++) {
    const w = foldWeights(state, x);
    for (let y = 0; y < maskHeight; y++) {
      const i = (y * template.width + x) * 3;
      frame[i] = Math.round(w.blur * 255);
      frame[i + 1] = 0;
      frame[i + 2] = Math.round(w.shade * 255);
    }
  }
  if (!child.stdin.write(frame)) await once(child.stdin, 'drain');
}
child.stdin.end();
const [code] = await completed;
if (code !== 0) throw new Error('Fold mask preparation failed');
console.log('Prepared lossless fold mask from template geometry.');
