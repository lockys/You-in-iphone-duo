import { mkdir } from 'node:fs/promises';
import { binary, runProcess } from '../src/lib/process';
async function main() {
  await mkdir('tests/fixtures', { recursive: true });
  const base = ['-v', 'error', '-y'];
  for (const duration of [5, 5.04]) {
    await runProcess(binary('ffmpeg'), [
      ...base,
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x90:rate=25',
      '-t',
      String(duration),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-movflags',
      '+faststart',
      `tests/fixtures/duration-${duration}.mp4`,
    ]);
  }
  await runProcess(binary('ffmpeg'), [
    ...base,
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=360x640:rate=24',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:sample_rate=48000',
    '-t',
    '1.5',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    'tests/fixtures/portrait.mp4',
  ]);
  await runProcess(binary('ffmpeg'), [
    ...base,
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=25',
    '-t',
    '2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    'tests/fixtures/silent.mp4',
  ]);
  await runProcess(binary('ffmpeg'), [
    ...base,
    '-display_rotation',
    '90',
    '-i',
    'tests/fixtures/silent.mp4',
    '-c',
    'copy',
    'tests/fixtures/rotated.mov',
  ]);
  await runProcess(binary('ffmpeg'), [
    ...base,
    '-f',
    'lavfi',
    '-i',
    'color=c=0x8954dc:s=360x640:r=24',
    '-vf',
    'drawgrid=width=60:height=60:thickness=3:color=white',
    '-t',
    '1.5',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    'tests/fixtures/grid.mp4',
  ]);
  await runProcess(binary('ffmpeg'), [
    ...base,
    '-i',
    'tests/fixtures/portrait.mp4',
    '-t',
    '0.5',
    '-c:v',
    'libx265',
    '-x265-params',
    'pools=1:frame-threads=1:log-level=error',
    '-pix_fmt',
    'yuv420p10le',
    '-tag:v',
    'hvc1',
    '-color_primaries',
    'bt2020',
    '-color_trc',
    'arib-std-b67',
    '-colorspace',
    'bt2020nc',
    '-c:a',
    'aac',
    'tests/fixtures/hevc-hlg.mov',
  ]);
  await runProcess(binary('ffmpeg'), [
    ...base,
    '-i',
    'tests/fixtures/portrait.mp4',
    '-t',
    '0.5',
    '-c:v',
    'libvpx-vp9',
    '-threads',
    '2',
    '-deadline',
    'realtime',
    '-c:a',
    'libopus',
    'tests/fixtures/sample.webm',
  ]);
  console.log('Created real portrait/audio, landscape/silent, rotation fixtures.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
