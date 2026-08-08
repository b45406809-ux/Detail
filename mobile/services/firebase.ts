import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInAnonymously,
  User as FirebaseUser,
  initializeAuth,
  getReactNativePersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  collectionGroup,
  getDocFromServer,
  increment,
  runTransaction,
  writeBatch,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration — exported so RecaptchaModal (phone-auth OTP) can consume it
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
};

const firestoreDatabaseId = process.env.EXPO_PUBLIC_FIRESTORE_DATABASE_ID;

// Prevent re-initialization during hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Use AsyncStorage for auth persistence on native
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app, firestoreDatabaseId ?? '(default)');

// Point at local emulators for development so the app runs the real server code
// (Cloud Functions, security rules) instead of any client-side shortcut.
if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  } catch {
    // Already connected (hot reload) — ignore.
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error('Firestore Error:', { operationType, path, error: errorMsg });
  throw new Error(errorMsg);
}

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch {
    // Connection test — errors are expected for missing docs
  }
}

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  collectionGroup,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInAnonymously,
  increment,
  runTransaction,
  writeBatch,
};
export type { FirebaseUser };
