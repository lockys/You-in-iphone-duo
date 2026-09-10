import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { binary, probe, runProcess } from '../src/lib/process';
import type { Rect, Template } from '../src/lib/composition';

async function main() {
  const input = path.resolve(process.argv[2] || '8150.mp4');
  const output = path.resolve('public/templates');
  await mkdir(output, { recursive: true });
  await mkdir('evidence', { recursive: true });
  const meta = await probe(input);
  const raw: Rect[] = [];
  const width = 960,
    height = 540,
    bytes = width * height * 3;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary('ffmpeg'),
      [
        '-v',
        'error',
        '-i',
        input,
        '-vf',
        `fps=${meta.fps},scale=${width}:${height}`,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { windowsHide: true },
    );
    let pending = Buffer.alloc(0);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Template analysis timeout'));
    }, 90000);
    child.stdout.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= bytes) {
        const frame = pending.subarray(0, bytes);
        pending = pending.subarray(bytes);
        let x0 = width,
          y0 = height,
          x1 = 0,
          y1 = 0,
          count = 0;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            const r = frame[i],
              g = frame[i + 1],
              b = frame[i + 2];
            if (g > 160 && r < 110 && b < 120 && g - r > 85 && g - b > 85) {
              x0 = Math.min(x0, x);
              x1 = Math.max(x1, x);
              y0 = Math.min(y0, y);
              y1 = Math.max(y1, y);
              count++;
            }
          }
        if (count < 1000) {
          child.kill();
          reject(new Error('Template frame has no reliable green-screen region'));
          return;
        }
        raw.push({ x: x0 * 2, y: y0 * 2, width: (x1 - x0 + 1) * 2, height: (y1 - y0 + 1) * 2 });
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('Template analysis failed'));
    });
  });
  // Temporal envelope prevents exposed strips during the fast unfolding transition.
  const keyframes: { n: number; rect: Rect }[] = [];
  for (let n = 0; n < raw.length; n += 3) {
    const near = raw.slice(Math.max(0, n - 3), Math.min(raw.length, n + 4));
    const x = Math.min(...near.map((r) => r.x)) - 8;
    const y = Math.min(...near.map((r) => r.y)) - 8;
    keyframes.push({
      n,
      rect: {
        x,
        y,
        width: Math.max(...near.map((r) => r.x + r.width)) + 8 - x,
        height: Math.max(...near.map((r) => r.y + r.height)) + 8 - y,
      },
    });
  }
  keyframes.push({ n: raw.length - 1, rect: keyframes.at(-1)!.rect });
  const frames = raw.map((_, n) => {
    const index = Math.min(Math.floor(n / 3), keyframes.length - 2);
    const a = keyframes[index],
      b = keyframes[index + 1];
    const mix = (n - a.n) / Math.max(1, b.n - a.n);
    return Object.fromEntries(
      Object.keys(a.rect).map((k) => [
        k,
        Math.round(a.rect[k as keyof Rect] * (1 - mix) + b.rect[k as keyof Rect] * mix),
      ]),
    ) as Rect;
  });
  const config: Template = {
    width: 1920,
    height: 1080,
    duration: meta.duration,
    fps: meta.fps,
    hasAudio: meta.hasAudio,
    frames,
    similarity: 0.18,
    blend: 0.1,
    keyColor: '0x00ff00',
  };
  if (path.resolve(input) !== path.join(output, '8150.mp4'))
    await copyFile(input, path.join(output, '8150.mp4'));
  await writeFile(path.join(output, 'template.json'), JSON.stringify(config));
  await writeFile(
    'evidence/template-analysis.json',
    JSON.stringify(
      {
        source: 'https://x.com/MurdoinkGS/status/2097794206525788302',
        meta,
        rawBounds: raw,
        tracking: frames,
      },
      null,
      2,
    ),
  );
  for (const [i, time] of [0, meta.duration / 2, meta.duration - 0.12].entries()) {
    await runProcess(binary('ffmpeg'), [
      '-v',
      'error',
      '-y',
      '-ss',
      String(time),
      '-i',
      input,
      '-frames:v',
      '1',
      `evidence/template-${i}.png`,
    ]);
  }
  await runProcess(binary('ffmpeg'), [
    '-v',
    'error',
    '-y',
    '-i',
    input,
    '-vf',
    'scale=960:540',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    path.join(output, 'preview.mp4'),
  ]);
  console.log(
    JSON.stringify(
      {
        ...meta,
        frames: frames.length,
        firstScreen: raw[0],
        middleScreen: raw[Math.floor(raw.length / 2)],
        lastScreen: raw.at(-1),
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Template preparation failed');
  process.exitCode = 1;
});
