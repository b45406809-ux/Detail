/**
 * Firebase Storage helper for photo uploads — booking reference photos
 * ("Add Photos" step) and chat attachments. `firebase/storage` is imported
 * lazily so screens that never touch a camera don't pay for it.
 *
 * Pointed at the local Storage emulator when either
 * EXPO_PUBLIC_USE_FIREBASE_EMULATOR or the narrower
 * EXPO_PUBLIC_USE_STORAGE_EMULATOR is 'true' — the latter lets Storage run
 * locally (free, no Blaze plan / bucket needed) while Auth/Firestore stay on
 * a real deployed project.
 *
 * TEMPORARY: while EXPO_PUBLIC_SIMULATE_FUNCTIONS is 'true', uploads are
 * skipped entirely — there's no Storage bucket at all without Blaze billing,
 * so nothing to upload to. Callers get the local file:// URI straight back,
 * which is enough to exercise the UI on the same device (the photo just
 * won't be visible to other users/devices until real Storage is deployed).
 * Remove this branch once Blaze unlocks a real bucket.
 */
import { auth } from './firebase';
import { CLOUDFLARE_API_URL, IS_SIMULATING_FUNCTIONS, STORAGE_PROVIDER } from '../utils/env';

const USE_EMULATOR =
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' ||
  process.env.EXPO_PUBLIC_USE_STORAGE_EMULATOR === 'true';

async function getStorageModule() {
  const storageMod = await import('firebase/storage');
  const { getApp } = await import('firebase/app');
  const storage = storageMod.getStorage(getApp());

  if (USE_EMULATOR) {
    const host = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';
    try {
      storageMod.connectStorageEmulator(storage, host, 9199);
    } catch {
      // Already connected (hot reload) — ignore.
    }
  }
  return { storageMod, storage };
}

async function uploadUri(uri: string, path: string, onProgress?: (pct: number) => void) {
  if (STORAGE_PROVIDER === 'cloudflare-r2') {
    if (!CLOUDFLARE_API_URL) {
      throw new Error('Cloudflare R2 is selected but EXPO_PUBLIC_CLOUDFLARE_API_URL is missing.');
    }
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Please sign in before uploading a photo.');
    const source = await fetch(uri);
    const blob = await source.blob();
    const query = new URLSearchParams({ kind: path.split('/')[0], filename: path.split('/').at(-1) ?? 'upload.jpg' });
    const response = await fetch(`${CLOUDFLARE_API_URL}/v1/uploads?${query}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': blob.type || 'image/jpeg' },
      body: blob,
    });
    const uploaded = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(uploaded.error ?? 'Photo upload failed.');
    onProgress?.(1);
    return uploaded.url as string;
  }

  if (IS_SIMULATING_FUNCTIONS && !USE_EMULATOR) {
    onProgress?.(1);
    return uri;
  }

  const { storageMod, storage } = await getStorageModule();
  const response = await fetch(uri);
  const blob = await response.blob();
  const fileRef = storageMod.ref(storage, path);

  if (!onProgress) {
    await storageMod.uploadBytes(fileRef, blob);
    return storageMod.getDownloadURL(fileRef);
  }

  return new Promise<string>((resolve, reject) => {
    const task = storageMod.uploadBytesResumable(fileRef, blob);
    task.on(
      'state_changed',
      (snap) => onProgress(snap.bytesTransferred / snap.totalBytes),
      reject,
      async () => resolve(await storageMod.getDownloadURL(fileRef))
    );
  });
}

/** Upload a single booking reference photo; returns its public download URL. */
export async function uploadJobPhoto(uri: string, onProgress?: (pct: number) => void) {
  const uid = auth.currentUser?.uid ?? 'anonymous';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  return uploadUri(uri, `job-photos/${uid}/${filename}`, onProgress);
}

/** Upload a completion / after-cleaning photo (proof of work). */
export async function uploadCompletionPhoto(uri: string, jobId: string, onProgress?: (pct: number) => void) {
  const uid = auth.currentUser?.uid ?? 'anonymous';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  return uploadUri(uri, `job-completion/${jobId}/${uid}/${filename}`, onProgress);
}

/** Upload a chat photo attachment scoped to a job thread. */
export async function uploadChatPhoto(uri: string, jobId: string) {
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  return uploadUri(uri, `chat-photos/${jobId}/${filename}`);
}

/** Upload a profile avatar photo. */
export async function uploadProfilePhoto(uri: string) {
  const uid = auth.currentUser?.uid ?? 'anonymous';
  return uploadUri(uri, `profile-photos/${uid}/avatar.jpg`);
}

/**
 * Upload a proof-of-residence photo captured during cleaner registration
 * (register-cleaner.tsx). Kept in its own bucket path so it's easy to
 * restrict access to the uploading user + staff via storage.rules, separate
 * from the public-ish profile-photos/job-photos paths.
 */
export async function uploadProofOfResidence(uri: string) {
  const uid = auth.currentUser?.uid ?? 'anonymous';
  return uploadUri(uri, `verification/${uid}/proof-of-residence.jpg`);
}
