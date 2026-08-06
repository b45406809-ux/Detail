/**
 * Firebase Storage helper for photo uploads — booking reference photos
 * ("Add Photos" step) and chat attachments. `firebase/storage` is imported
 * lazily so screens that never touch a camera don't pay for it.
 */
import { auth } from './firebase';

async function getStorageModule() {
  const storageMod = await import('firebase/storage');
  const { getApp } = await import('firebase/app');
  const storage = storageMod.getStorage(getApp());

  if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
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
