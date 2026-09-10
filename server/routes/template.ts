import { jsonError, loadTemplate, session, maxBytes } from '../../src/lib/server';
export async function GET(request: Request) {
  try {
    const auth = session(request);
    return Response.json(
      { template: await loadTemplate(), maxBytes, maxDuration: null },
      { headers: { 'Cache-Control': 'no-store', ...(auth.cookie ? { 'Set-Cookie': auth.cookie } : {}) } },
    );
  } catch (error) {
    return jsonError(error, request);
  }
}
