import { checkOrigin, dispose, findAsset, jsonError, serveAsset, session } from '@/lib/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return await serveAsset(request, (await context.params).id);
  } catch (error) {
    return jsonError(error, request);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    await dispose(findAsset((await context.params).id, session(request).owner));
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error, request);
  }
}
