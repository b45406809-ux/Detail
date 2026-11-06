# Beta validation evidence index v1

Run: `2026-11-06-baseline`

| Evidence ID | Link / artifact | Pinned target | Result | What it proves |
| --- | --- | --- | --- | --- |
| EV-001 | [EAS APK](https://expo.dev/artifacts/eas/BPJYOZS0HFlY2eLZg3fvgdIhh7EJGpp80gXpxmrstXU.apk) | Build `1858f342-02c5-41ad-9672-255b9b22b9e6`, commit `dedbb98c7fc71d442d4cad47c9178a4c989189e3` | Available | Exact baseline APK supplied for reuse; does not prove functionality. |
| EV-002 | [Appetize build target](https://appetize.io/app/du2xyaxoiakaw57cecgor2jfd4) | Build target `du2xyaxoiakaw57cecgor2jfd4`; uploaded from the exact EAS build in EV-001 | Pass | Inventory returned this target; upload run `42151995163` resolved EAS build `1858f342-02c5-41ad-9672-255b9b22b9e6` before upload. |
| EV-003 | [Appetize inspection](https://github.com/b45406809-ux/Detail/actions/runs/42152586430) | Workflow commit `795265bc4e1d2391a0d57bf6b73487149761a5d8` | Limited pass | Device became inspectable and screenshot was captured. No business flow was exercised. |
| EV-004 | [Validate Detail](https://github.com/b45406809-ux/Detail/actions/runs/42152571405) | Commit `795265bc4e1d2391a0d57bf6b73487149761a5d8` | Fail | Mobile checks, SQL/Edge Function checks and public pages pass; admin dashboard sign-in check fails before Overview. |
| EV-005 | [Redacted configuration presence/gates](https://github.com/b45406809-ux/Detail/actions/runs/42156279990) | Commit `795265bc4e1d2391a0d57bf6b73487149761a5d8` | Pass, read-only | The staging public URL/key are absent, production booking is enabled, and current production booking-creation, bid-acceptance and payment operation switches are off. |
| EV-006 | [Appetize build inventory](https://github.com/b45406809-ux/Detail/actions/runs/42156904686) | Commit `b59de76bb7256e55aefe43cc54c93139e7896b59` | Pass | Retrieved the exact Android target ID and creation time without starting a device. |

Store screenshots, recordings and logs only as GitHub artifacts with short retention. Redact names, email addresses, phones, precise locations, auth codes, tokens and provider references before indexing.
