# Beta validation bug register v1

Run: `2026-11-06-baseline`. Status is **Open** until a fix commit and a passing retest are linked.

| ID | Severity | Platform/build | Scenario / reproduction | Expected | Actual | Evidence / record IDs | Owner | Fix commit | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | High, release blocker | Web dashboard; CI at `795265bc4e1d2391a0d57bf6b73487149761a5d8` | Run the dashboard Playwright smoke using the configured administrator; sign-in should reach Overview. | Authenticated administrator can open Overview and routed modules. | CI timed out after 45 seconds waiting for the exact Overview heading. Root cause not yet isolated; do not assume credentials are absent. | [CI run 42152571405](https://github.com/b45406809-ux/Detail/actions/runs/42152571405); no test record created by the smoke | TBD | — | Not run |

## Test blockers (not product bugs)

| ID | Status | Blocker | Evidence / next action |
| --- | --- | --- | --- |
| BLK-001 | Open | Current production Supabase is not proven test-only; booking creation is ON. | Configuration check `42156279990`. Do not use it for marketplace writes. Provision or verify a separate backend. |
| BLK-002 | Open | No staging Supabase URL or public key is configured in the protected GitHub production environment. | Configuration check `42156279990`; inspect available Supabase management access and provision a separate project. |
| BLK-003 | Open | The supplied Appetize identifier is an app key; its immutable build ID is not in the inspection evidence. | Inventory existing Appetize builds, map to EAS `1858f342-02c5-41ad-9672-255b9b22b9e6`, and pin test sessions to that build ID. |
| BLK-004 | Open | No iOS simulator or signed physical-device candidate is pinned. | Create simulator EAS profile; confirm signing/device access for the guided iPhone checks. |
| BLK-005 | Open | Paynow sandbox credentials are not configured in the production GitHub environment. | Configuration check `42156279990`; obtain sandbox credentials or keep provider lifecycle blocked. Never use live payment credentials. |

Add findings with reproduction details, redacted logs/media, affected fixture IDs, fix commit and retest evidence. Do not put credentials or genuine customer data in this register.
