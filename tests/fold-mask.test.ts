import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import template from '../public/templates/template.json';
import { binary } from '../src/lib/process';
import { foldState, foldWeights } from '../src/lib/fold-effect';

it('native lossless mask stays synchronized with the shared preview gradients', async () => {
  const { stdout } = await promisify(execFile)(
    binary('ffmpeg'),
    [
      '-v',
      'error',
      '-i',
      'public/templates/fold-mask.mkv',
      '-vf',
      'crop=iw:2:0:0',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { windowsHide: true, encoding: 'buffer', maxBuffer: 4 * 1024 ** 2, timeout: 30000 },
  );
  expect(stdout.length).toBe(template.frames.length * template.width * 2 * 3);
  for (const n of [0, 65, 72, 76, 80, 84, 88, 96, 100, template.frames.length - 1]) {
    const state = foldState(template, template.frames[n], n / template.fps);
    for (let x = 0; x < template.width; x += 7) {
      const w = foldWeights(state, x);
      const i = (n * template.width * 2 + x) * 3;
      expect(stdout[i]).toBe(Math.round(w.blur * 255));
      expect(stdout[i + 2]).toBe(Math.round(w.shade * 255));
    }
  }
});
