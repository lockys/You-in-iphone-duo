import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as blob from '@vercel/blob';
import { MediaError } from '../src/lib/errors';
import type { MediaInfo } from '../src/lib/composition';

export const cloudEnabled = () => process.env.VERCEL === '1' || process.env.MEDIA_STORAGE === 'blob';
export const cloudConfigured = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const prefix = 'iphone-duo/v1/';
const ttl = () => Number(process.env.MEDIA_TTL_MS || 1200000);
const sourceRetentionMs = 30 * 60 * 1000;
export type CloudAsset = {
  id: string;
  owner: string;
  readToken: string;
  expires: number;
  status: 'pending' | 'processing' | 'ready' | 'deleted';
  kind: 'source' | 'result';
  size: number;
  mime: string;
  extension: string;
  info?: MediaInfo;
};
export function assertCloud() {
  if (!cloudConfigured()) throw new MediaError('error.cloudStorage', 503);
}
export function assetKey(id: string, part: 'manifest.json' | 'source' | 'preview.mp4' | 'result.mp4') {
  if (!/^\d{13}-[a-f0-9]{48}$/.test(id)) throw new MediaError('error.expired', 404);
  return `${prefix}assets/${id}/${part}`;
}
export async function readJson<T>(key: string): Promise<{ value: T; etag: string } | null> {
  const result = await blob.get(key, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  if (result.blob.size > 65536) throw new MediaError('error.cloudStorage', 503);
  return { value: JSON.parse(await new Response(result.stream).text()) as T, etag: result.blob.etag };
}
export async function writeJson(key: string, value: unknown, etag?: string) {
  return blob.put(key, JSON.stringify(value), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    allowOverwrite: !!etag,
    ...(etag ? { ifMatch: etag } : {}),
  });
}
export async function newCloudAsset(
  owner: string,
  details: Pick<CloudAsset, 'kind' | 'size' | 'mime' | 'extension'>,
) {
  assertCloud();
  const expires = Date.now() + ttl();
  const asset: CloudAsset = {
    id: `${expires}-${randomBytes(24).toString('hex')}`,
    owner,
    readToken: randomBytes(24).toString('hex'),
    expires,
    status: 'pending',
    ...details,
  };
  await writeJson(assetKey(asset.id, 'manifest.json'), asset);
  return asset;
}
export async function getCloudAsset(id: string, owner: string, token?: string) {
  const key = assetKey(id, 'manifest.json');
  if (Number(id.split('-')[0]) <= Date.now()) throw new MediaError('error.expired', 404);
  const found = await readJson<CloudAsset>(key);
  const asset = found?.value;
  const readable =
    asset &&
    token &&
    /^[a-f0-9]{48}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(asset.readToken));
  if (
    !asset ||
    asset.id !== id ||
    asset.status === 'deleted' ||
    asset.expires <= Date.now() ||
    (asset.owner !== owner && !readable)
  )
    throw new MediaError('error.expired', 404);
  return found!;
}
export async function updateCloudAsset(asset: CloudAsset, etag: string) {
  try {
    return await writeJson(assetKey(asset.id, 'manifest.json'), asset, etag);
  } catch (error) {
    if (error instanceof blob.BlobPreconditionFailedError) throw new MediaError('error.busy', 409);
    throw error;
  }
}
export async function eraseCloudAsset(asset: CloudAsset, etag: string) {
  // Publish the tombstone first: an in-flight render cannot resurrect a deleted upload.
  await updateCloudAsset({ ...asset, status: 'deleted' }, etag);
  await blob.del(['source', 'preview.mp4', 'result.mp4'].map((part) => assetKey(asset.id, part as 'source')));
}
export function cloudMediaUrl(asset: CloudAsset) {
  return `/api/media/${asset.id}?access=${asset.readToken}`;
}
export async function cloudReadUrl(asset: CloudAsset) {
  const pathname = assetKey(asset.id, asset.kind === 'source' ? 'preview.mp4' : 'result.mp4');
  const validUntil = Math.min(asset.expires, Date.now() + 60000);
  const token = await blob.issueSignedToken({ pathname, operations: ['get'], validUntil });
  return blob.presignUrl(token, { operation: 'get', pathname, validUntil, access: 'private' });
}

// Blob conditional writes make rate limits and FFmpeg slots shared across cold starts.
export async function acquireCloud(request: Request) {
  assertCloud();
  const now = Date.now();
  const bucket = Math.floor(now / 600000);
  const address =
    process.env.VERCEL === '1'
      ? request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown'
      : 'local';
  const hash = createHash('sha256').update(address.split(',')[0].trim()).digest('hex');
  const key = `${prefix}limits/${(bucket + 1) * 600000}-${hash}.json`;
  let counted = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const found = await readJson<{ count: number }>(key);
    const count = found?.value.count || 0;
    if (count >= Number(process.env.RATE_LIMIT_MAX || 20)) throw new MediaError('error.rateLimit', 429);
    try {
      await writeJson(key, { count: count + 1 }, found?.etag);
      counted = true;
      break;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  if (!counted) throw new MediaError('error.busy', 429);
  for (let slot = 0; slot < Number(process.env.MAX_CONCURRENT_JOBS || 2); slot++) {
    const slotKey = `${prefix}slots/${slot}.json`;
    const found = await readJson<{ until: number }>(slotKey);
    if (found && found.value.until > now) continue;
    try {
      const lease = await writeJson(
        slotKey,
        { until: now + Number(process.env.REQUEST_TIMEOUT_MS || 240000) + 15000 },
        found?.etag,
      );
      return async () => {
        await writeJson(slotKey, { until: 0 }, lease.etag).catch(() => {});
      };
    } catch {
      /* Another instance claimed this slot. */
    }
  }
  throw new MediaError('error.concurrent', 429);
}

export async function sweepCloud() {
  assertCloud();
  let cursor: string | undefined;
  let removed = 0;
  // Bounded work per call. An external five-minute scheduler can supplement
  // the Hobby-compatible daily fallback configured in vercel.json.
  for (let page = 0; page < 10; page++) {
    const batch = await blob.list({ prefix, cursor, limit: 1000 });
    const expired = batch.blobs.filter((item) => {
      const match = /^iphone-duo\/v1\/(assets|limits)\/(\d{13})-/.exec(item.pathname);
      if (!match) return false;
      // Original uploads have a separate physical retention period. Use the
      // object's upload timestamp so this also works for older asset IDs.
      if (match[1] === 'assets' && item.pathname.endsWith('/source')) {
        return new Date(item.uploadedAt).getTime() + sourceRetentionMs <= Date.now();
      }
      return Number(match[2]) <= Date.now();
    });
    if (expired.length) {
      await blob.del(expired.map((item) => item.pathname));
      removed += expired.length;
    }
    if (!batch.hasMore) break;
    cursor = batch.cursor;
  }
  return removed;
}
