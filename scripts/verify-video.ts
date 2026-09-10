import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildRenderSpec, defaultOptions } from '../src/lib/composition';
import { binary, probe, runProcess } from '../src/lib/process';
async function main() {
  await mkdir('evidence', { recursive: true });
  const template = JSON.parse(await readFile('public/templates/template.json', 'utf8'));
  let output = process.argv[2];
  if (!output) {
    output = path.resolve('evidence/verified-output.mp4');
    const input = path.resolve('tests/fixtures/portrait.mp4');
    const spec = buildRenderSpec(
      await probe(input),
      template,
      { ...defaultOptions, startTime: 0.5 },
      input,
      path.resolve('public/templates/8150.mp4'),
      output,
      path.resolve('evidence/verification-filter.txt'),
    );
    await writeFile('evidence/verification-filter.txt', spec.filter);
    await runProcess(binary('ffmpeg'), spec.args, {
      timeout: 180000,
      onProgress: (time) => process.stdout.write(`Rendered ${time.toFixed(2)} s\n`),
    });
  }
  const raw = JSON.parse(
    await runProcess(binary('ffprobe'), [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      output,
    ]),
  );
  const video = raw.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.pix_fmt, 'yuv420p');
  assert.ok(String(raw.format.format_name).includes('mp4'));
  for (const stream of raw.streams) if (stream.codec_type === 'audio') assert.equal(stream.codec_name, 'aac');
  assert.ok(Math.abs(Number(raw.format.duration) - template.duration) < 0.06);
  const handle = await open(output, 'r');
  const atoms: string[] = [];
  try {
    const header = Buffer.alloc(16);
    const size = (await handle.stat()).size;
    for (let position = 0; position + 8 <= size;) {
      await handle.read(header, 0, 16, position);
      let length = header.readUInt32BE(0);
      atoms.push(header.toString('ascii', 4, 8));
      if (length === 1) length = Number(header.readBigUInt64BE(8));
      if (length < 8) break;
      position += length;
    }
    assert.ok(
      atoms.indexOf('moov') >= 0 && atoms.indexOf('moov') < atoms.indexOf('mdat'),
      'faststart moov must precede mdat',
    );
  } finally {
    await handle.close();
  }
  await runProcess(binary('ffmpeg'), ['-v', 'error', '-i', output, '-f', 'null', '-']);
  for (const [i, time] of [0, template.duration / 2, template.duration - 0.12].entries())
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
      `evidence/output-${i}.png`,
    ]);
  await writeFile('evidence/output-ffprobe.json', JSON.stringify(raw, null, 2));
  console.log('VERIFIED: 1920×1080 / H.264 / yuv420p / duration / faststart / full decode.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
