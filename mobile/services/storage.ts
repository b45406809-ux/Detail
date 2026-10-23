import { supabase, auth } from './supabase';

const BUCKET = 'detail-media';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
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
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  }
  if (Array.isArray(value)) return Promise.all(value.map(signMediaValue));
  if (value && typeof value === 'object') {
    const pairs = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [key, await signMediaValue(item)] as const));
    return Object.fromEntries(pairs);
  }
  return value;
}
