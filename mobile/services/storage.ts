import { supabase, auth } from './supabase';
import { callFunction } from './functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest side of an uploaded photo. Phone cameras take 4000px+ images of several MB; 1600px is sharp on any phone screen. */
const MAX_PHOTO_EDGE = 1600;

/** Shrink and re-encode a photo to a ~200-400 KB JPEG before upload so it uploads and loads quickly on mobile data. */
async function shrinkPhoto(uri: string): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const original = await context.renderAsync();
    let image = original;
    if (Math.max(original.width, original.height) > MAX_PHOTO_EDGE) {
      context.resize(original.width >= original.height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE });
      image = await context.renderAsync();
    }
    const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return uri; // Fall back to the original file rather than blocking the upload.
  }
}

const BUCKET = 'detail-media';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_TTL_MS = 55 * 60 * 1000;
const SIGNED_URL_CACHE_LIMIT = 2000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedUrlRequests = new Map<string, Promise<string>>();
const SIGNED_URL_STORE_KEY = 'detail.signedMediaUrls.v1';
let signedUrlCacheLoaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
/** Reuse photo links from the last launch (they stay valid for up to an hour), so photos show without a server round trip. */
async function loadSignedUrlCache() {
  if (signedUrlCacheLoaded) return;
  signedUrlCacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(SIGNED_URL_STORE_KEY);
    const entries = raw ? JSON.parse(raw) as [string, { url: string; expiresAt: number }][] : [];
    const now = Date.now();
    for (const [key, value] of entries) if (value?.expiresAt > now && !signedUrlCache.has(key)) signedUrlCache.set(key, value);
  } catch { /* the cache is only an optimisation */ }
}
function persistSignedUrlCache() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const now = Date.now();
    const entries = [...signedUrlCache.entries()].filter(([, value]) => value.expiresAt > now + 60_000).slice(-300);
    void AsyncStorage.setItem(SIGNED_URL_STORE_KEY, JSON.stringify(entries)).catch(() => undefined);
  }, 1500);
}
function filename() { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function mimeTypeFromUri(uri: string) {
  const extension = uri.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', m4a: 'audio/mp4' };
  return extension ? types[extension] : undefined;
}
async function uploadUri(uri: string, path: string, onProgress?: (pct: number) => void, upsert = false) {
  const isVoiceNote = path.startsWith('chat-audio/');
  if (!auth.currentUser) throw new Error(isVoiceNote ? 'Sign in before sending a voice note.' : 'Sign in before uploading a photo.');
  if (!isVoiceNote) uri = await shrinkPhoto(uri);
  const response = await fetch(uri);
  if (!response.ok) throw new Error(isVoiceNote ? 'Could not read the voice note. Please record it again.' : 'Could not read the selected photo. Please choose it again.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error(isVoiceNote ? 'Keep voice notes under 15 MB.' : 'Choose a photo smaller than 15 MB.');
  const responseType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const contentType = responseType && (responseType.startsWith('image/') || responseType === 'audio/mp4') ? responseType : mimeTypeFromUri(uri);
  const isSupportedImage = !!contentType && ['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(contentType);
  if (!contentType || (isVoiceNote ? contentType !== 'audio/mp4' : !isSupportedImage)) {
    throw new Error(isVoiceNote ? 'Could not read the voice note. Please record it again.' : 'Choose a JPEG, PNG, WebP, or HEIC image.');
  }
  onProgress?.(0.1);
  const signed=await callFunction<{path:string;contentType:string;size:number;upsert:boolean},{url:string;path:string}>('mediaUploadUrl',{path,contentType,size:bytes.byteLength,upsert});
  const uploaded=await fetch(signed.url,{method:'PUT',headers:{'content-type':contentType,'content-length':String(bytes.byteLength)},body:bytes});
  if(!uploaded.ok)throw new Error(isVoiceNote ? 'Could not upload the voice note. Please try again.' : 'Could not upload the photo. Please try again.');
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
export function uploadChatVoiceNote(uri: string, jobId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before sending a voice note.');
  return uploadUri(uri, `chat-audio/${jobId}/${uid}/${filename()}.m4a`);
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
  await Promise.all(objectPaths.map(path=>callFunction('mediaDelete',{path:`${BUCKET}/${path}`})));
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

/** Private media URLs are issued by the authenticated marketplace gateway. */
export async function signMediaValue(value: unknown, context: { jobId?: string } = {}): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith(`${BUCKET}/`)) {
    const path = value.slice(BUCKET.length + 1);
    await loadSignedUrlCache();
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
    const request = callFunction<{path:string;jobId?:string},{url:string;expiresIn?:number}>('mediaReadUrl',{path:`${BUCKET}/${path}`, ...(context.jobId ? { jobId: context.jobId } : {})}).then(({url,expiresIn}) => {
      const providerTtlMs=Number.isFinite(Number(expiresIn))?Math.max(0,(Number(expiresIn)-5)*1000):SIGNED_URL_TTL_MS;
      const cacheTtlMs=Math.min(SIGNED_URL_TTL_MS,providerTtlMs);
      if(cacheTtlMs>0){signedUrlCache.set(cacheKey, { url, expiresAt: Date.now() + cacheTtlMs });persistSignedUrlCache();}
      while (signedUrlCache.size > SIGNED_URL_CACHE_LIMIT) {
        const oldest = signedUrlCache.keys().next().value;
        if (oldest === undefined) break;
        signedUrlCache.delete(oldest);
      }
      return url;
    }).finally(() => signedUrlRequests.delete(cacheKey));
    signedUrlRequests.set(cacheKey, request);
    return request;
  }
  // One photo that cannot be signed must not hide the whole booking or conversation list.
  if (Array.isArray(value)) {
    const items = await Promise.all(value.map(item => signMediaValue(item, context).catch(() => null)));
    return items.filter(item => item !== null);
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const nestedContext = typeof object.id === 'string' ? { ...context, jobId: object.id } : context;
    const pairs = await Promise.all(Object.entries(object).map(async ([key, item]) => {
      const signed = signMediaValue(item, nestedContext);
      return [key, await signed.catch(() => null)] as const;
    }));
    return Object.fromEntries(pairs);
  }
  return value;
}
