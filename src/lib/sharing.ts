import { brandName } from './brand';
import { MediaError } from './errors';

export const socialPlatforms = ['Threads', 'X', 'Bluesky'] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];
// Web intents accept text, not local video attachments. Never append private media URLs.
export function socialIntent(platform: SocialPlatform, text: string) {
  const url = new URL(
    {
      Threads: 'https://www.threads.com/intent/post',
      X: 'https://x.com/intent/tweet',
      Bluesky: 'https://bsky.app/intent/compose',
    }[platform],
  );
  url.searchParams.set('text', text);
  return url.toString();
}
export function canShareVideo(file: File, browser: Pick<Navigator, 'share' | 'canShare'> = navigator) {
  try {
    return (
      typeof browser.share === 'function' &&
      typeof browser.canShare === 'function' &&
      browser.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}
export function videoShareData(file: File): ShareData {
  return { files: [file], title: brandName };
}
export async function prepareShareFile(url: string, signal: AbortSignal): Promise<File> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('video/mp4'))
    throw new MediaError('error.resultExpired');
  // Only the six-second result is held in the browser, never the uploaded original.
  const maxBytes = 64 * 1024 ** 2;
  if (Number(response.headers.get('content-length')) > maxBytes) throw new MediaError('error.shareSize');
  const reader = response.body?.getReader();
  if (!reader) throw new MediaError('error.resultExpired');
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new MediaError('error.shareSize');
      chunks.push(new Uint8Array(part.value));
    }
    if (!size) throw new MediaError('error.resultExpired');
    return new File(chunks, 'iphone-duo.mp4', { type: 'video/mp4' });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
