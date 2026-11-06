# Beta validation bug register v2

Run: `2026-11-06-follow-up`. The prior production-login failure was isolated to the test setup; no product sign-in defect has been confirmed.

| ID | Severity | Platform/build | Scenario / reproduction | Expected | Actual | Evidence / record IDs | Owner | Fix commit | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Medium, test reliability | Web dashboard; legacy smoke targeted production | Submit the configured initial-admin secret in the live site Playwright run; confirm whether sign-in reaches Overview. | Do not use production credentials for routine authenticated test journeys; prove dashboard flows with isolated fixtures. | The prior CI assertion failed at authentication and showed `Invalid login credentials`; it did not establish a dashboard product defect. Live smoke now stops at the sign-in screen. Authenticated synthetic dashboard journeys are implemented against local Supabase and await CI execution. | [CI run 42152571405](https://github.com/b45406809-ux/Detail/actions/runs/42152571405); [CI run 42158264046](https://github.com/b45406809-ux/Detail/actions/runs/42158264046) | QA | Pending | Not run |

## Test blockers (not product bugs)

| ID | Status | Blocker | Evidence / next action |
| --- | --- | --- | --- |
| BLK-001 | Open | Current production Supabase is not proven test-only; booking creation is ON. A one-time project creation attempt returned HTTP 403. | Configuration check `42156279990`; [provision attempt `42158264488`](https://github.com/b45406809-ux/Detail/actions/runs/42158264488). User is arranging isolated-project access. |
| BLK-002 | Open | No staging Supabase URL/key or isolated project ref is configured. | Configuration check `42156279990`; existing management token can inspect metadata but could not create a QA project. |
| BLK-003 | Resolved | The supplied Appetize target was verified against the EAS APK upload workflow. | Inventory `42156904686`; upload run `42151995163` resolved EAS `1858f342-02c5-41ad-9672-255b9b22b9e6` then uploaded it as target `du2xyaxoiakaw57cecgor2jfd4`. |
| BLK-004 | Open | iOS simulator EAS profile is available in source, but no isolated endpoint or iOS build is pinned. | `8480f04` added `staging-ios-simulator`; staging backend configuration is required before building a useful candidate. |
| BLK-005 | Open | Paynow sandbox credentials are absent from the protected GitHub environment. | Configuration check `42156279990`; user is arranging protected sandbox credentials. Never use live payment credentials. |
| BLK-006 | Open | Identity-provider sandbox flow is not configured; test cleaners remain `NOT_STARTED`. | Fixture tooling intentionally does not set verification success or mark legal agreements accepted. Use an official sandbox verification flow before identity lifecycle testing. |
| BLK-007 | Open | No physical Android/iPhone devices are available in this runner. | Prepare guided checks and record device/OS evidence when devices are available. |

Add findings with reproduction details, redacted logs/media, affected fixture IDs, fix commit and retest evidence. Do not put credentials or genuine customer data in this register.
