import { Html, Head, Body, Root } from '@modern-js/runtime/document';

export default function Document() {
  return (
    <Html lang="zh-Hant">
      <Head>
        <link rel="preload" as="image" href="/templates/demo-poster.jpg" />
        <link rel="icon" href="/brand/mark.svg" type="image/svg+xml" />
        <link rel="icon" href="/brand/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" sizes="180x180" />
      </Head>
      <Body>
        <Root />
      </Body>
    </Html>
  );
}
