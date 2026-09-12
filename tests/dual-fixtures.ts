import { mkdir } from 'node:fs/promises';
import { binary, runProcess } from '../src/lib/process';
export async function createDualFixtures() {
  await mkdir('tests/fixtures', { recursive: true });
  for (const color of ['red', 'blue']) {
    await runProcess(binary('ffmpeg'), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=${color === 'red' ? '72x128' : '128x72'}:r=30`,
      ...(color === 'red' ? ['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000'] : []),
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      `tests/fixtures/dual-${color}.mp4`,
    ]);
  }
}
