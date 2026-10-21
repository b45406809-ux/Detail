import { supabase, auth } from './supabase';

const BUCKET = 'detail-media';
function filename() { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`; }
async function uploadUri(uri: string, path: string, onProgress?: (pct: number) => void) {
  if (!auth.currentUser) throw new Error('Sign in before uploading a photo.');
  const response = await fetch(uri);
  const blob = await response.blob();
  onProgress?.(0.1);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
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
  return uploadUri(uri, `profile-photos/${uid}/avatar.jpg`);
}
export function uploadCleanerPortfolioPhoto(uri: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `cleaner-portfolio/${uid}/${filename()}`);
}
export function uploadProofOfResidence(uri: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a photo.');
  return uploadUri(uri, `verification/${uid}/proof-of-residence.jpg`);
}

/** Media remains in a private bucket; signed links are generated on reads. */
export async function signMediaValue(value: unknown): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith(`${BUCKET}/`)) {
    const path = value.slice(BUCKET.length + 1);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) return '';
    return data.signedUrl;
  }
  if (Array.isArray(value)) return Promise.all(value.map(signMediaValue));
  if (value && typeof value === 'object') {
    const pairs = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [key, await signMediaValue(item)] as const));
    return Object.fromEntries(pairs);
  }
  return value;
}
