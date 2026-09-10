import { expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { buildRenderSpec, defaultOptions, type Template } from '../src/lib/composition';
import { binary, probe, runProcess } from '../src/lib/process';

it('逐格取樣：折疊與展開後沒有綠幕或空白缺口，手部與背景保持前景', async () => {
  await mkdir('evidence', { recursive: true });
  const template: Template = JSON.parse(await readFile('public/templates/template.json', 'utf8'));
  const input = path.resolve('tests/fixtures/grid.mp4');
  const output = path.resolve('evidence/grid-output.mp4');
  const graph = path.resolve('evidence/grid-filter.txt');
  const spec = buildRenderSpec(
    await probe(input),
    template,
    { ...defaultOptions, audioMode: 'mute' },
    input,
    path.resolve('public/templates/8150.mp4'),
    output,
    graph,
  );
  await writeFile(graph, spec.filter);
  await runProcess(binary('ffmpeg'), spec.args, { onProgress: () => {} });
  const report = [];
  for (const [index, time] of [0, 1.2, 2.0, 2.4, 2.9, 4.0, 5.7].entries()) {
    const original = `evidence/pixel-template-${index}.png`,
      result = `evidence/pixel-output-${index}.png`;
    for (const [src, dst] of [
      ['public/templates/8150.mp4', original],
      [output, result],
    ])
      await runProcess(binary('ffmpeg'), [
        '-v',
        'error',
        '-y',
        '-ss',
        String(time),
        '-i',
        src,
        '-frames:v',
        '1',
        '-vf',
        'scale=960:540',
        dst,
      ]);
    const before = await sharp(original).removeAlpha().raw().toBuffer();
    const after = await sharp(result).removeAlpha().raw().toBuffer();
    let green = 0,
      leftover = 0,
      purple = 0,
      foreground = 0,
      foregroundDelta = 0;
    for (let i = 0; i < before.length; i += 3) {
      const r = before[i],
        g = before[i + 1],
        b = before[i + 2];
      const R = after[i],
        G = after[i + 1],
        B = after[i + 2];
      if (g > 200 && r < 35 && b < 35) {
        green++;
        if (G > 180 && G - R > 90 && G - B > 90) leftover++;
        if (B > R + 25 && R > G + 20) purple++;
      }
      // Skin / neutral foreground; exclude semitransparent green edges.
      if (Math.sqrt(r * r + (255 - g) ** 2 + b * b) / 441.673 > 0.5) {
        foreground++;
        foregroundDelta += Math.abs(R - r) + Math.abs(G - Math.min(g, (r + b) / 2)) + Math.abs(B - b);
      }
    }
    const row = {
      time,
      greenPixels: green,
      residualGreenRatio: leftover / green,
      filledPurpleRatio: purple / green,
      foregroundMeanChannelError: foregroundDelta / foreground / 3,
    };
    report.push(row);
    expect(row.residualGreenRatio).toBeLessThan(0.001);
    expect(row.filledPurpleRatio, `screen fill at ${time}s`).toBeGreaterThan(0.78); // White grid lines account for the remainder.
    expect(row.foregroundMeanChannelError).toBeLessThan(5);
  }
  await writeFile('evidence/pixel-verification.json', JSON.stringify(report, null, 2));
});
