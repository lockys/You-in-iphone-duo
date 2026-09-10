import { useLoaderData } from '@modern-js/runtime/router';
import Editor from '@/components/editor';
import LanguageProvider from '@/components/language-provider';
import type { Locale } from '@/lib/i18n';
import '../styles.css';

export default function Page() {
  const { locale } = useLoaderData() as { locale: Locale };
  return (
    <LanguageProvider initialLocale={locale}>
      <Editor />
    </LanguageProvider>
  );
}
