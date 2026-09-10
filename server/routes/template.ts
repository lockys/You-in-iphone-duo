import { jsonError, loadTemplate, session, maxBytes } from '../../src/lib/server';
import { MAX_UPLOAD_DURATION } from '../../src/lib/composition';
export async function GET(request: Request) {
  try {
    const auth = session(request);
    return Response.json(
      { template: await loadTemplate(), maxBytes, maxDuration: MAX_UPLOAD_DURATION },
      { headers: { 'Cache-Control': 'no-store', ...(auth.cookie ? { 'Set-Cookie': auth.cookie } : {}) } },
    );
  } catch (error) {
    return jsonError(error, request);
  }
}
