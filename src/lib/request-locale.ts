import { languageCookie, resolveLocale } from './i18n';

export function requestLocale(request: Request) {
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${languageCookie}=`))
    ?.slice(languageCookie.length + 1);
  return resolveLocale(new URL(request.url).searchParams.get('lang') ?? cookie);
}
