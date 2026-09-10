import { NextResponse, type NextRequest } from 'next/server';
import { languageCookie, languageHeader, resolveLocale } from '@/lib/i18n';

export function proxy(request: NextRequest) {
  const locale = resolveLocale(
    request.nextUrl.searchParams.get('lang') ?? request.cookies.get(languageCookie)?.value,
  );
  const headers = new Headers(request.headers);
  headers.set(languageHeader, locale); // Always overwrite client-provided values.
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: '/' };
