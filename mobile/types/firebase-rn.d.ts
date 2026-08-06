// `getReactNativePersistence` lives behind @firebase/auth's "react-native" package.json
// export condition (see node_modules/@firebase/auth/dist/index.rn.d.ts). Metro resolves
// that condition correctly at bundle/runtime, but plain `tsc`'s type resolution for
// "firebase/auth" always points at the generic (non-RN) .d.ts, so it errors as a missing
// export even though the app works fine. This augments the module's types to match what
// actually ships at runtime.
//
// The top-level `export {}` is required — without it this file has no top-level
// import/export and TypeScript treats the `declare module` below as a full replacement
// of "firebase/auth" (dropping every other export) instead of an augmentation.
export {};

import type { Persistence } from '@firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
