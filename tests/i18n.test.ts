import { describe, expect, it } from 'vitest';
import { errorFromResponse, errorPayload, MediaError } from '../src/lib/errors';
import { locales, messages, resolveLocale, translate } from '../src/lib/i18n';
import { validateFile } from '../src/lib/composition';

describe('網站多語系', () => {
  it.each(locales)('%s 的介面及錯誤都有譯文，動態參數一致', (locale) => {
    for (const [key, row] of Object.entries(messages)) {
      const placeholders = row.map((text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
      expect(placeholders[1], key).toEqual(placeholders[0]);
      expect(placeholders[2], key).toEqual(placeholders[0]);
      const text = translate(locale, key as keyof typeof messages);
      expect(text.trim(), key).not.toBe('');
      if (locale === 'en') expect(text, key).not.toMatch(/[\u3400-\u9fff]/);
    }
  });
  it('僅接受明確支援的語言，不接受陣列、任意標籤或路徑', () => {
    for (const input of [undefined, null, '', '../en', '<script>', ['en'], 'en-US', {}])
      expect(resolveLocale(input)).toBe('zh-Hant');
    for (const locale of locales) expect(resolveLocale(locale)).toBe(locale);
  });
  it('大小驗證保留代碼及上限，切換語言後仍能正確說明', () => {
    let caught: unknown;
    try {
      validateFile('a.mp4', 'video/mp4', 31 * 1024 ** 2, 30 * 1024 ** 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MediaError);
    expect(errorPayload(caught, 'en')).toEqual({
      code: 'error.fileSize',
      params: { size: 30 },
      error: 'The video must be no larger than 30 MB.',
    });
    expect(errorPayload(caught, 'zh-Hans').error).toBe('视频不能超过 30 MB。');
  });
  it('回應解碼使用安全代碼，不顯示伺服器原始錯誤或路徑', () => {
    const error = errorFromResponse({ code: 'error.codec', error: '/private/user-secret.mp4' });
    expect(error.code).toBe('error.codec');
    expect(errorPayload(error, 'en').error).toContain('unsupported codec');
    for (const input of [
      undefined,
      { code: '__proto__' },
      { code: 'constructor' },
      { code: 'error.unknown', error: '/private/secret' },
    ])
      expect(errorFromResponse(input).code).toBe('error.generic');
    expect(errorPayload(new Error('/private/secret'), 'en').error).not.toContain('secret');
  });
});
