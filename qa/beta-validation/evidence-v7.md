# Authentication and notifications evidence v7

| Evidence | Result | Scope |
| --- | --- | --- |
| Local mobile type-check and lint | Pass | Type-check passed; lint reported existing warnings and no errors. |
| SMSPOP helper tests | Pass | Four local Deno tests, including Supabase phone normalization. |
| [SMS hook deployment](https://github.com/b45406809-ux/Detail/actions/runs/42328876772) | Pass | Deploys only the signed SMS hook; no actual OTP verification. |
| [Configured SMSPOP sender test](https://github.com/b45406809-ux/Detail/actions/runs/42329137725) | Pass | Provider accepted one test SMS; user supplied a screenshot confirming receipt. This is not an Auth OTP test. |
| [EAS Android build](https://github.com/b45406809-ux/Detail/actions/runs/42328844702) | Fail | Free Android build quota exhausted. |
| [GitHub Android test build](https://github.com/b45406809-ux/Detail/actions/runs/42329012207) | Partial | APK built and uploaded from `f4f3ca1271772c678752dfb2b161cf4b280b7562`; Appetize session timed out before testing. |
| [Pinned Appetize inspection](https://github.com/b45406809-ux/Detail/actions/runs/42331423813) | Pass | Welcome, sign-in and registration screens visible on Appetize target `3hgk47ihaliblokbxiccw5zh7i`; no sign-in attempted. |
| [Pinned real email registration](https://github.com/b45406809-ux/Detail/actions/runs/42331520873) | Pass | Real emailed signup code accepted; customer onboarding persisted; disposable account cleaned. Same GitHub APK and Appetize target. |

The GitHub APK is signed with an Android debug certificate. Its signing key differs from the normal EAS release signing path; it is a test artifact and compatibility with an installed release or Google OAuth has not been established.
