import { beforeAll, expect, it } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import template from '../public/templates/template.json';
import { buildRenderSpec, defaultOptions, parseSecondOptions, unfoldTime } from '../src/lib/composition';
import { binary, probe, runProcess } from '../src/lib/process';
import { createDualFixtures } from './dual-fixtures';

beforeAll(createDualFixtures);
it('validates independent open-video options and aligns the transition to a frame', () => {
  expect(parseSecondOptions({ openScale: '1.5', openStartTime: '0.3' }, defaultOptions)).toMatchObject({
    scale: 1.5,
    startTime: 0.3,
  });
  expect(() => parseSecondOptions({ openStartTime: '-1' }, defaultOptions)).toThrow();
  expect(unfoldTime(template) * template.fps).toBeCloseTo(76);
});
it('renders two real inputs, switches color and silences the second audio segment', async () => {
  await mkdir('evidence', { recursive: true });
  const red = path.resolve('tests/fixtures/dual-red.mp4');
  const blue = path.resolve('tests/fixtures/dual-blue.mp4');
  const output = path.resolve('evidence/dual-output.mp4');
  const graph = path.resolve('evidence/dual-filter.txt');
  const spec = buildRenderSpec(
    await probe(red),
    template,
    { ...defaultOptions, audioMode: 'user' },
    red,
    path.resolve('public/templates/8150.mp4'),
    output,
    graph,
    { file: blue, info: await probe(blue), options: { ...defaultOptions, startTime: 0.3, scale: 1.5 } },
  );
  await writeFile(graph, spec.filter);
  await runProcess(binary('ffmpeg'), spec.args, { timeout: 180000 });
  expect(await probe(output)).toMatchObject({ width: 1920, height: 1080, codec: 'h264', hasAudio: true });
  for (const [time, channel] of [
    [1, 0],
    [4, 2],
  ] as const) {
    const { stdout } = await promisify(execFile)(
      binary('ffmpeg'),
      [
        '-v',
        'error',
        '-ss',
        String(time),
        '-i',
        output,
        '-vf',
        'crop=20:20:1000:350',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { encoding: 'buffer' },
    );
    expect(stdout[channel]).toBeGreaterThan(180);
    expect(stdout[channel === 0 ? 2 : 0]).toBeLessThan(50);
    await runProcess(binary('ffmpeg'), [
      '-v',
      'error',
      '-y',
      '-ss',
      String(time),
      '-i',
      output,
      '-frames:v',
      '1',
      `evidence/dual-${time}.png`,
    ]);
    const audio = await promisify(execFile)(
      binary('ffmpeg'),
      [
        '-v',
        'error',
        '-ss',
        String(time),
        '-i',
        output,
        '-t',
        '0.1',
        '-vn',
        '-f',
        's16le',
        '-ac',
        '1',
        'pipe:1',
      ],
      { encoding: 'buffer' },
    );
    let peak = 0;
    for (let i = 0; i < audio.stdout.length; i += 2)
      peak = Math.max(peak, Math.abs(audio.stdout.readInt16LE(i)));
    if (time === 1) expect(peak).toBeGreaterThan(500);
    else expect(peak).toBeLessThan(20);
  }
}, 180000);
