import { cp, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const standalone = path.resolve('.next/standalone');
try {
  await access(path.join(standalone, 'server.js'));
} catch {
  console.error('請先執行 npm run build。');
  process.exit(1);
}
await cp('.next/static', path.join(standalone, '.next/static'), { recursive: true });
await cp('public', path.join(standalone, 'public'), { recursive: true });
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || '3000';
const child = spawn(process.execPath, [path.join(standalone, 'server.js')], {
  windowsHide: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: process.env.BIND_HOST || '127.0.0.1',
    MEDIA_TEMP_DIR: path.resolve(process.env.MEDIA_TEMP_DIR || '.media-cache'),
    FFMPEG_PATH: process.env.FFMPEG_PATH || require('ffmpeg-static'),
    FFPROBE_PATH: process.env.FFPROBE_PATH || require('ffprobe-static').path,
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code || 0;
});
