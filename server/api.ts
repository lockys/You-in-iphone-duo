import { GET as template } from './routes/template';
import { POST as upload } from './routes/upload';
import { POST as render } from './routes/render';
import { GET as media, DELETE as remove } from './routes/media';
import { cloudEnabled } from './cloud-store';
import { routeCloudApi } from './cloud-api';

export async function routeApi(request: Request): Promise<Response> {
  if (cloudEnabled()) return routeCloudApi(request);
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/template' && request.method === 'GET') return template(request);
  if (pathname === '/api/upload' && request.method === 'POST') return upload(request);
  if (pathname === '/api/render' && request.method === 'POST') return render(request);
  const match = /^\/api\/media\/([^/]+)$/.exec(pathname);
  if (match) {
    const context = { params: Promise.resolve({ id: match[1] }) };
    if (request.method === 'GET') return media(request, context);
    if (request.method === 'DELETE') return remove(request, context);
  }
  return new Response(null, { status: 404 });
}
