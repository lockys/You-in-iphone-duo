import { headers } from 'next/headers';
import type { Viewport } from 'next';
import LanguageProvider from '@/components/language-provider';
import { htmlLanguages, languageHeader, resolveLocale } from '@/lib/i18n';
import './globals.css';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale((await headers()).get(languageHeader));
  return (
    <html lang={htmlLanguages[locale]}>
      <head>
        <link rel="icon" href="/brand/mark.svg" type="image/svg+xml" />
        <link rel="icon" href="/brand/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" sizes="180x180" />
      </head>
      <body>
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
