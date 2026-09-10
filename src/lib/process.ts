import { spawn } from 'node:child_process';
import type { ErrorCode } from './i18n';
import { createRequire } from 'node:module';
import { MediaError, parseProbe } from './composition';
const require = createRequire(import.meta.url);
export function binary(kind: 'ffmpeg' | 'ffprobe'): string {
  if (kind === 'ffmpeg') return process.env.FFMPEG_PATH || require('ffmpeg-static');
  return process.env.FFPROBE_PATH || require('ffprobe-static').path;
}
export function runProcess(
  command: string,
  args: string[],
  options: {
    signal?: AbortSignal;
    timeout?: number;
    onProgress?: (value: number) => void;
    maxOutput?: number;
  } = {},
) {
  return new Promise<string>((resolve, reject) => {
    if (options.signal?.aborted) return reject(new MediaError('error.cancelled', 499));
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let error = '';
    let reason: MediaError | undefined;
    let progressBuffer = '';
    const stop = (message: ErrorCode, status: number) => {
      reason ??= new MediaError(message, status);
      child.kill('SIGKILL');
    };
    const abort = () => stop('error.cancelled', 499);
    const timer = setTimeout(
      () => stop('error.processTimeout', 504),
      options.timeout ?? Number(process.env.RENDER_TIMEOUT_MS || 180000),
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    const clear = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    };
    child.stdout.on('data', (data: Buffer) => {
      if (options.onProgress) {
        progressBuffer += data.toString();
        const lines = progressBuffer.split('\n');
        progressBuffer = lines.pop() ?? '';
        for (const line of lines)
          if (line.startsWith('out_time_ms=')) {
            const time = Number(line.slice(12)) / 1e6;
            if (Number.isFinite(time)) options.onProgress(time);
          }
      } else {
        output += data.toString();
        if (output.length > (options.maxOutput ?? 2 * 1024 ** 2)) stop('error.probeLimit', 400);
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      error = (error + data.toString()).slice(-16000);
    });
    child.once('error', () => {
      clear();
      reject(new MediaError('error.binaryMissing', 503));
    });
    child.once('close', (code) => {
      clear();
      if (reason) reject(reason);
      else if (code !== 0) {
        // Raw stderr can contain paths and media metadata. Never send it to clients or logs.
        const message = /No such filter.*zscale/.test(error) ? 'error.hdrUnsupported' : 'error.codec';
        reject(new MediaError(message, 422));
      } else resolve(output);
    });
  });
}
export async function probe(input: string, signal?: AbortSignal, maxDuration?: number) {
  const json = await runProcess(
    binary('ffprobe'),
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-format_whitelist',
      'mov,matroska,webm',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      input,
    ],
    { signal, timeout: 15000 },
  );
  return parseProbe(JSON.parse(json), maxDuration);
}
