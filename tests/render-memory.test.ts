import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRenderSpec, defaultOptions } from '../src/lib/composition';
import { binary, probe } from '../src/lib/process';

it('長片低幀率來源從後段合成時，FFmpeg 記憶體峰值低於 512 MiB', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'iphone-duo-memory-'));
  try {
    const template = JSON.parse(await readFile('public/templates/template.json', 'utf8'));
    const input = path.resolve('tests/fixtures/long.mp4');
    const output = path.join(dir, 'result.mp4');
    const filter = path.join(dir, 'filter.txt');
    const spec = buildRenderSpec(
      await probe(input),
      template,
      { ...defaultOptions, startTime: 305, scale: 1.2, offsetX: 0.15 },
      input,
      path.resolve('public/templates/8150.mp4'),
      output,
      filter,
    );
    await writeFile(filter, spec.filter);
    const args = ['-benchmark', ...spec.args];
    args[args.indexOf('-loglevel') + 1] = 'info';
    const { stderr } = await promisify(execFile)(binary('ffmpeg'), args, {
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 2 * 1024 ** 2,
    });
    const peakKiB = Number(stderr.match(/maxrss=(\d+)kB/)?.[1]);
    expect(Number.isFinite(peakKiB)).toBe(true);
    expect(peakKiB).toBeGreaterThan(0);
    expect(peakKiB).toBeLessThan(512 * 1024);
    expect((await probe(output)).duration).toBeCloseTo(template.duration, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
