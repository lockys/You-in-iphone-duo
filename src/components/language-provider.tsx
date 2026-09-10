'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  htmlLanguages,
  languageCookie,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
} from '@/lib/i18n';

type LanguageContext = {
  locale: Locale;
  changeLanguage: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
};
const Context = createContext<LanguageContext | null>(null);
export default function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  useEffect(() => {
    document.documentElement.lang = htmlLanguages[locale];
    // Only the language preference is persisted; media stays in the current editing session.
    document.cookie = `${languageCookie}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }, [locale]);
  useEffect(() => {
    const restore = () =>
      setLocale(resolveLocale(new URL(location.href).searchParams.get('lang') ?? initialLocale));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [initialLocale]);
  const value = useMemo<LanguageContext>(
    () => ({
      locale,
      t: (key, params) => translate(locale, key, params),
      changeLanguage: (next) => {
        const safe = resolveLocale(next);
        const url = new URL(location.href);
        url.searchParams.set('lang', safe);
        // No navigation/remount: uploads, playback, edits, and downloads remain intact.
        window.history.replaceState(null, '', url);
        setLocale(safe);
      },
    }),
    [locale],
  );
  // React 19 hoists these into <head> during SSR and updates them with locale state.
  // Keep a single owner: streamed server metadata can overwrite imperative changes.
  return (
    <Context.Provider value={value}>
      <title>{translate(locale, 'metaTitle')}</title>
      <meta name="description" content={translate(locale, 'metaDescription')} />
      {children}
    </Context.Provider>
  );
}
export function useLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error('LanguageProvider is required');
  return value;
}
