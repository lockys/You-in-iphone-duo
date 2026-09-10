import { defineServerConfig } from '@modern-js/server-runtime';
import { routeApi } from './api';
import { requestLocale } from '../src/lib/request-locale';
import { htmlLanguages } from '../src/lib/i18n';
import { serveTemplatePreview } from './template-preview';

export default defineServerConfig({
  middlewares: [
    {
      name: 'media-api',
      order: 'pre',
      handler: async (c, next) => {
        c.header('Referrer-Policy', 'no-referrer');
        c.header('X-Content-Type-Options', 'nosniff');
        if (c.req.path.startsWith('/api/')) return routeApi(c.req.raw);
        if (c.req.path === '/templates/preview.mp4' && ['GET', 'HEAD'].includes(c.req.method))
          return serveTemplatePreview(c.req.raw);
        await next();
      },
    },
  ],
  renderMiddlewares: [
    {
      name: 'document-language',
      handler: async (c, next) => {
        await next();
        if (c.res.headers.get('content-type')?.includes('text/html')) {
          // Modern's static template adds an empty title; Helmet owns the localized metadata.
          const html = (await c.res.text()).replace(/<title>\s*<\/title>/g, '');
          c.res = new Response(
            html.replace(/<html[^>]*>/, `<html lang="${htmlLanguages[requestLocale(c.req.raw)]}">`),
            c.res,
          );
          c.res.headers.set('Cache-Control', 'private, no-store');
        }
      },
    },
  ],
});
