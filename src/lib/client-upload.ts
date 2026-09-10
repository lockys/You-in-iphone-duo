import { MediaError, errorFromResponse } from './errors';
import { languageHeader, type Locale } from './i18n';
// Native probing remains authoritative for codecs the browser cannot inspect (for example HEVC).
export function readVideoDuration(file: File, signal: AbortSignal): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (aborted = false) => {
      const duration = video.duration;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (aborted) reject(new DOMException('Cancelled', 'AbortError'));
      else resolve(Number.isFinite(duration) && duration > 0 ? duration : undefined);
    };
    const cancel = () => finish(true);
    const timer = setTimeout(() => finish(), 3000);
    signal.addEventListener('abort', cancel, { once: true });
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish();
    video.src = url;
  });
}
export type ProgressEvent = {
  type: 'progress' | 'complete' | 'error' | 'heartbeat';
  stage?: string;
  progress?: number;
  error?: string;
  [key: string]: unknown;
};
export function postMultipart(
  url: string,
  data: FormData,
  xhr: XMLHttpRequest,
  onEvent: (event: ProgressEvent) => void,
  locale: Locale = 'zh-Hant',
) {
  return new Promise<ProgressEvent>((resolve, reject) => {
    let cursor = 0,
      buffer = '',
      done: ProgressEvent | undefined;
    const parse = () => {
      buffer += xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ProgressEvent;
        if (event.type === 'error') reject(errorFromResponse(event));
        if (event.type === 'complete') done = event;
        onEvent(event);
      }
    };
    xhr.open('POST', url);
    xhr.setRequestHeader(languageHeader, locale);
    xhr.timeout = 300000;
    xhr.upload.onprogress = (event) =>
      onEvent({
        type: 'progress',
        stage: 'uploading',
        progress: event.lengthComputable ? (event.loaded / event.total) * 100 : 0,
      });
    xhr.onprogress = () => {
      if (xhr.status < 400) {
        try {
          parse();
        } catch {
          reject(new MediaError('error.invalidResponse'));
        }
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 400) {
        try {
          reject(errorFromResponse(JSON.parse(xhr.responseText)));
        } catch {
          reject(new MediaError('error.busy'));
        }
        return;
      }
      try {
        parse();
        if (done) resolve(done);
        else reject(new MediaError('error.incomplete'));
      } catch {
        reject(new MediaError('error.invalidResponse'));
      }
    };
    xhr.onerror = () => reject(new MediaError('error.network'));
    xhr.ontimeout = () => reject(new MediaError('error.timeout'));
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));
    xhr.send(data);
  });
}
