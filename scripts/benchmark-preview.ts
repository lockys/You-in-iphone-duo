import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { binary, probe } from '../src/lib/process';
import { previewArgs } from '../src/lib/preview-segment';
import template from '../public/templates/template.json';

await mkdir('evidence', { recursive: true });
const results = [];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
async function measure(args: string[]) {
  const started = performance.now();
  let error = '';
  await new Promise<void>((resolve, reject) => {
    const process = spawn(binary('ffmpeg'), ['-benchmark', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const timeout = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new Error('Benchmark timeout'));
    }, 180000);
    process.stderr.on('data', (data) => {
      error = (error + data.toString()).slice(-16000);
    });
    process.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('Benchmark process unavailable'));
    });
    process.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error('Benchmark failed'));
    });
  });
  return {
    ms: Math.round(performance.now() - started),
    peakKiB: error.match(/maxrss=(\d+)(?:kB|KiB)/)?.[1]
      ? Number(error.match(/maxrss=(\d+)(?:kB|KiB)/)![1])
      : null,
  };
}
for (const [name, files] of [
  ['short', ['silent.mp4']],
  ['six-minute', ['long.mp4']],
  ['dual', ['dual-red.mp4', 'dual-blue.mp4']],
] as const) {
  const timings: Record<string, { ms: number; peakKiB: number | null }[]> = { before: [], after: [] };
  for (let repeat = 0; repeat < 3; repeat++)
    for (const variant of ['before', 'after']) {
      let total = 0;
      let peak: number | null = null;
      for (const file of files) {
        const input = `tests/fixtures/${file}`;
        let args = previewArgs(
          await probe(input),
          input,
          `evidence/benchmark-${name}-${variant}.mp4`,
          0,
          template.duration,
        );
        if (variant === 'before') {
          // The previous upload pipeline encoded the full source, without input looping or trimming.
          args = args.filter(
            (value, index, values) =>
              !['-stream_loop', '-ss', '-t'].includes(value) &&
              !['-stream_loop', '-ss', '-t'].includes(values[index - 1]),
          );
        }
        args[args.indexOf('-v') + 1] = 'info';
        const result = await measure(args);
        total += result.ms;
        if (result.peakKiB !== null) peak = Math.max(peak || 0, result.peakKiB);
      }
      timings[variant].push({ ms: total, peakKiB: peak });
    }
  const beforeMs = median(timings.before.map((item) => item.ms));
  const afterMs = median(timings.after.map((item) => item.ms));
  results.push({
    name,
    beforeMs,
    afterMs,
    reductionPercent: Math.round((1 - afterMs / beforeMs) * 100),
    samples: timings,
  });
}
await writeFile(
  'evidence/preview-benchmark.json',
  JSON.stringify(
    {
      environment:
        'Local native FFmpeg; excludes upload network, queue wait and Blob I/O. Dual times are sequential totals.',
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    results.map(({ name, beforeMs, afterMs, reductionPercent }) => ({
      name,
      beforeMs,
      afterMs,
      reductionPercent,
    })),
    null,
    2,
  ),
);
