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
 */
import { auth } from './firebase';

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
