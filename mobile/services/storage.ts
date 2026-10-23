import { supabase, auth } from './supabase';

const BUCKET = 'detail-media';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_TTL_MS = 55 * 60 * 1000;
const SIGNED_URL_CACHE_LIMIT = 2000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedUrlRequests = new Map<string, Promise<string>>();
function filename() { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function mimeTypeFromUri(uri: string) {
  const extension = uri.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
  return extension ? types[extension] : undefined;
}
async function uploadUri(uri: string, path: string, onProgress?: (pct: number) => void, upsert = false) {
  if (!auth.currentUser) throw new Error('Sign in before uploading a photo.');
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected photo. Please choose it again.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error('Choose a photo smaller than 15 MB.');
  const responseType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const contentType = responseType?.startsWith('image/') ? responseType : mimeTypeFromUri(uri);
  if (!contentType || !['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(contentType)) {
    throw new Error('Choose a JPEG, PNG, WebP, or HEIC image.');
  }
  onProgress?.(0.1);
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { upsert, contentType });
  if (error) throw error;
  onProgress?.(1);
  return `${BUCKET}/${path}`;
}
export function uploadJobPhoto(uri: string, onProgress?: (pct: number) => void) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `job-photos/${uid}/${filename()}`, onProgress);
}
export function uploadCompletionPhoto(uri: string, jobId: string, onProgress?: (pct: number) => void) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `job-completion/${jobId}/${uid}/${filename()}`, onProgress);
}
export function uploadChatPhoto(uri: string, jobId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `chat-photos/${jobId}/${uid}/${filename()}`);
}
export function uploadSupportEvidence(uri: string, jobId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a support photo.');
  return uploadUri(uri, `support-evidence/${jobId}/${uid}/${filename()}`);
}
export async function removeSupportEvidence(paths: string[]) {
  const prefix = `${BUCKET}/support-evidence/`;
  const objectPaths = paths.filter(path => path.startsWith(prefix)).map(path => path.slice(BUCKET.length + 1));
  if (!objectPaths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(objectPaths);
  if (error) throw error;
}
export function uploadProfilePhoto(uri: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `profile-photos/${uid}/avatar.jpg`, undefined, true);
}
export function uploadCleanerPortfolioPhoto(uri: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `cleaner-portfolio/${uid}/${filename()}`);
}
export function uploadProofOfResidence(uri: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `verification/${uid}/proof-of-residence.jpg`, undefined, true);
}

/** Media remains in a private bucket; signed links are generated on reads. */
export async function signMediaValue(value: unknown): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith(`${BUCKET}/`)) {
    const path = value.slice(BUCKET.length + 1);
    const cacheKey = `${auth.currentUser?.uid ?? 'anonymous'}:${path}`;
    const now = Date.now();
    const cached = signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      signedUrlCache.delete(cacheKey);
      signedUrlCache.set(cacheKey, cached);
      return cached.url;
    }
    if (cached) signedUrlCache.delete(cacheKey);
    const pending = signedUrlRequests.get(cacheKey);
    if (pending) return pending;
    const request = supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60).then(({ data, error }) => {
      if (error) throw error;
      signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_MS });
      while (signedUrlCache.size > SIGNED_URL_CACHE_LIMIT) {
        const oldest = signedUrlCache.keys().next().value;
        if (oldest === undefined) break;
        signedUrlCache.delete(oldest);
      }
      return data.signedUrl;
    }).finally(() => signedUrlRequests.delete(cacheKey));
    signedUrlRequests.set(cacheKey, request);
    return request;
  }
  if (Array.isArray(value)) return Promise.all(value.map(signMediaValue));
  if (value && typeof value === 'object') {
    const pairs = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [key, await signMediaValue(item)] as const));
    return Object.fromEntries(pairs);
  }
  return value;
}
