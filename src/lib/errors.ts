import { messages, translate, type ErrorCode, type Locale, type MessageParams } from './i18n';

export class MediaError extends Error {
  constructor(
    public code: ErrorCode,
    public status = 400,
    public params: MessageParams = {},
  ) {
    super(translate('zh-Hant', code, params));
    this.name = 'MediaError';
  }
}
export function errorFromResponse(value: unknown): MediaError {
  if (
    value &&
    typeof value === 'object' &&
    'code' in value &&
    typeof value.code === 'string' &&
    value.code.startsWith('error.') &&
    Object.hasOwn(messages, value.code)
  ) {
    const params: MessageParams = {};
    if ('params' in value && value.params && typeof value.params === 'object') {
      for (const [key, item] of Object.entries(value.params)) {
        if (typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)))
          params[key] = item;
      }
    }
    return new MediaError(value.code as ErrorCode, 400, params);
  }
  // Never display raw server errors, filenames, or filesystem paths.
  return new MediaError('error.generic', 500);
}
export function errorPayload(error: unknown, locale: Locale = 'zh-Hant') {
  const known = error instanceof MediaError ? error : new MediaError('error.generic', 500);
  return { error: translate(locale, known.code, known.params), code: known.code, params: known.params };
}
