import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShareVideo,
  prepareShareFile,
  socialIntent,
  socialPlatforms,
  videoShareData,
  mobileSocialIntent,
  shareCaption,
  shareDownloadUrl,
} from '../src/lib/sharing';
import { brandName } from '../src/lib/brand';

afterEach(() => vi.unstubAllGlobals());
describe('影片分享邊界', () => {
  it.each(socialPlatforms)('%s Android intent 保留文案與 HTTPS 備援', (platform) => {
    const text = '測試 & #uiniphoneduo';
    const web = socialIntent(platform, text);
    expect(mobileSocialIntent(platform, text, 'Android')).toBe(
      `intent://${web.slice(8)}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(web)};end`,
    );
    expect(mobileSocialIntent(platform, text, 'iPhone')).toBe(web);
    expect(shareCaption(text)).toBe(text);
  });
  it('下載連結正確保留查詢參數', () => {
    expect(shareDownloadUrl('/api/media/id')).toBe('/api/media/id?download=1');
    expect(shareDownloadUrl('/api/media/id?access=token')).toBe('/api/media/id?access=token&download=1');
  });
  it.each(socialPlatforms)('%s 僅帶入編碼後的文案，不洩漏私人影片網址', (platform) => {
    const caption = '你好 & #iPhoneDuo / test';
    const url = new URL(socialIntent(platform, caption));
    expect(url.protocol).toBe('https:');
    expect([...url.searchParams.keys()]).toEqual(['text']);
    expect(url.searchParams.get('text')).toBe(caption + ' #uiniphoneduo');
    expect(url.href).not.toMatch(/localhost|127\.0\.0\.1|access=|api\/media/);
    expect(url.hostname).toBe({ Threads: 'www.threads.com', X: 'x.com' }[platform]);
  });
  it('系統分享傳遞 MP4 檔案，不傳遞短效下載連結', () => {
    const file = new File(['video'], 'iphone-duo.mp4', { type: 'video/mp4' });
    expect(videoShareData(file)).toEqual({ files: [file], title: brandName, text: '#uiniphoneduo' });
    expect(canShareVideo(file, { share: vi.fn(), canShare: () => true })).toBe(true);
    expect(canShareVideo(file, { share: vi.fn(), canShare: () => false })).toBe(false);
    expect(
      canShareVideo(file, {
        share: vi.fn(),
        canShare: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(false);
  });
  it('從串流準備真正的檔案並傳遞取消訊號', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
        headers: { 'content-type': 'video/mp4' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    const file = await prepareShareFile('/api/media/private?access=secret', signal);
    expect(fetcher).toHaveBeenCalledWith('/api/media/private?access=secret', { signal });
    expect(file.type).toBe('video/mp4');
    expect(file.name).toBe('iphone-duo.mp4');
    expect(file.size).toBe(8);
    expect(new Uint8Array(await file.arrayBuffer()).slice(4)).toEqual(new Uint8Array([102, 116, 121, 112]));
  });
  it.each([
    new Response('', { status: 404 }),
    new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('', { headers: { 'content-type': 'video/mp4' } }),
  ])('拒絕過期、非影片及空白回應', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(prepareShareFile('/result', new AbortController().signal)).rejects.toMatchObject({
      code: 'error.resultExpired',
    });
  });
  it('拒絕超過分享記憶體上限的回應', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('x', {
          headers: { 'content-type': 'video/mp4', 'content-length': String(65 * 1024 ** 2) },
        }),
      ),
    );
    await expect(prepareShareFile('/result', new AbortController().signal)).rejects.toMatchObject({
      code: 'error.shareSize',
    });
  });
  it('沒有 Content-Length 時仍限制串流大小並關閉串流', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65 * 1024 ** 2));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'video/mp4' } })),
    );
    await expect(prepareShareFile('/result', new AbortController().signal)).rejects.toMatchObject({
      code: 'error.shareSize',
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
