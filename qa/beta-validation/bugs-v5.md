# Beta validation bug register v5

Run: `2026-11-06-follow-up-4`. The prior production-login failure was isolated to test setup; the local dashboard harness origin mismatch is fixed and retested.

| ID | Severity | Platform/build | Scenario / reproduction | Expected | Actual | Evidence / record IDs | Owner | Fix commit | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Resolved, test setup | Web dashboard; legacy smoke targeted production | Submit the configured initial-admin secret in the live site Playwright run; confirm whether sign-in reaches Overview. | Do not submit production credentials; validate login with synthetic isolated fixtures. | Production credential submission was removed. The live screen smoke passes; the synthetic admin signed in and loaded the dashboard shell in CI. No product sign-in defect was reproduced. | [CI run 42152571405](https://github.com/b45406809-ux/Detail/actions/runs/42152571405); [read-only smoke run 42160651243](https://github.com/b45406809-ux/Detail/actions/runs/42160651243); [synthetic dashboard run 42161596737](https://github.com/b45406809-ux/Detail/actions/runs/42161596737) | QA | `8e7e215` | Pass, sign-in only; see BUG-002 for subsequent origin mismatch |
| BUG-002 | Resolved, test harness | Local dashboard QA; source commits `0b750d5` and `8eb76d1` | Open the locally built admin dashboard at `http://127.0.0.1:4173/admin`; sign-in and expect the Overview metrics to load. | Use an origin accepted by the local Edge Function CORS policy and load the Overview. | The harness initially used `127.0.0.1`, which the existing policy rejects. It now uses `localhost`; all local dashboard assertions pass. No product defect was found. | [Failing harness run 42161596737](https://github.com/b45406809-ux/Detail/actions/runs/42161596737); [passing retest 42162194166](https://github.com/b45406809-ux/Detail/actions/runs/42162194166) | QA | `8eb76d1` | Pass |

## Test blockers (not product bugs)

| ID | Status | Blocker | Evidence / next action |
| --- | --- | --- | --- |
| BLK-001 | Open | Current production Supabase is not proven test-only; booking creation is ON. A one-time project creation attempt returned HTTP 403. | Configuration check `42156279990`; [provision attempt `42158264488`](https://github.com/b45406809-ux/Detail/actions/runs/42158264488). User is arranging isolated-project access. |
| BLK-002 | Open | No staging Supabase URL/key or isolated project ref is configured. | Configuration check `42156279990`; existing management token can inspect metadata but could not create a QA project. |
| BLK-003 | Resolved | The supplied Appetize target was verified against the EAS APK upload workflow. | Inventory `42156904686`; upload run `42151995163` resolved EAS `1858f342-02c5-41ad-9672-255b9b22b9e6` then uploaded it as target `du2xyaxoiakaw57cecgor2jfd4`. |
| BLK-004 | Open | iOS simulator EAS profile is available in source, but no isolated endpoint or iOS build is pinned. | `8480f04` added `staging-ios-simulator`; staging backend configuration is required before building a useful candidate. |
| BLK-005 | Open | Paynow sandbox credentials are absent from the protected GitHub environment. | Configuration check `42156279990`; user is arranging protected sandbox credentials. Never use live payment credentials. |
| BLK-006 | Open | Didit API key and workflow ID are configured, but the authorized environment does not establish that they target a test tenant or provide a safe synthetic identity subject. Test cleaners remain `NOT_STARTED`. | Presence-only check `42156279990`; no provider request was sent. Fixture tooling intentionally does not set verification success or accept legal agreements. Confirm a Didit sandbox workflow and test subject before KYC lifecycle testing. |
| BLK-007 | Open | No physical Android/iPhone devices are available in this runner. | Prepare guided checks and record device/OS evidence when devices are available. |

Add findings with reproduction details, redacted logs/media, affected fixture IDs, fix commit and retest evidence. Do not put credentials or genuine customer data in this register.
