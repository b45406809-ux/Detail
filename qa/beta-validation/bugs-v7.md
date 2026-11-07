# Authentication and notifications bugs v7

| Issue | State | Evidence / action |
| --- | --- | --- |
| Google ID token nonce mismatch | Fix implemented; retest pending | Fresh nonce is hashed for Google and passed to Supabase; verify real login on new Android and iOS builds. |
| SMS hook rejects phone input or hides validation errors | Fix deployed; end-to-end retest pending | Supabase phone digits are normalized, and hook errors are returned in the expected envelope. Test actual OTP delivery and verification. |
| Email code rejected | Investigation open | OTP type is now selected by the request source. Invalid/expired codes and the reported account-specific failure require further live verification. |
| Physical Android push unavailable | Blocked | Firebase Android configuration and Expo FCM credentials must be checked; no physical-device push delivery confirmed. |
| EAS Android build quota exhausted | Blocked | EAS reports free Android quota resets December 1, 2026; GitHub runner test build initiated separately. |
