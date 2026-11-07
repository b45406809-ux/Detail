# Authentication and notifications follow-up matrix v7

This supplements [matrix v6](matrix-v6.md). Android test APK build: source `f4f3ca1271772c678752dfb2b161cf4b280b7562`, GitHub run `42329012207`. The SMS hook deployment uses source `e6191d4c9d827608de3ba54656fd50c6004f9846`.

| Scenario | Status | Evidence and remaining work |
| --- | --- | --- |
| Google sign-in | Blocked | Nonce exchange corrected in source; actual Google login on Android and iOS remains unverified. |
| SMS OTP | Blocked | Hook deployed and provider test accepted and received; actual Auth OTP send and verification remain unverified. |
| Email OTP | Blocked | Code handling distinguishes signup from email OTP; reproduction and verification on the new app build remain outstanding. |
| Android push | Blocked | Firebase file variable supported in app configuration; configured Firebase credentials, device token registration and notification delivery are not verified. |
| iOS push | Not run | Physical iPhone, APNs setup and delivery evidence required. |

See [bug register v7](bugs-v7.md) and [evidence v7](evidence-v7.md).
