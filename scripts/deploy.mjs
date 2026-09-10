import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const target =
  process.argv[2] || process.env.MODERNJS_DEPLOY || (process.env.VERCEL === '1' ? 'vercel' : 'node');
if (!['node', 'vercel'].includes(target)) throw new Error('Expected node or vercel deployment target');
const output = path.resolve(target === 'vercel' ? '.vercel/output/functions/index.func' : '.output');
if (!output.startsWith(root + path.sep)) throw new Error('Output must stay inside the project');
const cli = path.resolve('node_modules/@modern-js/app-tools/bin/modern.js');
const child = spawn(process.execPath, [cli, 'deploy'], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, MODERNJS_DEPLOY: target },
});
const code = await new Promise((resolve) => child.on('exit', resolve));
if (code !== 0) process.exit(Number(code) || 1);

// Deployment configuration belongs in the host environment, not the artifact.
for (const name of await readdir(output)) {
  if (/^\.env(?:\.|$)/.test(name)) await rm(path.join(output, name), { force: true });
}

// File tracing cannot discover native binary paths or FFmpeg's template inputs.
// Copy only the current platform's executables, never uploads or .env files.
await cp('public/templates', path.join(output, 'public/templates'), { recursive: true });
for (const pkg of ['ffmpeg-static', 'ffprobe-static']) {
  const dest = path.join(output, 'node_modules', pkg);
  await mkdir(dest, { recursive: true });
  for (const name of ['index.js', 'package.json'])
    await cp(path.join('node_modules', pkg, name), path.join(dest, name));
  const binary =
    pkg === 'ffmpeg-static'
      ? process.platform === 'win32'
        ? 'ffmpeg.exe'
        : 'ffmpeg'
      : `bin/${process.platform}/${process.arch}/ffprobe${process.platform === 'win32' ? '.exe' : ''}`;
  const source = path.join('node_modules', pkg, binary);
  // Docker deliberately installs the OS binaries instead.
  if (
    await stat(source).then(
      () => true,
      () => false,
    )
  ) {
    await mkdir(path.dirname(path.join(dest, binary)), { recursive: true });
    await cp(source, path.join(dest, binary));
  } else if (!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH)
    throw new Error('Native media binaries missing');
}
if (target === 'vercel') {
  await cp('public', '.vercel/output/static', { recursive: true });
  const configPath = path.join(output, '.vc-config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.maxDuration = 300;
  await writeFile(configPath, JSON.stringify(config, null, 2));
} else await cp('public', path.join(output, 'public'), { recursive: true });
console.log(`Prepared ${target} output with native FFmpeg and template assets.`);
