import { appTools, defineConfig } from '@modern-js/app-tools';

export default defineConfig({
  plugins: [appTools()],
  source: { configDir: '.' },
  server: { logger: false, port: 3000, ssr: { mode: 'string' }, tsconfigPath: './tsconfig.server.json' },
  html: {
    title: '',
    meta: { viewport: 'width=device-width, initial-scale=1, viewport-fit=cover' },
  },
});
