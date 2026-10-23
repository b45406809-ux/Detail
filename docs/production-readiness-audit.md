# Detail production readiness audit

**Snapshot:** `codex/separate-dashboard-into-routed-modules-fl7jlh` at `dae9b3b` (`Fix live test summary output`). **Audit date:** 23 October 2026. The `work` merge is excluded. This report proposes repairs; it does not apply changes to the application or deploy anything.

## Readiness decision

**Do not launch this snapshot as a production Uber-style cleaning marketplace.** It contains substantial real implementation, but its main customer, cleaner and operator journeys have blocking contract, authorization, payment-state and recovery defects. Passing builds alone does not establish that a booking can be safely fulfilled and settled.

The report records **78 findings** and a **30-capability production gap matrix**, plus five full code-traced journeys. The matrix intentionally references findings and is not 30 additional independent bugs. Registry advisory counts are affected dependency entries, not independent exploitable application vulnerabilities.

The most urgent repair groups are:

- Browser API preflight fails; the main notification insert uses the wrong physical columns; cleaner feed IDs are overwritten. See [F01](#F01), [F02](#F02), [F03](#F03).
- iOS Google setup can throw during sign-in rendering; native media upload uses the wrong format for the installed SDK; a build-only Mapbox token appears in public Expo config. See [F05](#F05), [F06](#F06), [F07](#F07).
- Direct database access does not enforce the dashboard's fine-grained permissions/MFA. Invitation and profile write privileges require explicit ACL repair/verification. See [F08](#F08), [F09](#F09), [F10](#F10).
- Booking recovery, dispatch reservation, completion review and money handling are not one coherent recoverable state machine. See [F24](#F24)–[F48](#F48).
- Admin routing/operations and campaign audience/idempotency fail important user expectations. See [F53](#F53)–[F65](#F65).

## What exists already

The active application is Supabase-based. Firebase source is retained for cutover reference. Cloudflare D1 is a legacy migration source; Cloudflare KV remains a marketing-asset channel and Turnstile supplies CAPTCHA. Do not restore the older Firebase runtime just to obtain a feature that already has a Supabase implementation.

| Surface | Implemented foundation | Production limitation |
| --- | --- | --- |
| Marketing | Responsive landing/terms/privacy, waitlist form, marketing preference and consent-gated analytics | Signup/CAPTCHA/consent and deployed API contract need repair; full public launch/download flow is absent. |
| Public blog | Published-list/article API and admin editor | Blog origins are blocked; deployment/crawler/metadata behavior is incomplete. |
| Mobile accounts | SMS/email/password/OAuth, profile onboarding and permission screens | Platform config, verified contact linking, email/recovery/deep-link and state refresh gaps. |
| Cleaner onboarding | Hosted Didit creation/decision refresh, application and agreement | No complete approval/reverification/revocation/contact lifecycle; credentials do not match configured local aliases. |
| Booking | House/car checklists, quote bidding, supplies, scheduled/instant request logic | Scope/pricing/duration mismatch, dispatch/resume/expiry/race and activity gaps. |
| Fulfilment | Native Mapbox, background/active-job location, arrival/start/completion and photos | Secret/media/state/permission issues; stale tracking and service evidence are not robust. |
| Payments | Wallet/direct methods/Paynow initiation, signed callbacks, SQL ledger helpers, encrypted payouts | Balance model, replay/refund/dispute/retry/reconciliation gaps can strand or misrepresent money. |
| Chat/safety/support | Job messages, emergency/ticket endpoints and a support list | Notification/atomicity, ownership/device lifecycle and operator case workspace are incomplete. |
| Organizations | Registration, hashed cleaner invites, membership removal | Membership is not a full team operations/business billing product and needs consistency repair. |
| Admin dashboard | MFA UI, overview, people/bookings/payments/payouts, marketing/blog, settings and invite directory | Direct DB authorization bypass, routing/DTO/filter/mutation and operational-detail gaps. Products/analytics remain skeletons. |

Existing controls worth preserving include server-side privileged workflows, explicit service-role-only financial RPCs, row locks/unique event keys, PostGIS matching and exclusion-based availability, private media storage, server-side Didit decisions, payout destination encryption and two-administrator settlement intent, Paynow SDK hash validation plus amount checks, and a durable notification queue design. Several findings concern how these controls are connected or overridden, rather than their complete absence.

## Scope, method and evidence

The inventory covers **249 tracked files**, including **36 mobile route files**, mobile services/components/config/assets, **40 site/dashboard files**, **21 active Supabase files**, legacy/cutover utilities, workflows/tooling, QA and supporting repository guidance. Locks/binary assets are inventoried rather than represented as manually reviewed application logic. Active UI/control/data paths, all Edge Function dispatch actions, the ordered migration chain and operational scripts were reviewed; late `CREATE OR REPLACE` definitions were treated as authoritative.

- Followed UI handlers into service wrappers, Edge actions, final SQL definitions, grants/RLS/storage policies and return DTOs.
- Compared frontend promises/visible controls against implemented backend behavior, including direct REST/RPC bypasses.
- Probed source contracts in an isolated VM with fake environment/auth/database adapters and network forbidden.
- Exercised the built web UI in Chromium at desktop and 375px phone width with intercepted fake auth/API data. The mocks followed the final RPC's DTOs; they do not prove live backend connectivity.
- Ran local builds, mobile type/lint/native JS export and registry dependency scans. Inspected Expo public config with a synthetic token only.
- Traced five personas through success, interruption, retry, dispute and operator steps. Earlier blockers were not used as an excuse to skip later states.

### Checks actually completed

| Check | Result / interpretation |
| --- | --- |
| `npm run build` in `site` | Pass. Main bundle approximately 533 kB / 152 kB gzip; site/admin/blog share it, so split loading is a later performance opportunity. |
| `npm run type-check` in `mobile` | Pass. Does not establish route existence or runtime service contracts. |
| `CI=1 npm run lint` in `mobile` | Pass with 33 warnings, no errors; includes stale/unused code and effect-dependency warnings. |
| Native JS export for iOS and Android | Pass using placeholder public config. Hermes bundles about 7.67/7.68 MB. This is not a signed native SDK/device build. |
| `npm run build` in `functions` | Pass. Compiles retained legacy/migration utilities, not the deployed Deno Edge Functions. |
| Isolated source probes | Confirmed invalid 204 preflight, notification column-key mismatch, lost openJobs ID, unsupported admin action success, route parsing and payout amount disagreement. |
| Chromium with mocked API | `/admin/bookings` reload renders Overview; browser Back leaves Support at a Bookings URL; a $120 revenue fixture displays $1.20; marketing phone width has a 1px overflow. |
| Expo public config canary | Synthetic private Mapbox download token is visible in the returned plugins config. No actual token value was printed. |
| `npm audit --omit=dev` | Mobile: 100 affected entries (1 critical/81 high/18 moderate). Functions: 18 (9 high/9 moderate). Root: 14 (3 critical/9 high/2 moderate). Site: zero; site full including dev also zero at audit time. |
| Narrow source-secret pattern check | No private-key-block/AWS-access-key/Stripe-live-key candidates in the scanned source. This was a limited pattern check, not a complete credential history scan. |

### Verification still required

No production database/provider writes, messages, payments, identity sessions, EAS builds or deployments were performed. Docker access was denied in the current sandbox, so migrations/RLS/SQL concurrency were **not** executed against a fresh local Supabase instance in this audit. A standalone Deno type-check was not available here. Native camera/maps/OAuth/background/notification behavior still needs signed real-device tests. Effective production grants, Supabase Auth templates/redirects, merchant BuySafe setup, DNS, server secrets and operational readiness were not queried live. Findings marked deployment-dependent/provider-validation-required must be resolved against those environments before they are treated as proven deployed exploits or working integrations.

### Severity and confidence

- **P0:** critical release blocker for the affected surface or a potentially severe authorization boundary; deployment-dependent cases retain that qualification.
- **P1:** high-impact correctness, security, financial or core journey gap; normally fix before broad public launch.
- **P2:** material usability, resilience, maintainability or scope issue; prioritize according to the launch promise.
- **Reproduced / SDK-confirmed / code-confirmed:** distinguish isolated execution, explicit installed SDK behavior and source reasoning.
- **Deployment-dependent / provider validation required / missing production evidence:** an unresolved condition or required proof, not a claim of a tested production exploit.

## Findings index

| ID | Severity | Area | Finding |
| --- | --- | --- | --- |
| [F01](#F01) | P0 | API and data contracts | Browser preflight crashes the marketplace API |
| [F02](#F02) | P1 | API and data contracts | Booking and safety notifications fail their database insert |
| [F03](#F03) | P1 | API and data contracts | Cleaner feed normalization overwrites the booking ID with undefined |
| [F04](#F04) | P1 | API and data contracts | Scheduled quotes no longer have enough job detail for cleaners |
| [F05](#F05) | P1 | Mobile authentication | Google auth configuration can crash iOS sign-in before Apple sign-in is usable |
| [F06](#F06) | P1 | Mobile media | All native uploads use an unsupported Supabase Blob path |
| [F07](#F07) | P1 | Security and privacy | Mapbox download secret appears in public Expo configuration |
| [F08](#F08) | P1 | Security and privacy | Direct database reads bypass admin permissions and MFA |
| [F09](#F09) | P0 | Security and privacy | Admin invitation write policy can permit privilege escalation under default grants |
| [F10](#F10) | P1 | Security and privacy | User field restrictions depend on grants that are not reset |
| [F11](#F11) | P1 | Security and privacy | Suspension and role changes are not enforced consistently across actions |
| [F12](#F12) | P1 | Security and privacy | Completion evidence and arrival can be fabricated without a stored photo or presence check |
| [F13](#F13) | P1 | Mobile authentication | Account deletion checks a Firebase-style claim absent from ordinary Supabase JWTs |
| [F14](#F14) | P1 | Security and privacy | Deletion leaves sensitive location/media/history data and misses some financial obligations |
| [F15](#F15) | P2 | Security and privacy | Media access is long-lived and some assigned-party avatars are unreadable |
| [F16](#F16) | P2 | Security and privacy | Rate limits can be fragmented by supplied IP headers and leave costly endpoints uncovered |
| [F17](#F17) | P2 | API and data contracts | Many requests lack bounded server-side schemas |
| [F18](#F18) | P1 | Mobile authentication | Email-code and recovery journeys lack a complete native callback contract |
| [F19](#F19) | P1 | Mobile authentication | Phone-first users cannot complete required email-based cleaner onboarding or Paynow setup |
| [F20](#F20) | P1 | Mobile authentication | Auth refresh helpers do not refresh the state used by onboarding |
| [F21](#F21) | P2 | Mobile authentication | Legal and onboarding route guards conflict with intended navigation |
| [F22](#F22) | P2 | Mobile authentication | Permission onboarding blocks customers who decline location and forgets existing OS grants |
| [F23](#F23) | P2 | API and data contracts | Service errors lose their actionable details on the client |
| [F24](#F24) | P1 | Booking and dispatch | There is no usable complete booking activity/re-entry screen |
| [F25](#F25) | P1 | Booking and dispatch | Booking, top-up and payout retries can create duplicate operations |
| [F26](#F26) | P1 | Booking and dispatch | Instant requests do not reach a clean terminal state when matching expires |
| [F27](#F27) | P1 | Booking and dispatch | Primary service shortcuts skip the Book Now choice |
| [F28](#F28) | P1 | Booking and dispatch | Address edits can retain the wrong coordinates and scheduled times are weakly validated |
| [F29](#F29) | P1 | Booking and dispatch | Instant pricing and availability duration ignore cleaning scope |
| [F30](#F30) | P1 | Booking and dispatch | Cleaner acceptance is not reserved exclusively during customer confirmation |
| [F31](#F31) | P1 | Booking and dispatch | Quote creation and rejection can race acceptance and create duplicates |
| [F32](#F32) | P1 | Booking and dispatch | Rescheduling can collide with the booking’s own existing buffer |
| [F33](#F33) | P1 | Booking and dispatch | Either party can unilaterally change an agreed booking time |
| [F34](#F34) | P1 | Booking and dispatch | Public launch status and operational kill switches do not match server enforcement |
| [F35](#F35) | P1 | Booking and dispatch | Cleaner online state, background tracking and session lifecycle are not synchronized |
| [F36](#F36) | P1 | Completion and money | Completion review controls are skipped and cleaners are sent to rate themselves |
| [F37](#F37) | P1 | Completion and money | A completion dispute does not actually hold wallet settlement or earnings release |
| [F38](#F38) | P1 | Completion and money | Wallet sub-balances and active-role-dependent top-ups do not form a consistent ledger |
| [F39](#F39) | P1 | Completion and money | Payout availability differs between the app and secure RPC |
| [F40](#F40) | P1 | Completion and money | Cancellation fees ignore who cancelled and leave wallet funds unallocated |
| [F41](#F41) | P1 | Completion and money | The latest Paynow status function removed monotonic event safeguards |
| [F42](#F42) | P1 | Completion and money | Acceptance replay can skip ownership checks and restart an unrelated payment method |
| [F43](#F43) | P1 | Completion and money | Paynow retries can leave a booking permanently INITIATING and discard old callback identity |
| [F44](#F44) | P1 | Completion and money | Pending checkout cannot reliably be resumed after dismissing or killing the app |
| [F45](#F45) | P1 | Completion and money | Payment callbacks and completion side effects lack durable recovery/reconciliation |
| [F46](#F46) | P1 | Completion and money | Refund UI records a request but does not implement a complete financial refund workflow |
| [F47](#F47) | P1 | Completion and money | BuySafe escrow behavior is asserted without an executable provider contract check |
| [F48](#F48) | P2 | Completion and money | Payout queue lacks a direct rejection path and complete payout/account recovery controls |
| [F49](#F49) | P1 | Messaging and notifications | Chat has no durable notification path and its claimed atomic batch is sequential |
| [F50](#F50) | P1 | Messaging and notifications | Notification payloads omit the routing type that the app expects |
| [F51](#F51) | P2 | Messaging and notifications | Realtime reads and media signing are expensive and several screens can spin forever |
| [F52](#F52) | P1 | Messaging and notifications | Delivery status and scheduling do not meet urgent dispatch needs |
| [F53](#F53) | P1 | Admin dashboard | Dashboard hard reloads and browser back/forward do not resolve routed modules |
| [F54](#F54) | P1 | Admin dashboard | Unsupported admin mutations return success and create a misleading audit record |
| [F55](#F55) | P1 | Admin dashboard | Admin reassignment can reopen closed jobs and disconnect cleaner payment ownership |
| [F56](#F56) | P1 | Admin dashboard | Search, filters and pagination do not honor the displayed module contract |
| [F57](#F57) | P1 | Admin dashboard | Revenue chart understates money and attention links do not open the support case |
| [F58](#F58) | P1 | Admin dashboard | Support operators cannot read or resolve the full customer problem in the current UI |
| [F59](#F59) | P2 | Admin dashboard | Admin session and access management is incomplete |
| [F60](#F60) | P1 | Organizations and discovery | Organization signup/join can leave partial state and the screen may not refresh |
| [F61](#F61) | P2 | Organizations and discovery | Favorites and cleaner discovery do not provide the promised rebooking path |
| [F62](#F62) | P2 | UI and accessibility | Readable contrast, accessible controls and mobile layout need a dedicated pass |
| [F63](#F63) | P1 | Marketing and blog | The public blog origin is blocked by its own backend |
| [F64](#F64) | P1 | Marketing and blog | An unauthenticated visitor can overwrite another email’s waitlist consent/contact data |
| [F65](#F65) | P1 | Marketing and blog | Campaign targeting is ignored and sends are not idempotent |
| [F66](#F66) | P2 | Marketing and blog | Waitlist retries, deduplication and CSV export have correctness/security gaps |
| [F67](#F67) | P2 | Marketing and blog | Trust and service promises exceed implemented product capabilities |
| [F68](#F68) | P1 | Deployment and operations | Expected credential names do not match this workspace’s configured aliases |
| [F69](#F69) | P1 | Deployment and operations | Production deployment is not gated by completed validation and can publish a partial release |
| [F70](#F70) | P1 | Deployment and operations | Automated validation does not exercise the business/security journeys it claims to support |
| [F71](#F71) | P1 | Deployment and operations | Locked mobile and payment dependency trees have unresolved advisories |
| [F72](#F72) | P1 | Deployment and operations | Firebase cutover importer has schema and ledger-loss hazards |
| [F73](#F73) | P1 if reachable | Deployment and operations | Retained Cloudflare deployment tooling can recreate an insecure obsolete service |
| [F74](#F74) | P1 | Deployment and operations | Operational observability, recovery and release readiness are not demonstrated |
| [F75](#F75) | P1 | Security and privacy | KYC and contact trust have no complete lifecycle or verified-contact binding |
| [F76](#F76) | P1 | Deployment and operations | Demo/development mode does not isolate production side effects |
| [F77](#F77) | P1 | Security and privacy | Push tokens are not revoked per device on logout or account changes |
| [F78](#F78) | P2 | UI and accessibility | Wallet and review dates still expect Firestore Timestamp objects |

## Detailed findings

<a id="F01"></a>

### F01 — Browser preflight crashes the marketplace API

**Severity:** P0 · **Evidence:** Reproduced · **Area:** API and data contracts

**Source:** [supabase/functions/marketplace-api/index.ts:857](<../supabase/functions/marketplace-api/index.ts#L857>)

**Problem and impact.** OPTIONS calls reply({}, 204), which constructs a Response with a JSON body. Fetch forbids a body for status 204. Executing the checked-in handler with an allowed localhost origin throws TypeError. Browsers preflight authenticated JSON requests, blocking the site/dashboard and public blog/waitlist calls even though native clients may work.

**Proposed fix.** Return new Response(null, {status:204, headers:...}); centralize CORS and ensure error responses include the allowed origin. Add the deployed site/dashboard/blog origins.

**Acceptance check.** An actual browser can complete OPTIONS then POST for every public and authenticated action; rejected origins remain rejected.

**Implementation status (2026-10-23).** OPTIONS now returns a bodyless 204 with the allowed CORS headers, and the origin allowlist covers the current site, dashboard, blog and local development hosts. Edge type-check passes in CI; an actual browser-to-deployed-function preflight check remains outstanding.

<a id="F02"></a>

### F02 — Booking and safety notifications fail their database insert

**Severity:** P1 · **Evidence:** Reproduced · **Area:** API and data contracts

**Source:** [supabase/functions/marketplace-api/index.ts:83](<../supabase/functions/marketplace-api/index.ts#L83>); [supabase/migrations/20261020000000_initial_schema.sql:73](<../supabase/migrations/20261020000000_initial_schema.sql#L73>)

**Problem and impact.** notify() sends userId, jobId and createdAt as JSON property names. PostgreSQL stored the unquoted schema columns as userid, jobid and createdat. PostgREST does not lowercase JSON keys. The source probe confirms the wrong keys, and the function logs the resulting insert error and returns before building the durable outbox. New quotes, assignments, status updates, instant offers, SOS and support alerts therefore lose their intended notifications. The Paynow webhook uses a separate correctly lowercased insert.

**Proposed fix.** Use generated database types and physical column names; persist the business event and notification/outbox together in a transaction rather than logging and discarding failures.

**Acceptance check.** Creating a quote, assignment, completion, support ticket and SOS produces an in-app notification plus the correct durable delivery row; inject an insert failure and verify recovery.

**Implementation status (2026-10-23).** The API now calls a service-only database function that inserts the in-app notification and Expo/Twilio delivery rows in one transaction, avoiding the incorrect direct insert payload. The durable delivery worker retries provider delivery. Provider delivery and failure recovery still require integration testing against configured providers.

<a id="F03"></a>

### F03 — Cleaner feed normalization overwrites the booking ID with undefined

**Severity:** P1 · **Evidence:** Reproduced · **Area:** API and data contracts

**Source:** [mobile/services/supabase.ts:161](<../mobile/services/supabase.ts#L161>); [mobile/app/(tabs)/home.tsx:162](<../mobile/app/(tabs)/home.tsx#L162>)

**Problem and impact.** rowToData('openJobs', row) reads row.jobId although the physical row contains jobid. It adds id:undefined. Screens build {id:snapshot.id, ...snapshot.data()}, so that undefined value overwrites the correct snapshot ID. The source probe reproduces this. Feed navigation can point to /job/undefined and bidding loses its job identity.

**Proposed fix.** Normalize the primary key from row.jobid or normalized.jobId exactly once; avoid overwriting snapshot identity with row data. Replace the compatibility shim with typed DTO adapters.

**Acceptance check.** A real lowercase openjobs row renders a stable nonempty key, opens its detail screen and submits a quote for that same UUID.

**Implementation status (2026-10-23).** The adapter now derives the open-job document ID from the physical `jobid` primary key, and the detail screen uses that ID when requesting a server-filtered booking preview. Mobile type-check passes in CI; a real-row navigation and quote submission check remains outstanding.

<a id="F04"></a>

### F04 — Scheduled quotes no longer have enough job detail for cleaners

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** API and data contracts

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:91](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L91>); [mobile/app/job/[jobId].tsx:50](<../mobile/app/job/[jobId].tsx#L50>); [mobile/app/(tabs)/home.tsx:49](<../mobile/app/(tabs)/home.tsx#L49>)

**Problem and impact.** The hardened openjobs projection intentionally removes exact location, checklist, photos and description. The detail screen still reads that projection as a full Job and expects those fields; the feed sorts by coordinates that are no longer present. Even after F03, cleaners cannot assess room/vehicle scope, see the promised before photos or establish travel distance. Simply reopening the private jobs RLS policy would leak addresses and gate/pet instructions to every verified cleaner. The detail UI also labels estimatedDuration as hours although the newer schema stores minutes.

**Proposed fix.** Design a sanitized pre-assignment job-summary API with service scope, estimated duration, approximate suburb/distance and explicitly authorized photos. Keep address, contact details and sensitive instructions participant-only.

**Acceptance check.** An eligible unassigned cleaner can price the work without seeing exact address/contact details; an unrelated customer cannot fetch that summary.

**Implementation status (2026-10-23).** The cleaner preview endpoint verifies the caller is an active, verified cleaner, checks that the booking is still open, returns normalized service scope and an approximate location, and withholds the address, customer identity, description and photos. Scheduled-nearby notifications were added for eligible cleaners, and the cleaner feed now formats the stored estimate as minutes/hours instead of mislabeling minutes as hours. End-to-end scope rendering, distance ranking and the policy for safely shareable reference photos still require validation.

<a id="F05"></a>

### F05 — Google auth configuration can crash iOS sign-in before Apple sign-in is usable

**Severity:** P1 · **Evidence:** SDK-confirmed · **Area:** Mobile authentication

**Source:** [mobile/components/SocialSignInButtons.tsx:36](<../mobile/components/SocialSignInButtons.tsx#L36>)

**Problem and impact.** The hook is called unconditionally with webClientId and androidClientId but no iosClientId. The installed expo-auth-session Google provider selects iosClientId on iOS and runs an invariant during render. Its web client ID is not the fallback. The later isGoogleConfigured check cannot prevent this hook error. Missing Android configuration causes the same render-time problem.

**Proposed fix.** Provide the correct platform client IDs, render the Google hook only inside a configured platform component, and keep Apple/email/SMS sign-in available independently. Configure native redirect schemes and Supabase provider audiences explicitly.

**Acceptance check.** Launch sign-in on both OSes with Google configured and absent; email/SMS/Apple remain usable and each OAuth round trip signs into the intended account.

**Implementation status (2026-10-23).** Google provider setup now renders only in a child component when the current platform's client ID is configured, so a missing Google ID no longer invokes the SDK invariant during sign-in screen render. Email/SMS/Apple remain independently available. Signed native OAuth round trips still require device and provider-configuration checks.

<a id="F06"></a>

### F06 — All native uploads use an unsupported Supabase Blob path

**Severity:** P1 · **Evidence:** SDK-confirmed · **Area:** Mobile media

**Source:** [mobile/services/storage.ts:8](<../mobile/services/storage.ts#L8>); [supabase/migrations/20261020001000_storage_and_financial_rpcs.sql:13](<../supabase/migrations/20261020001000_storage_and_financial_rpcs.sql#L13>)

**Problem and impact.** The shared uploadUri helper fetches a local URI into a Blob and passes that Blob to storage.upload. The installed @supabase/storage-js upload documentation explicitly warns that Blob/File/FormData do not work as intended in React Native and recommends ArrayBuffer from file bytes. This affects profile photos, before photos, completion evidence, chat and portfolio. Completion requires a photo, so upload failure can strand a job. Uploads also use upsert:true for fresh job/chat objects, while the storage UPDATE policy checks UID as the second path segment and those paths put the job UUID there. The SDK requires update/select permissions for upsert; use insert-only uploads or narrowly correct that policy.

**Proposed fix.** Read local files with a supported Expo file API, upload an ArrayBuffer, validate size/type and generate a safe extension/content type. Avoid upsert for new job/chat objects and add cancellation/progress/error handling.

**Acceptance check.** Capture and upload JPEG/HEIC/PNG on real Android and iOS devices; byte length and MIME match, signed reads work, and completion remains recoverable after upload interruption.

**Implementation status (2026-10-23).** Native uploads now send an `ArrayBuffer`, enforce a 15 MB limit and image MIME allowlist, and use insert-only writes for new job/chat objects; overwrite is limited to fixed profile/verification images. Mobile type-check and lint pass. Real camera/HEIC uploads, cancellation/progress and signed-device storage policy behavior remain unverified.

<a id="F07"></a>

### F07 — Mapbox download secret appears in public Expo configuration

**Severity:** P1 · **Evidence:** Reproduced · **Area:** Security and privacy

**Source:** [mobile/app.config.js:16](<../mobile/app.config.js#L16>)

**Problem and impact.** The private downloads token is placed in the returned plugins array. Running expo config --type public --json with a synthetic token reveals it at plugins[8][1].RNMapboxMapsDownloadToken. This confirms exposure in public config output; an installed build/updates manifest must be inspected to establish whether a real token has already shipped. This is a build secret, unlike the intentionally public map styles token.

**Proposed fix.** Use a local config plugin that reads the build-only environment variable internally and writes native build credentials without returning the secret in public app config. Ensure native credential files and build logs are protected. Rotate any real token found in shipped manifests/artifacts.

**Acceptance check.** A canary downloads token appears nowhere in public config, JS bundles, updates manifests or distributable metadata, while native SDK download succeeds.

**Implementation status (2026-10-23).** The private download token is read inside a local config plugin and is no longer serialized in public Expo config; only the intentionally public styles token is exposed. CI now runs a synthetic-canary public-config check. The check passed locally; signed build artifact inspection and real native SDK download remain outstanding.

<a id="F08"></a>

### F08 — Direct database reads bypass admin permissions and MFA

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [supabase/migrations/20261020000000_initial_schema.sql:152](<../supabase/migrations/20261020000000_initial_schema.sql#L152>); [supabase/migrations/20261020000000_initial_schema.sql:236](<../supabase/migrations/20261020000000_initial_schema.sql#L236>); [supabase/functions/marketplace-api/index.ts:77](<../supabase/functions/marketplace-api/index.ts#L77>)

**Problem and impact.** RLS commonly permits public.is_admin(), which means any adminroles row, while REST SELECT grants expose users, jobs, payments, payouts, privatekyc and support. A marketing-only admin at aal1 can query sensitive tables directly, bypassing the API's finance.read/users.manage/MFA checks and its sanitized projections. This exposes precise addresses, contact details, provider poll/session URLs and payout ciphertext without needing the dashboard.

**Proposed fix.** Use database permission helpers that check the requested permission and auth.jwt()->>'aal'; apply them to every sensitive table/view. Expose safe purpose-specific views/RPCs, revoke broad base-table reads and test direct REST access separately from Edge Functions.

**Acceptance check.** A marketing-only admin with no MFA cannot read financial/customer/KYC data through REST; a finance admin at aal2 sees only the columns their operation needs.

**Implementation status (2026-10-23).** RLS no longer grants broad admin-role access to sensitive base tables; administrator reads and writes flow through the permission-checked API. The dashboard still needs to read its own permission snapshot, so a new migration restores SELECT on `adminRoles` under the own-row RLS policy only, with a regression test for own-versus-other account access. The new ACL test awaits CI; production project grants and MFA journeys still need live verification.

<a id="F09"></a>

### F09 — Admin invitation write policy can permit privilege escalation under default grants

**Severity:** P0 · **Evidence:** Deployment-dependent · **Area:** Security and privacy

**Source:** [supabase/migrations/20261020000000_initial_schema.sql:240](<../supabase/migrations/20261020000000_initial_schema.sql#L240>); [supabase/functions/marketplace-api/index.ts:841](<../supabase/functions/marketplace-api/index.ts#L841>)

**Problem and impact.** admininvites has an ALL policy allowing any is_admin(), while the migrations never explicitly revoke its INSERT/UPDATE/DELETE table grants. Supabase projects commonly supply broad default public-schema grants; GRANT SELECT does not remove existing write rights. Under those defaults, a low-privilege admin can insert an elevated invitation for an email they own and redeem it through the service API. The production ACL was not queried, so exploitability is conditional on effective grants.

**Proposed fix.** Explicitly REVOKE all admininvites writes from anon/authenticated and make invite issuance a service-only transaction. Restrict delegation, require appropriate MFA/elevation, reject elevated values from untrusted rows and create a migration that asserts effective ACLs.

**Acceptance check.** Inspect has_table_privilege for anon/authenticated and attempt direct invitation insert/update/delete as a low-privilege admin; all writes must fail.

**Implementation status (2026-10-23).** A migration explicitly revokes all direct table privileges on admin roles, invitations and audit events from anon/authenticated. The database security suite now checks INSERT/UPDATE/DELETE privileges for both roles. Production ACL verification is still required because project-level grants are environment-specific.

<a id="F10"></a>

### F10 — User field restrictions depend on grants that are not reset

**Severity:** P1 · **Evidence:** Deployment-dependent · **Area:** Security and privacy

**Source:** [supabase/migrations/20261020000000_initial_schema.sql:256](<../supabase/migrations/20261020000000_initial_schema.sql#L256>); [supabase/migrations/20261020000000_initial_schema.sql:161](<../supabase/migrations/20261020000000_initial_schema.sql#L161>)

**Problem and impact.** The schema grants column updates to users but does not first revoke a preexisting table-level UPDATE grant. The protection trigger guards many financial/trust fields but omits cleanerOnboardingComplete, jobsCompleted, ratingAverage/ratingCount and some later-added fields such as walletRestricted/locationPoint. With default broad grants, an owner can modify fields the app treats as server-owned. This must be verified against actual ACLs; client-side filtering is not a security boundary.

**Proposed fix.** Reset table grants explicitly, grant the smallest safe column set, protect all server-owned columns in a trigger or service-only RPC and add role/ACL regression checks after every migration.

**Acceptance check.** Raw REST attempts to self-set onboarding completion, ratings, job totals, restriction flags or geospatial freshness fail regardless of client implementation.

**Implementation status (2026-10-23).** Migrations reset broad `users` UPDATE grants, allow only selected profile columns, and protect server-owned fields in the trigger. Security regression coverage now checks the table grant and direct UPDATE privileges for role, onboarding, ratings, job totals, wallet restriction, suspension, verification, account deletion and dispatch-location freshness. A live production ACL inspection remains necessary because project-level defaults can differ from local migration state.

<a id="F11"></a>

### F11 — Suspension and role changes are not enforced consistently across actions

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [supabase/functions/marketplace-api/index.ts:250](<../supabase/functions/marketplace-api/index.ts#L250>); [supabase/functions/marketplace-api/index.ts:297](<../supabase/functions/marketplace-api/index.ts#L297>); [supabase/functions/marketplace-api/index.ts:359](<../supabase/functions/marketplace-api/index.ts#L359>)

**Problem and impact.** getUser verifies identity but does not enforce a central account-state policy. Some actions check suspended/banned/profile eligibility; creation, role changes to CUSTOMER, active-job location and several lifecycle actions do not. A cleaner can switch active role during an assignment, disappear from cleaner lists and then fail SQL transitions that require the active role CLEANER. Existing sessions and the distinction between temporary suspension and auth ban need explicit handling.

**Proposed fix.** Separate capabilities/verified cleaner status from the UI's active view role. Enforce account state centrally for relevant actions, revoke sessions where appropriate and allow only safe resolution actions for suspended users with active work.

**Acceptance check.** Suspend/ban each role while a session is active; creation/dispatch/payout permissions follow the policy, while history/support access and active-job resolution remain controlled.

<a id="F12"></a>

### F12 — Completion evidence and arrival can be fabricated without a stored photo or presence check

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [supabase/migrations/20261020012000_fix_completion_photo_rpc.sql:37](<../supabase/migrations/20261020012000_fix_completion_photo_rpc.sql#L37>); [supabase/migrations/20261020010000_marketplace_hardening.sql:209](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L209>)

**Problem and impact.** add_completion_photo verifies only a path prefix; it does not check storage.objects existence, object owner, size or MIME. A modified client can add a nonexistent own-prefix path and satisfy the completion-photo count. mark_booking_arrived only checks actor/status, so arrival and start can be recorded remotely. Together these weaken proof of service even though financial settlement is server-side.

**Proposed fix.** Verify uploaded object metadata in a transactional evidence registration step. Use a recent location/geofence check and/or customer start PIN, with an explicit support override for GPS failure. Treat photos as evidence rather than proof that work occurred.

**Acceptance check.** A nonexistent photo path, another user's object and a remote/stale arrival are rejected; support can handle legitimate permission/GPS failures with an audited override.

**Implementation status (2026-10-23).** Completion-photo registration checks the stored object owner, MIME type and size; arrival requires a current coordinate within 300 m. A database regression test now covers forged paths, remote rejection and persisted in-range arrival. Cross-user object, stale-GPS and audited support-override cases remain unverified.

<a id="F13"></a>

### F13 — Account deletion checks a Firebase-style claim absent from ordinary Supabase JWTs

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Mobile authentication

**Source:** [supabase/functions/marketplace-api/index.ts:683](<../supabase/functions/marketplace-api/index.ts#L683>); [mobile/app/(tabs)/profile.tsx:139](<../mobile/app/(tabs)/profile.tsx#L139>)

**Problem and impact.** Deletion treats a missing auth_time claim as zero, then rejects any token more than five minutes old. Ordinary Supabase access tokens carry iat/amr authentication timestamps rather than Firebase's auth_time. There is no app flow that obtains the required claim. Eligible users can be repeatedly told to sign in again without ever passing the check.

**Proposed fix.** Implement recent authentication using verified Supabase session/authentication-method data or a purpose-bound server challenge. Offer a visible reauthentication path and sign out/clear local state after successful deletion.

**Acceptance check.** A freshly reauthenticated email, phone, Google and Apple user can delete an eligible account; an old or stolen session cannot.

**Implementation status (2026-10-23).** Account deletion now checks the verified current access token’s Supabase `amr` authentication-method timestamp, rather than the account-wide `last_sign_in_at` value that another device can refresh. A recent sign-in on this same session is required. Provider-specific reauthentication and stale-session behavior still need signed-device verification.

<a id="F14"></a>

### F14 — Deletion leaves sensitive location/media/history data and misses some financial obligations

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [supabase/migrations/20261020003000_admin_and_privacy.sql:54](<../supabase/migrations/20261020003000_admin_and_privacy.sql#L54>); [supabase/functions/marketplace-api/index.ts:678](<../supabase/functions/marketplace-api/index.ts#L678>)

**Problem and impact.** close_account clears users.location but not later-added locationPoint/locationUpdatedAt; it does not remove storage objects or sanitize jobs.location, jobs.data, messages, bids and support JSON. deletion checks only PENDING payouts, not APPROVED, and close_account's payment list misses direct AUTHORIZED/WALLET CAPTURED obligations on completed jobs. The SQL anonymization and Auth deletion are separate steps with no recovery job. Data can be partly erased while authentication remains active, or financial/support records can remain linked to identifiable media.

**Proposed fix.** Define a retained-record/redaction policy; block every unresolved obligation, close/revoke sessions, enqueue durable deletion/redaction across DB, storage and providers, and reconcile failures. Preserve legally required financial records with a pseudonymous identifier.

**Acceptance check.** Seed every media folder, precise coordinate column and pending/approved/captured obligation; deletion either blocks clearly or fully executes the documented redaction with a retryable audit trail.

**Implementation status (2026-10-23).** The latest `close_account` migration clears precise location fields and booking address/scope/media references, blocks pending or approved payouts and unresolved provider-payment states, and the API removes the account's private media before soft-deleting Auth. A database regression test now covers approved-payout and authorized-payment blocking plus location and retained-booking redaction. Media removal failure recovery, all provider/payment states and residual support/evidence retention still require broader verification.

<a id="F15"></a>

### F15 — Media access is long-lived and some assigned-party avatars are unreadable

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [mobile/services/storage.ts:50](<../mobile/services/storage.ts#L50>); [supabase/migrations/20261020005000_client_runtime_access.sql:18](<../supabase/migrations/20261020005000_client_runtime_access.sql#L18>)

**Problem and impact.** The adapter signs every storage path for seven days. Existing links continue to work after role changes/removal during their lifetime, while failed signing is silently converted to an empty string. Assigned cleaners have no equivalent policy to read a customer's private profile photo, so copied customerPhoto paths in jobs can become blank. The app also previews raw detail-media paths immediately after upload.

**Proposed fix.** Use short-lived purpose-specific signed URLs with controlled refresh/cache, preserve structured media errors and add narrowly scoped participant avatar access. Sign upload previews separately; keep database paths stable.

**Acceptance check.** Customer/cleaner avatars and job evidence display for authorized parties, unauthorized reads fail, and URL expiry/revocation behavior matches the privacy policy.

**Implementation status (2026-10-23).** Mobile media links now expire after one hour and signing failures are surfaced instead of converted to blank values. A new storage policy lets the assigned cleaner read the customer's private profile photo while leaving verified cleaner avatars discoverable to authenticated customers under the existing policy. RLS regression coverage checks both paths and denies an unrelated account's access to the customer photo. Existing signed URLs remain usable until expiry, and refresh/caching behavior plus device rendering still need verification.

<a id="F16"></a>

### F16 — Rate limits can be fragmented by supplied IP headers and leave costly endpoints uncovered

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [supabase/functions/marketplace-api/index.ts:27](<../supabase/functions/marketplace-api/index.ts#L27>); [supabase/functions/marketplace-api/index.ts:217](<../supabase/functions/marketplace-api/index.ts#L217>)

**Problem and impact.** The limiter keys action+actor+IP and trusts cf-connecting-ip/x-real-ip/x-forwarded-for without an independent per-actor bucket. Deployment must guarantee those headers are overwritten; otherwise changing a header creates a fresh quota. Didit refresh, payment polls/retries, public signup and several admin operations have no corresponding bounded limiter. Expired rate-limit rows have no cleanup.

**Proposed fix.** Use a trusted ingress-derived address, separate actor/IP/global budgets and provider-specific limits; clean expired counters. Add rate policies to polling, retries, public writes and expensive search/media-signing operations.

**Acceptance check.** Changing client-supplied forwarding headers cannot reset an account quota; concurrent limits are atomic and legitimate recovery remains usable.

**Implementation status (2026-10-23).** The limiter now uses an actor bucket plus only `cf-connecting-ip`; client `x-forwarded-for` and `x-real-ip` values are ignored, with Deno regression coverage for header handling. Paynow booking and wallet status polling now have per-account limits. The scheduled delivery worker now removes expired rate-limit rows in bounded, skip-locked batches, backed by an expiry index and database test. Broader action coverage and confirmation that production ingress overwrites the Cloudflare header remain outstanding.

<a id="F17"></a>

### F17 — Many requests lack bounded server-side schemas

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** API and data contracts

**Source:** [supabase/functions/marketplace-api/index.ts:860](<../supabase/functions/marketplace-api/index.ts#L860>); [supabase/functions/marketplace-api/index.ts:298](<../supabase/functions/marketplace-api/index.ts#L298>)

**Problem and impact.** The dispatcher accepts arbitrary JSON without a body-size cap or per-action schema. createBooking stores the whole booking JSON, trusts customer display fields, description/time data and has much weaker scheduled-coordinate validation than instant mode. Several numeric handlers rely on comparisons that do not reject NaN/Infinity, and schema errors become generic 500s. Client controls are easy to bypass.

**Proposed fix.** Introduce bounded discriminated request schemas, finite numeric/UUID/date checks, server-derived identity fields and constrained JSON columns. Return stable safe error codes and field-level validation messages.

**Acceptance check.** Malformed/oversized requests and spoofed display/identity fields are rejected before writes; scheduled and instant bookings obey consistent validation.

**Implementation status (2026-10-23).** The dispatcher now caps JSON bodies at 1 MiB, validates top-level/action object shape, and booking creation validates checklist size, photo ownership, finite budget, bounded coordinates and custom schedule dates. This pass also rejects non-finite cleaner radius/experience, payout and budget values and normalizes invalid admin page sizes. A complete per-action schema registry, stricter text/array bounds, and consistent validation for every lifecycle/provider action remain open.

<a id="F18"></a>

### F18 — Email-code and recovery journeys lack a complete native callback contract

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Mobile authentication

**Source:** [mobile/services/emailAuth.ts:9](<../mobile/services/emailAuth.ts#L9>); [mobile/services/supabase.ts:89](<../mobile/services/supabase.ts#L89>); [mobile/app/_layout.tsx:17](<../mobile/app/_layout.tsx#L17>)

**Current implementation and remaining gap.** The mobile app implements email OTP verification and a native `detail://` callback handler for PKCE codes, token hashes, and access/refresh token links. Password signup and email-code requests now set an explicit app callback; the reset flow uses its dedicated reset route. Confirmation, sign-in, recovery and email-change templates are versioned in Supabase config and include the code/link expected by the app. The production Supabase redirect allowlist and SMTP delivery still need to be verified, and real signup/recovery messages need device testing on iOS and Android.

**Proposed fix.** Choose explicit OTP versus magic-link contracts, configure versioned templates, add deep-link handlers and recovery screens, exchange PKCE codes safely and preserve intended navigation after auth.

**Acceptance check.** Complete new email-code signup, returning login, password signup/verification and forgotten-password recovery from real emails on both native OSes.

<a id="F19"></a>

### F19 — Phone-first users cannot complete required email-based cleaner onboarding or Paynow setup

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Mobile authentication

**Source:** [mobile/app/register-cleaner.tsx:55](<../mobile/app/register-cleaner.tsx#L55>); [supabase/functions/marketplace-api/index.ts:241](<../supabase/functions/marketplace-api/index.ts#L241>); [mobile/services/phoneAuth.ts:21](<../mobile/services/phoneAuth.ts#L21>); [supabase/migrations/20261020000000_initial_schema.sql:187](<../supabase/migrations/20261020000000_initial_schema.sql#L187>)

**Current implementation and remaining gap.** The app now provides an account email screen that links an address with `supabase.auth.updateUser`, confirms it through a `detail://` callback, and refreshes the profile; cleaner onboarding directs phone-first users to add email before proceeding. The profile trigger synchronizes only Supabase-confirmed phone values from `auth.users`. This addresses the reported dead end in code. Provider email conflicts, confirmation delivery, and the full phone-first cleaner-to-Paynow journey still need integration testing against configured Supabase Auth and Paynow environments.

**Proposed fix.** Add verified email linking to the existing Supabase identity, with clear duplicate-account/merge handling and contact recovery. Surface the requirement before incurring KYC or starting checkout.

**Acceptance check.** A fresh SMS-only user adds and verifies an email without creating another user ID, completes cleaner onboarding and can pay; existing-email conflicts have a safe path.

<a id="F20"></a>

### F20 — Auth refresh helpers do not refresh the state used by onboarding

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Mobile authentication

**Source:** [mobile/services/supabase.ts:47](<../mobile/services/supabase.ts#L47>); [mobile/services/supabase.ts:37](<../mobile/services/supabase.ts#L37>); [mobile/context/AuthContext.tsx:76](<../mobile/context/AuthContext.tsx#L76>)

**Current implementation and remaining gap.** `compatUser.reload` stores the authoritative `getUser()` result, `getIdToken(true)` refreshes the Supabase session, and `AuthContext.refreshProfile` fetches and stores the latest database profile. Auth changes clear the previous profile before attaching the next user's listener. Profile-listener failures now stop route guards from treating a failed read as a missing profile and show a retry action that reattaches the listener. Email confirmation/account switching still need device testing under network failure.

**Proposed fix.** Use native Supabase auth/session APIs and explicit profile refetches, update state from authoritative returned data, clear profile on user changes and expose retryable loading/error states.

**Acceptance check.** Verify email in another app, return and tap refresh; onboarding unblocks immediately. Account switch and initial network failure never expose stale profile data or an endless spinner.

<a id="F21"></a>

### F21 — Legal and onboarding route guards conflict with intended navigation

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Mobile authentication

**Source:** [mobile/app/_layout.tsx:27](<../mobile/app/_layout.tsx#L27>); [mobile/app/(auth)/sign-in.tsx:53](<../mobile/app/(auth)/sign-in.tsx#L53>); [mobile/app/(auth)/create-profile.tsx:90](<../mobile/app/(auth)/create-profile.tsx#L90>)

**Current implementation and remaining gap.** Signed-out users can open the customer agreement and privacy policy, and logged-in users now bypass onboarding redirects while reading those legal routes. Authenticated non-legal routes remain gated by agreement, profile and permission state. Agreement acceptance is recorded server-side with document version and timestamp. The privacy policy's wording and dates still require a legal review against current provider and retention practices.

**Proposed fix.** Allow public legal/recovery routes, gate authenticated routes by capability and onboarding state consistently, and record versioned terms acceptance on the server.

**Acceptance check.** Signed-out users can read terms/privacy and return to signup; incomplete users cannot jump to booking; accepted document version/time can be retrieved for audit.

<a id="F22"></a>

### F22 — Permission onboarding blocks customers who decline location and forgets existing OS grants

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Mobile authentication

**Source:** [mobile/app/(auth)/permissions.tsx:31](<../mobile/app/(auth)/permissions.tsx#L31>); [mobile/app/(auth)/permissions.tsx:59](<../mobile/app/(auth)/permissions.tsx#L59>)

**Problem and impact.** The permission screen initializes grants as empty instead of querying the OS, and refuses to continue without foreground location even though manual address entry exists. A denied-permanently user gets an OK-only alert without a settings link. Customers can be locked out of booking/history unnecessarily.

**Current implementation and remaining gap.** The permission screen now reads existing foreground-location and notification grants, allows customers to continue without location for manual address entry, and reserves background-location requests for cleaner availability. Permanently denied location and notification requests now offer a device Settings shortcut. Device-level testing across fresh, pre-granted and permanently denied states remains outstanding.

**Acceptance check.** Fresh, already-granted, denied and permanently-denied installs each have a clear usable path; customer booking works with a manually confirmed location.

<a id="F23"></a>

### F23 — Service errors lose their actionable details on the client

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** API and data contracts

**Source:** [mobile/services/functions.ts:6](<../mobile/services/functions.ts#L6>); [site/src/admin/api.ts:19](<../site/src/admin/api.ts#L19>); [mobile/app/(auth)/sign-in.tsx:145](<../mobile/app/(auth)/sign-in.tsx#L145>)

**Current implementation and remaining gap.** The mobile and admin API wrappers now parse the structured error response carried by Supabase FunctionsHttpError, while the Edge API returns safe domain messages and hides unexpected server exceptions. Mobile password and email-code sign-in now maps Supabase Auth codes to actionable, user-safe messages, and booking creation surfaces its sanitized API error. Other screens still replace some upload, database and provider failures with generic messages; operation-specific recovery and cross-journey error tests remain open.

**Proposed fix.** Parse the safe structured error body from FunctionsHttpError.context, adopt Supabase auth codes and display operation-specific recovery actions. Preserve user input on retry and log only redacted diagnostics.

**Acceptance check.** Exercise validation, insufficient balance, auth expiry, provider outage and network loss; users see the right next action and no secret/provider body is exposed.

<a id="F24"></a>

### F24 — There is no usable complete booking activity/re-entry screen

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [mobile/app/(tabs)/_layout.tsx:50](<../mobile/app/(tabs)/_layout.tsx#L50>); [mobile/app/(tabs)/home.tsx:127](<../mobile/app/(tabs)/home.tsx#L127>); [mobile/app/history.tsx:66](<../mobile/app/history.tsx#L66>)

**Current implementation and remaining gap.** The Activity tab now lists pending, active and terminal jobs for both customer and cleaner participant IDs, including bookings created under the other role. It routes scheduled pending requests to their offer list and other jobs back to tracking, and displays retryable load errors. The first version caps each participant query at 100 records and does not provide cursor pagination or a dedicated payment-resume action; those remain necessary for a complete history and recovery flow.

**Proposed fix.** Implement an Activity screen with pending, upcoming, active, needs-action and past bookings, server pagination and a clear next action based on payment/lifecycle state. Open each booking by participant identity, independent of current view role.

**Acceptance check.** Create multiple future bookings plus a pending request, terminate/relaunch the app, switch roles and recover every item and required payment action.

<a id="F25"></a>

### F25 — Booking, top-up and payout retries can create duplicate operations

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [mobile/app/booking/create.tsx:211](<../mobile/app/booking/create.tsx#L211>); [supabase/functions/marketplace-api/index.ts:511](<../supabase/functions/marketplace-api/index.ts#L511>); [supabase/functions/marketplace-api/index.ts:534](<../supabase/functions/marketplace-api/index.ts#L534>); [supabase/migrations/20261020010000_marketplace_hardening.sql:97](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L97>)

**Current implementation and remaining gap.** Payout requests persist an operation key until the server confirms creation, wallet top-ups persist a per-user, amount-scoped key across network failures, booking creation persists a key for each booking intent, and Paynow retries preserve a key across an uncertain response. The booking RPC serializes retries by actor and key and returns only that actor's original booking. Regression tests cover booking retry reuse and ensure a key cannot cross customer accounts; real provider response-loss testing for payment flows remains outstanding.

**Proposed fix.** Persist one operation UUID per user intent across retries/restarts; enforce actor-scoped uniqueness transactionally and return the original result. Add idempotency to top-up/payout creation and separate retrying from starting a new transaction.

**Acceptance check.** Drop the first response after commit and retry concurrently or after relaunch: exactly one booking/payment/payout exists and exactly one amount is reserved.

<a id="F26"></a>

### F26 — Instant requests do not reach a clean terminal state when matching expires

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [supabase/functions/delivery-worker/index.ts:59](<../supabase/functions/delivery-worker/index.ts#L59>); [supabase/functions/marketplace-api/index.ts:328](<../supabase/functions/marketplace-api/index.ts#L328>); [mobile/app/tracking/[jobId].tsx:662](<../mobile/app/tracking/[jobId].tsx#L662>)

**Problem and impact.** The worker expires instantoffers but does not expire/cancel the pending job or its openjobs row. A request can remain PENDING after its three-minute matching deadline, appear in a scheduled feed and retain misleading controls. Failed post-create matching can also leave a committed job even though the API returns an error. Accepted-but-unconfirmed customer requests have no payment-confirmation deadline or release flow.

**Proposed fix.** Use explicit matching/awaiting-customer/expired states, transactional creation plus dispatch outbox, and scheduled recovery that releases offers and safely closes or reschedules abandoned requests. Let users convert to a scheduled request without duplicating it.

**Acceptance check.** No-candidate, all-declined, expired, dispatch-failure and customer-abandonment cases each reach a defined recoverable state with no stale open feed row.

<a id="F27"></a>

### F27 — Primary service shortcuts skip the Book Now choice

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [mobile/app/booking/create.tsx:68](<../mobile/app/booking/create.tsx#L68>); [mobile/app/booking/create.tsx:272](<../mobile/app/booking/create.tsx#L272>)

**Problem and impact.** Passing a preselected category starts the wizard at CHECKLIST, while SCHEDULED versus INSTANT selection exists only on CATEGORY and defaults to SCHEDULED. House/Car shortcuts therefore skip the only normal Book Now control unless the user discovers they can go back a step. This hides the headline instant-matching functionality.

**Proposed fix.** Make booking mode an explicit reachable step/control for all entry paths or pass it intentionally from Home. Preserve chosen service/mode while moving through the wizard.

**Acceptance check.** Enter via Home House, Home Car and generic booking; Book Now and scheduled modes are clearly selectable in every supported entry path.

<a id="F28"></a>

### F28 — Address edits can retain the wrong coordinates and scheduled times are weakly validated

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [mobile/app/booking/create.tsx:201](<../mobile/app/booking/create.tsx#L201>); [mobile/app/booking/create.tsx:54](<../mobile/app/booking/create.tsx#L54>); [supabase/functions/marketplace-api/index.ts:313](<../supabase/functions/marketplace-api/index.ts#L313>)

**Problem and impact.** After selecting current location, editing address text does not invalidate those coordinates. Submission geocodes only when coordinates are missing, so cleaners can be sent to the old position. Scheduled requests can store 0,0 if geocoding fails, and custom/past dates and out-of-area locations are not consistently rejected by the API. TODAY resolves to now, TOMORROW to exactly 24 hours later, without a defined service window/timezone.

**Proposed fix.** Maintain one confirmed address+pin object; clear/reconfirm coordinates on edits, add search/map pin correction and enforce service zones, location validity, lead times and explicit local service windows on the server.

**Acceptance check.** Select current GPS then type another address, book across timezones/day boundaries and submit past/out-of-zone coordinates; the final pin/time must be correct or clearly rejected.

<a id="F29"></a>

### F29 — Instant pricing and availability duration ignore cleaning scope

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [supabase/functions/marketplace-api/index.ts:310](<../supabase/functions/marketplace-api/index.ts#L310>); [supabase/migrations/20261020010000_marketplace_hardening.sql:112](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L112>); [mobile/constants/services.ts:4](<../mobile/constants/services.ts#L4>)

**Problem and impact.** Fixed prices depend only on serviceId plus supplies. Property size, rooms, condition, vehicle details and add-ons captured by the wizard do not affect the instant quote. The client does not send a derived duration; SQL defaults to 120 minutes even for a basic car wash or deep house clean. Availability blocks and cleaner payout expectations are therefore detached from actual work.

**Proposed fix.** Create a versioned server-side service catalog with supported scope, base units, add-ons, duration/capacity and service-area pricing. Persist an immutable quote snapshot and require a reviewed change-order for extra work.

**Acceptance check.** A small wash and a large/deep house request receive appropriate price/duration; unsupported scopes request a quote instead of a misleading instant fixed price.

<a id="F30"></a>

### F30 — Cleaner acceptance is not reserved exclusively during customer confirmation

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:274](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L274>); [supabase/migrations/20261020010000_marketplace_hardening.sql:288](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L288>)

**Problem and impact.** An accepted instant offer inserts a PENDING bid and leaves the job PENDING without reserving cleaner availability. The same cleaner can accept other instant requests while waiting for customer payment. The check for an already ACCEPTED bid does not match the PENDING bid just created. Assignment constraints eventually stop overlapping final assignments, but customers can pay/accept against promises that cannot all be fulfilled.

**Proposed fix.** Use a short exclusive cleaner reservation linked to the offer and customer-confirmation deadline; lock/revalidate offers, payment intent and availability together. Release or advance to another candidate on timeout.

**Acceptance check.** Two customers confirm competing instant requests at the same time; exactly one gets that cleaner and the other receives a clear alternative without a stranded charge.

<a id="F31"></a>

### F31 — Quote creation and rejection can race acceptance and create duplicates

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [supabase/functions/marketplace-api/index.ts:431](<../supabase/functions/marketplace-api/index.ts#L431>); [supabase/functions/marketplace-api/index.ts:447](<../supabase/functions/marketplace-api/index.ts#L447>); [supabase/migrations/20261020000000_initial_schema.sql:53](<../supabase/migrations/20261020000000_initial_schema.sql#L53>)

**Problem and impact.** The API checks job eligibility then inserts/updates in separate requests with no locked job state, and the schema has no unique active quote per cleaner/job. The UI's alreadyBid check is bypassable. A request started before assignment can insert a new pending bid after assignment, and rejectBid can race an acceptance without a coherent outcome.

**Proposed fix.** Move quote issuance/withdrawal/rejection into transactional RPCs locking the job, enforce one active quote per cleaner/job and compare versions/status. Return a stable result for retries and distinguish expiry from rejection.

**Acceptance check.** Concurrent duplicate quote submissions and accept/reject/expire races preserve one consistent accepted quote and never leave a new open quote on a closed job.

<a id="F32"></a>

### F32 — Rescheduling can collide with the booking’s own existing buffer

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:332](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L332>); [supabase/migrations/20261020010000_marketplace_hardening.sql:64](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L64>)

**Problem and impact.** The exclusion constraint is immediate, and the reschedule trigger updates BOOKING and BUFFER rows in separate statements. Moving a two-hour booking 30 minutes later makes its new booking row overlap its old buffer before that buffer is moved, causing a false availability rejection even if no other booking exists.

**Proposed fix.** Replace that booking's blocks together atomically, or use a correctly deferred exclusion strategy within a transactional reschedule RPC. Keep the final exclusion check against other jobs/manual blocks.

**Acceptance check.** Move one assigned booking forward/backward by 30 minutes and across another booking: self-only moves succeed; genuine cleaner overlaps fail and preserve the original blocks.

<a id="F33"></a>

### F33 — Either party can unilaterally change an agreed booking time

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:374](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L374>); [supabase/functions/marketplace-api/index.ts:410](<../supabase/functions/marketplace-api/index.ts#L410>)

**Problem and impact.** A customer or cleaner can immediately change scheduledDateTime, including a previously instant request, without the other participant accepting material changes. The update does not consistently refresh scheduledTime/timePreference/openjobs summary or reminders. An accepted cleaner can be committed to an inconvenient time with only a best-effort notification.

**Proposed fix.** Make rescheduling a proposal/acceptance workflow after assignment, with expiry, quote/fee impact and a no-penalty decline policy. Update all schedule projections/reminders and preserve the prior agreement until acceptance.

**Acceptance check.** Both actors propose, accept, decline and ignore a time change; nobody is silently committed, and all screens show the same accepted schedule.

<a id="F34"></a>

### F34 — Public launch status and operational kill switches do not match server enforcement

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [supabase/seed.sql:3](<../supabase/seed.sql#L3>); [supabase/functions/marketplace-api/index.ts:301](<../supabase/functions/marketplace-api/index.ts#L301>); [site/src/supabase.ts:10](<../site/src/supabase.ts#L10>); [supabase/functions/marketplace-api/index.ts:193](<../supabase/functions/marketplace-api/index.ts#L193>)

**Problem and impact.** The seeded/site beta flag bookingEnabled=false says bookings are closed, but createBooking ignores that flag and checks different disableNewBookings/maintenance properties. waitlistEnabled is enforced in the UI but not joinWaitlist. getBetaConfig does not incorporate operations switches, and several retry/settlement actions bypass payment pause checks. Opening/pausing the business has inconsistent meanings.

**Proposed fix.** Define one documented configuration contract and explicit launch/capability gates in the API/database. Fail safely on unavailable configuration and distinguish blocking new work from allowing necessary settlement/recovery.

**Acceptance check.** Toggle each gate while clients are open and call endpoints directly; public copy, mobile controls and server behavior agree without preventing safe closure/refunds.

<a id="F35"></a>

### F35 — Cleaner online state, background tracking and session lifecycle are not synchronized

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Booking and dispatch

**Source:** [mobile/app/(tabs)/home.tsx:72](<../mobile/app/(tabs)/home.tsx#L72>); [mobile/services/locationTracking.ts:7](<../mobile/services/locationTracking.ts#L7>); [mobile/app/(tabs)/profile.tsx:156](<../mobile/app/(tabs)/profile.tsx#L156>)

**Problem and impact.** cleanerStatus is initialized once and never synchronized from changing profile status, so the UI can say offline while the server is online or vice versa. Background location is stopped only by the Home toggle, not on logout/role switch/deletion. Returning to an online account does not reliably restart/reconcile its task, and a new cleaner defaults to AVAILABLE. Tracking does not surface freshness; route requests run whenever coordinate changes arrive.

**Proposed fix.** Implement an availability lifecycle manager tied to auth, capabilities, app foreground and active assignment. Start/stop tasks explicitly, reconcile server presence, expire stale online leases and display location timestamps/errors. Debounce/cancel route requests.

**Acceptance check.** Restart, logout, switch roles, revoke permission and lose network while online/on-job; the visible state matches server/task state and location sharing obeys consent.

<a id="F36"></a>

### F36 — Completion review controls are skipped and cleaners are sent to rate themselves

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [mobile/app/tracking/[jobId].tsx:183](<../mobile/app/tracking/[jobId].tsx#L183>); [mobile/app/tracking/[jobId].tsx:660](<../mobile/app/tracking/[jobId].tsx#L660>); [supabase/functions/marketplace-api/index.ts:563](<../supabase/functions/marketplace-api/index.ts#L563>)

**Problem and impact.** When the job becomes COMPLETED, the listener immediately moves the customer to PAYMENT and the cleaner to RATING. The completion-confirm/report-issue controls exist only in the TRACKING render, which is bypassed. The cleaner sees 'Rate your cleaner', but the rating RPC only accepts the customer. Reopening an already paid/rated completed booking also restarts PAYMENT rather than showing its receipt.

**Proposed fix.** Derive a role-specific next action from authoritative completion response/payment/rating state. Keep evidence review and dispute reachable before settlement; provide a cleaner earnings/receipt view and an idempotent completed-booking detail screen.

**Acceptance check.** Each role completes, disputes, leaves/reopens and revisits a paid/rated booking; all controls remain appropriate and no duplicate payment/rating is requested.

<a id="F37"></a>

### F37 — A completion dispute does not actually hold wallet settlement or earnings release

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:635](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L635>); [supabase/migrations/20261020002000_marketplace_transactions.sql:185](<../supabase/migrations/20261020002000_marketplace_transactions.sql#L185>); [supabase/migrations/20261020008000_paynow_completion_ledger.sql:1](<../supabase/migrations/20261020008000_paynow_completion_ledger.sql#L1>)

**Problem and impact.** Dispute records a support case and JSON response, but settle_job_payment does not check that response or an open dispute. release_paynow_earnings checks only job COMPLETED, provider PAID and releasedAt. completeBooking calls release before the customer reviews. Auto-confirm only writes a response/event; it does not drive an integrated settlement policy. The app's protected-until-review promise is not enforced by a unified state machine.

**Proposed fix.** Separate work submitted, customer accepted, disputed, auto-accepted and financially settled states. Place explicit financial holds and release only through the documented resolution/timeout policy, coordinated with provider authority.

**Acceptance check.** A disputed completion cannot be settled or paid out until resolved; confirmation/timeouts release exactly once; refund-after-release creates a tracked recoverable liability.

<a id="F38"></a>

### F38 — Wallet sub-balances and active-role-dependent top-ups do not form a consistent ledger

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/migrations/20261020001000_storage_and_financial_rpcs.sql:40](<../supabase/migrations/20261020001000_storage_and_financial_rpcs.sql#L40>); [supabase/migrations/20261020010000_marketplace_hardening.sql:574](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L574>); [supabase/functions/marketplace-api/index.ts:250](<../supabase/functions/marketplace-api/index.ts#L250>)

**Problem and impact.** GENERAL debits change aggregate balance without reducing earnings/commission sub-balances. A cleaner switching to customer can spend aggregate money while earnings/commission still claim it exists; later payouts/reserves can fail or reconciliation becomes inconsistent. Top-up allocation and refund reversal choose the user's current role when callbacks arrive, not an immutable purpose/source stored when payment was created. A role change during checkout can put credits/reversals into a different bucket.

**Proposed fix.** Use explicit immutable wallet accounts/purposes and a balanced ledger with available/reserved amounts. Store top-up destination at initiation, reverse the original credit source and enforce aggregate/subaccount invariants transactionally.

**Acceptance check.** Switch roles before a top-up/refund callback and spend/payout in different orders; ledger-derived balances always reconcile and no bucket can be spent twice.

<a id="F39"></a>

### F39 — Payout availability differs between the app and secure RPC

**Severity:** P1 · **Evidence:** Reproduced · **Area:** Completion and money

**Source:** [mobile/app/(tabs)/wallet.tsx:98](<../mobile/app/(tabs)/wallet.tsx#L98>); [supabase/migrations/20261020010000_marketplace_hardening.sql:494](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L494>)

**Problem and impact.** The UI shows balance minus commissionBalance, while request_cleaner_payout_secure permits earningsBalance minus commissionBalance. With balance=120, earnings=100 and commission credit=20, the UI offers $100 while the backend permits $80. Independent commission credit should not reduce earned withdrawable money in this way, and a role-switch/GENERAL spend can produce further disagreement.

**Proposed fix.** Define the financial model first (F38), then return a server-computed withdrawable/reserved/restricted breakdown and use that exact value in the UI. Show pending/approved/paid payout history and restriction reasons.

**Acceptance check.** All combinations of earnings, commission credit, holds, refunds and customer spending produce identical UI/API withdrawal limits and ledger totals.

<a id="F40"></a>

### F40 — Cancellation fees ignore who cancelled and leave wallet funds unallocated

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/migrations/20261020002000_marketplace_transactions.sql:149](<../supabase/migrations/20261020002000_marketplace_transactions.sql#L149>); [supabase/migrations/20261020009000_marketplace_operations.sql:31](<../supabase/migrations/20261020009000_marketplace_operations.sql#L31>)

**Problem and impact.** A WALLET booking cancelled while EN_ROUTE or IN_PROGRESS refunds 50% whether the actor is the customer or the cleaner. Thus a cleaner cancelling can cost the customer half the price. The retained remainder is not posted to a cleaner compensation/platform fee account, and the payment row is not coherently closed/refunded. Admin cancellation repeats the same policy and direct-payment cancellation returns commission reserves without tracking service compensation.

**Proposed fix.** Implement an explicit actor/reason/time policy with disclosed fees, protected no-fault cases, full ledger allocation and consistent payment/refund states. Avoid charging a customer for cleaner failure without an adjudicated reason.

**Acceptance check.** Test customer, cleaner, no-show, safety, admin and system cancellations at every stage; all money is assigned to named accounts and each customer sees an explainable receipt.

<a id="F41"></a>

### F41 — The latest Paynow status function removed monotonic event safeguards

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:542](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L542>); [supabase/migrations/20261020002000_marketplace_transactions.sql:215](<../supabase/migrations/20261020002000_marketplace_transactions.sql#L215>)

**Problem and impact.** The final replacement drops the earlier status-rank and DISPUTED terminal protection. A delayed Awaiting Delivery callback can move DELIVERED or DISPUTED back to ESCROWED. A dispute may then look funded/usable again. Signed callbacks prove provider origin, not that an older event is the newest authoritative state.

**Proposed fix.** Persist an append-only provider event inbox, deduplicate events, apply a documented transition graph and reconcile ambiguous/out-of-order changes with a fresh signed provider poll. Keep refunds/disputes as explicit holds, not simple ranks.

**Acceptance check.** Replay duplicate and out-of-order signed callbacks across ESCROWED/DELIVERED/PAID/DISPUTED/REFUNDED; no invalid regression, duplicate release or cleared dispute occurs.

<a id="F42"></a>

### F42 — Acceptance replay can skip ownership checks and restart an unrelated payment method

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:140](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L140>); [supabase/functions/marketplace-api/index.ts:470](<../supabase/functions/marketplace-api/index.ts#L470>); [mobile/app/booking/offers.tsx:106](<../mobile/app/booking/offers.tsx#L106>)

**Problem and impact.** accept_bid returns an existing event before verifying j.customerId equals the actor. The key format is predictable from job/bid UUIDs visible to the accepted cleaner. The API then trusts the current request's paymentMethod to decide whether to start a Paynow checkout, even on an idempotent replay of a wallet/direct/paid booking. Checkout failure overwrites payment.data with only failureReason. At minimum a participant can provoke an unauthorized payment-state change; payment reinitialization and metadata loss are also possible.

**Proposed fix.** Authenticate/authorize before returning cached results, scope idempotency to actor+operation and return an immutable result describing the original method/reference. Never initiate a provider side effect on a completed replay; merge failure metadata without destroying settlement/refund fields.

**Acceptance check.** Replay acceptance as the customer and accepted cleaner with the same key and changed method: only the authorized original result is returned and no second checkout/state mutation occurs.

<a id="F43"></a>

### F43 — Paynow retries can leave a booking permanently INITIATING and discard old callback identity

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/functions/marketplace-api/index.ts:491](<../supabase/functions/marketplace-api/index.ts#L491>); [supabase/functions/marketplace-api/index.ts:497](<../supabase/functions/marketplace-api/index.ts#L497>)

**Problem and impact.** Retry replaces the single reference and clears checkout URLs before calling the provider. Unlike first acceptance it has no catch that records a retryable failure. If provider init fails, status stays INITIATING, while another retry is allowed only for FAILED/CANCELLED. A valid delayed callback for the previous reference can no longer find that payment. No separate payment-attempt history preserves it.

**Proposed fix.** Model immutable attempts under a payment intent, persist each reference, record every failure and use a durable provider-operation state machine. Poll/reconcile old attempts before creating a new one and prohibit duplicate funded attempts.

**Acceptance check.** Fail every network boundary before/after provider acceptance, then retry and deliver a late old callback; the booking recovers without losing or double-counting payment.

<a id="F44"></a>

### F44 — Pending checkout cannot reliably be resumed after dismissing or killing the app

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [mobile/app/tracking/[jobId].tsx:374](<../mobile/app/tracking/[jobId].tsx#L374>); [mobile/app/tracking/[jobId].tsx:505](<../mobile/app/tracking/[jobId].tsx#L505>); [supabase/functions/paynow-return/index.ts:1](<../supabase/functions/paynow-return/index.ts#L1>)

**Problem and impact.** The backend stores redirecturl, but the PENDING tracking UI offers a poll rather than a resume checkout action. Retry is limited to FAILED/CANCELLED. payment-return has no native route/handler and the active booking list is incomplete (F24). Closing checkout or receiving a return link can leave an assigned cleaner waiting with no obvious customer payment path.

**Proposed fix.** Add an authenticated get/resume payment intent action, a native return handler that reconciles server state, and Activity cards for payment-required jobs. A return link is only a navigation hint and must never mark a payment paid.

**Acceptance check.** Dismiss checkout, terminate the app, return through a deep link and resume on another device; the original checkout/payment remains accessible and authoritative.

<a id="F45"></a>

### F45 — Payment callbacks and completion side effects lack durable recovery/reconciliation

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/functions/paynow-webhook/index.ts:39](<../supabase/functions/paynow-webhook/index.ts#L39>); [supabase/functions/marketplace-api/index.ts:427](<../supabase/functions/marketplace-api/index.ts#L427>); [supabase/functions/delivery-worker/index.ts:54](<../supabase/functions/delivery-worker/index.ts#L54>)

**Problem and impact.** The Paynow callback commits status then sends push directly; if notification fails after the DB update, a replay sees the status unchanged and skips notification. completeBooking ignores the RPC result/error from earnings release. There is no scheduled payment poller, provider-event journal, orphan-attempt repair or ledger-vs-provider reconciliation job; the delivery worker only handles notifications/expiry. Missed callbacks or partial failure can remain unresolved indefinitely.

**Proposed fix.** Persist provider inbox/outbox and business effects transactionally, retry through workers, expose stuck records to operations and reconcile provider/payment/ledger totals on a schedule.

**Acceptance check.** Crash between every callback/notification/release step and replay; the system converges to one settled payment, one earning and recoverable notifications without manual SQL edits.

<a id="F46"></a>

### F46 — Refund UI records a request but does not implement a complete financial refund workflow

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/functions/marketplace-api/index.ts:801](<../supabase/functions/marketplace-api/index.ts#L801>); [supabase/functions/marketplace-api/index.ts:808](<../supabase/functions/marketplace-api/index.ts#L808>); [supabase/functions/marketplace-api/index.ts:145](<../supabase/functions/marketplace-api/index.ts#L145>)

**Problem and impact.** Refund actions write metadata/support cases for manual provider action; they do not send money. Partial requests are permitted, but apply_paynow_status insists callback amount matches the original full payment, and refund metadata is marked completed on any REFUNDED status without a refund-specific amount/reference ledger. Cumulative/refund-after-release liability and operator completion are not fully represented. The dashboard's Refunded value uses requested amount before confirmation.

**Proposed fix.** Expose REQUESTED/APPROVED/SUBMITTED/CONFIRMED/FAILED states clearly, support the provider's actual partial-refund contract, record refund transactions and cumulative limits, and reconcile cleaner/platform/customer balances. Label manual portal work explicitly.

**Acceptance check.** Full/partial/repeated/failed/refund-after-payout cases reconcile to provider evidence; requested refunds never appear as already paid and totals cannot exceed the capture.

<a id="F47"></a>

### F47 — BuySafe escrow behavior is asserted without an executable provider contract check

**Severity:** P1 · **Evidence:** Provider validation required · **Area:** Completion and money

**Source:** [supabase/functions/marketplace-api/index.ts:112](<../supabase/functions/marketplace-api/index.ts#L112>); [supabase/functions/marketplace-api/index.ts:129](<../supabase/functions/marketplace-api/index.ts#L129>); [mobile/app/help.tsx:40](<../mobile/app/help.tsx#L40>)

**Problem and impact.** The app labels checkout as BuySafe and gates service on Awaiting Delivery/Delivered/Paid, but code calls the SDK's standard createPayment/send endpoint with no explicit BuySafe option. This may be correct only for a specifically configured merchant integration. The repository does not establish that configuration or validate the actual escrow/delivery/refund semantics. A successful generic checkout-init smoke test does not prove funds are held as promised.

**Proposed fix.** Verify merchant/integration configuration and current Paynow BuySafe contract in staging, document exact statuses, permitted methods, release timing and dispute/refund behavior, and encode provider fixtures/contract checks. Adjust product promises to the verified behavior.

**Acceptance check.** Demonstrate an actual sandbox/staging escrow lifecycle with provider evidence, including cancellation/dispute/refund and no cleaner release before the agreed conditions.

<a id="F48"></a>

### F48 — Payout queue lacks a direct rejection path and complete payout/account recovery controls

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Completion and money

**Source:** [supabase/migrations/20261020010000_marketplace_hardening.sql:525](<../supabase/migrations/20261020010000_marketplace_hardening.sql#L525>); [site/src/admin/Modules.tsx:31](<../site/src/admin/Modules.tsx#L31>); [supabase/functions/marketplace-api/index.ts:547](<../supabase/functions/marketplace-api/index.ts#L547>)

**Problem and impact.** PENDING payouts can only be approved in the UI; rejection is allowed only after approval by a different admin. Invalid requests can keep funds reserved unnecessarily. The approving admin can reveal a destination and send a manual transfer even though they cannot mark it paid, increasing duplicate/manual-payment risk. The mobile app lacks a complete payout status/history/reason/destination-management journey.

**Proposed fix.** Support reasoned rejection/cancellation of pending requests, enforce distinct initiator/approver/settler responsibilities before revealing/payment, add transfer idempotency and show clear cleaner payout history/recovery.

**Acceptance check.** Reject invalid pending requests without unnecessary approval, prevent the first approver from initiating the transfer, and reconcile interrupted manual transfers exactly once.

<a id="F49"></a>

### F49 — Chat has no durable notification path and its claimed atomic batch is sequential

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Messaging and notifications

**Source:** [mobile/app/(tabs)/messages.tsx:113](<../mobile/app/(tabs)/messages.tsx#L113>); [mobile/services/supabase.ts:308](<../mobile/services/supabase.ts#L308>); [supabase/migrations/20261020005000_client_runtime_access.sql:14](<../supabase/migrations/20261020005000_client_runtime_access.sql#L14>)

**Problem and impact.** writeBatch executes separate requests in a loop, despite the chat comment promising atomicity. A message can be written while its job summary/unread update fails. increment is a read-modify-write and can lose concurrent counts. Sending clears the draft before success and swallows errors. There is no active Supabase trigger/API outbox for new messages; the old Firebase onMessageCreated trigger is retired. Raw direct message inserts lack a bounded text/attachment schema or per-conversation rate limit.

**Proposed fix.** Create one transactional send-message RPC with server time, bounded content, participant/state checks, atomic unread bookkeeping and a durable notification outbox. Keep failed drafts, expose retry and paginate message history.

**Acceptance check.** Send concurrent messages, drop connections after insert, use quick replies/photos and background the recipient; drafts/counters/messages/alerts stay consistent and duplicate sends are prevented.

<a id="F50"></a>

### F50 — Notification payloads omit the routing type that the app expects

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Messaging and notifications

**Source:** [supabase/functions/marketplace-api/index.ts:92](<../supabase/functions/marketplace-api/index.ts#L92>); [mobile/app/_layout.tsx:55](<../mobile/app/_layout.tsx#L55>); [mobile/app/notifications.tsx:38](<../mobile/app/notifications.tsx#L38>)

**Problem and impact.** The outbox payload includes jobId/supportCaseId but not type, while the native response router uses type to distinguish NEW_BID and instant offers. The in-app notification list also always routes job items to tracking. A cleaner's instant offer can open a private jobs record before assignment (RLS denies it), and a customer quote can open tracking instead of offer review. Cold-start routing occurs before auth/profile readiness and does not preserve a pending destination.

**Proposed fix.** Define a versioned notification deep-link contract including event type, safe target and actor/role context; route both in-app/push through one resolver after session hydration. Deduplicate last-response navigation and verify access on destination load.

**Acceptance check.** Tap quote, instant offer, acceptance, payment, emergency and support notifications with the app foregrounded, backgrounded, signed out and cold-started; each reaches the correct authorized screen.

**Implementation status (2026-10-23).** Push payloads now include the notification `type`, job ID and support-case ID, and the push-device lifecycle test asserts that type survives outbox creation. The native cold-start and in-app list routers still need a unified, real-device journey test and authorized destination resolver.

<a id="F51"></a>

### F51 — Realtime reads and media signing are expensive and several screens can spin forever

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Messaging and notifications

**Source:** [mobile/services/supabase.ts:296](<../mobile/services/supabase.ts#L296>); [mobile/services/supabase.ts:216](<../mobile/services/supabase.ts#L216>); [mobile/app/tracking/[jobId].tsx:405](<../mobile/app/tracking/[jobId].tsx#L405>); [mobile/app/(tabs)/messages.tsx:98](<../mobile/app/(tabs)/messages.tsx#L98>)

**Problem and impact.** Every relevant table event triggers a full select and recursive signed-URL generation, with no row filter/debounce/reconnect state. Chat and conversations are unpaginated; Realtime status errors are not surfaced. Tracking does not resolve loading on missing/inaccessible jobs, and multiple listeners lack error UI. A stale read can complete after unsubscribe and overwrite state. Pull-to-refresh on Home only waits 600ms without refetching.

**Proposed fix.** Add scoped subscriptions, bounded keyset pagination, stable DTO/media caches, request cancellation/version checks and explicit loading/empty/offline/error states. Implement real focus/reconnect/manual refresh behavior and backpressure.

**Acceptance check.** Run large chat/history feeds and frequent location updates under poor network; network/signing volume remains bounded, stale replies are ignored and every screen recovers from denied/missing records.

<a id="F52"></a>

### F52 — Delivery status and scheduling do not meet urgent dispatch needs

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Messaging and notifications

**Source:** [supabase/functions/delivery-worker/index.ts:20](<../supabase/functions/delivery-worker/index.ts#L20>); [.github/workflows/notification-delivery.yml:5](<../.github/workflows/notification-delivery.yml#L5>); [supabase/functions/marketplace-api/index.ts:100](<../supabase/functions/marketplace-api/index.ts#L100>)

**Problem and impact.** Expo ticket acceptance/Twilio message creation are immediately recorded as DELIVERED. Expo receipt errors later only set lastError, and Twilio delivery status is never reconciled. Immediate dispatch depends on a secret and a five-second best-effort call; fallback is a GitHub schedule every five minutes for three-minute offers. No dead-letter/worker-heartbeat admin view exists, and the Supabase replacement has no scheduled booking-reminder producer.

**Proposed fix.** Separate queued/provider-accepted/device-delivered states, process provider receipts/callbacks, add observable dead letters and use a continuously available worker/managed scheduler appropriate to urgent offers. Implement scheduled reminders and escalation/fallback channels.

**Acceptance check.** Kill the immediate worker, delay scheduler execution and simulate provider acceptance followed by delivery failure; urgent offers remain timely and operators/users see truthful delivery and recovery states.

<a id="F53"></a>

### F53 — Dashboard hard reloads and browser back/forward do not resolve routed modules

**Severity:** P1 · **Evidence:** Reproduced · **Area:** Admin dashboard

**Source:** [site/src/admin/AdminDashboard.tsx:27](<../site/src/admin/AdminDashboard.tsx#L27>)

**Problem and impact.** For /admin/bookings, the parser reads route='admin' and focus='bookings', then falls back to Overview. It is one URL segment short. go() uses pushState without a popstate listener. In an isolated browser with mocked auth/API, reloading /admin/bookings rendered Overview and navigating back from Support left Support visible at /admin/bookings.

**Proposed fix.** Use a real router or a tested /admin/:module/:id parser plus history synchronization. Reset module-local filters/focus when route parameters change and preserve authorization checks on reload.

**Acceptance check.** Deep-link, reload, back and forward through all modules and focused records; URL, selected navigation and rendered content always match.

<a id="F54"></a>

### F54 — Unsupported admin mutations return success and create a misleading audit record

**Severity:** P1 · **Evidence:** Reproduced · **Area:** Admin dashboard

**Source:** [supabase/functions/marketplace-api/index.ts:753](<../supabase/functions/marketplace-api/index.ts#L753>); [supabase/functions/marketplace-api/index.ts:756](<../supabase/functions/marketplace-api/index.ts#L756>); [site/src/admin/Modules.tsx:6](<../site/src/admin/Modules.tsx#L6>)

**Problem and impact.** adminMutation has no rejecting final else for unknown actions: it writes an audit event and returns ok even if nothing was changed. The isolated dispatcher probe confirms change_status returns success with only an adminauditevents write. The module configs advertise create booking, change status, internal notes, products, inventory and exports, but many are not rendered or implemented. An audit entry can therefore imply an operation occurred when it did not.

**Proposed fix.** Define a strict allowlist/discriminated command schema, reject unsupported commands and make operation plus audit transactional. Render only capabilities backed by implemented workflows; build missing operational tools deliberately.

**Implementation status (2026-10-23).** The API now rejects actions outside an explicit allowlist with HTTP 400, and the dashboard capability metadata now lists only workflows that have row-level controls. The operation and audit write are still not one transaction for every action; this finding remains open until durable atomicity/recovery is implemented and verified.

**Acceptance check.** Unknown/unimplemented actions return a clear 4xx with no success audit; every advertised action either completes its intended change or is visibly unavailable.

<a id="F55"></a>

### F55 — Admin reassignment can reopen closed jobs and disconnect cleaner payment ownership

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Admin dashboard

**Source:** [supabase/functions/marketplace-api/index.ts:786](<../supabase/functions/marketplace-api/index.ts#L786>); [supabase/functions/marketplace-api/index.ts:791](<../supabase/functions/marketplace-api/index.ts#L791>)

**Problem and impact.** Reassignment does not reject COMPLETED/CANCELLED/in-progress jobs and directly sets ASSIGNED. It checks availability/verification but not cleanerAgreementAccepted. It does not transfer/reverse original commission reserves, update payments.cleanerid, bid ownership, contact details or earnings, or notify the displaced cleaner. A completed paid booking can be reopened with stale financial metadata.

**Proposed fix.** Move reassignment to a transactional state-aware RPC that checks agreements/availability, restricts supported stages, preserves payment/commission obligations and records/alerts both parties. Require a separate remediation workflow for already-completed work.

**Acceptance check.** Attempt reassignment in every booking/payment state; prohibited states reject, and successful replacements leave one cleaner/quote/payment/reservation identity with correct notices.

**Implementation status (2026-10-23).** The reassignment RPC now only accepts pending, confirmed or assigned jobs, requires an available verified cleaner with an accepted agreement, updates eligible payment ownership and records old/new cleaner IDs. Database regression coverage now rejects completed/cancelled/in-progress jobs and checks the escrow owner and audit event on a successful move. Quote/reservation and displaced-cleaner notification behavior still needs broader lifecycle verification.

<a id="F56"></a>

### F56 — Search, filters and pagination do not honor the displayed module contract

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Admin dashboard

**Source:** [site/src/admin/Modules.tsx:31](<../site/src/admin/Modules.tsx#L31>); [supabase/functions/marketplace-api/index.ts:732](<../supabase/functions/marketplace-api/index.ts#L732>); [supabase/functions/marketplace-api/index.ts:731](<../supabase/functions/marketplace-api/index.ts#L731>)

**Problem and impact.** Every filter offers Active/Pending/Completed/Cancelled even for service, verification, coverage and date, leading to invalid enum comparisons or ignored selections. Booking ID search applies ilike to a UUID column, which PostgreSQL does not support without a cast. Cursor queries use only createdat, so rows sharing timestamps (common after imports) can be skipped. There is no robust previous-page state, and focus/search props do not reliably reload a reused module.

**Proposed fix.** Define typed per-module filters, safe UUID/name search and deterministic compound cursors (createdat,id) with matching indexes. Implement expected sorting/date controls and consistent navigation/focus state.

**Acceptance check.** Search by full/partial UUID and names, use every filter with realistic data and page through equal-timestamp rows under concurrent inserts without skips/duplicates.

<a id="F57"></a>

### F57 — Revenue chart understates money and attention links do not open the support case

**Severity:** P1 · **Evidence:** Reproduced / code-confirmed · **Area:** Admin dashboard

**Source:** [supabase/migrations/20261020009000_marketplace_operations.sql:74](<../supabase/migrations/20261020009000_marketplace_operations.sql#L74>); [site/src/admin/Overview.tsx:6](<../site/src/admin/Overview.tsx#L6>); [site/src/admin/Overview.tsx:21](<../site/src/admin/Overview.tsx#L21>)

**Problem and impact.** The metrics RPC returns revenueSeries.amount in USD, while the chart uses a cents formatter. $120 is displayed as $1.20. The top metric is explicitly converted to cents in the API, which hides this unit mismatch. Attention JSON supplies a support-case id plus bookingId but no caseId, so the UI routes every item toward booking operations instead of the support case. Retry uses setPeriod(p=>p), which causes no refetch.

**Proposed fix.** Use explicit money types/units in the DTO, normalize the revenue series once and return caseId separately from bookingId. Implement a real retry/refetch trigger and loading/error states.

**Acceptance check.** Compare chart and metric values against exact ledger/provider fixtures; clicking an urgent case opens its case detail, and retry reissues a failed request.

<a id="F58"></a>

### F58 — Support operators cannot read or resolve the full customer problem in the current UI

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Admin dashboard

**Source:** [site/src/admin/Modules.tsx:13](<../site/src/admin/Modules.tsx#L13>); [supabase/functions/marketplace-api/index.ts:742](<../supabase/functions/marketplace-api/index.ts#L742>); [supabase/functions/marketplace-api/index.ts:775](<../supabase/functions/marketplace-api/index.ts#L775>)

**Problem and impact.** The table expects Case/Booking/Opened/Owner but receives raw id/jobid/createdat/ownerid; several cells render dashes. Ticket descriptions, evidence, reporter and payment context live in data and have no case-detail interface. Resolve case marks a record resolved with notes but does not notify participants, settle/refund a related booking, enforce response SLAs or maintain an operator conversation. Several issue reporters do not notify support at all.

**Proposed fix.** Build a support case workspace with authorized evidence, booking/payment timeline, assignment/severity/SLA, customer-visible replies and links to audited financial actions. Separate resolving a case from merely adding a note.

**Acceptance check.** Handle a damaged-property report, no-show and disputed completion from intake through communication, financial action and closure; every participant/operator sees the correct status and evidence.

<a id="F59"></a>

### F59 — Admin session and access management is incomplete

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Admin dashboard

**Source:** [site/src/admin/AdminEntry.tsx:53](<../site/src/admin/AdminEntry.tsx#L53>); [site/src/admin/Admins.tsx:12](<../site/src/admin/Admins.tsx#L12>); [site/src/admin/AdminDashboard.tsx:50](<../site/src/admin/AdminDashboard.tsx#L50>)

**Problem and impact.** All navigation modules are displayed regardless of permissions. The MFA gate runs on user.id changes only; password reauthentication can replace the token with aal1 while the gate remains ready, causing confusing later API failures. There is no implemented admin revoke/disable/change-permissions/revoke-invite/session-management UI, recovery-code/lost-factor process or visible audit-log viewer despite the audit.read permission. Settings also stores a supportCopy save into local switches state, which can incorrectly show a maintenance banner until reload.

**Proposed fix.** Make assurance and permissions reactive to session events, show only allowed tools, require MFA again after downgrade and implement audited role/invite/session revocation plus secure lost-factor recovery.

**Acceptance check.** Downgrade assurance, revoke an admin while online and recover a lost authenticator; access changes immediately and every privileged transition remains auditable.

<a id="F60"></a>

### F60 — Organization signup/join can leave partial state and the screen may not refresh

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Organizations and discovery

**Source:** [mobile/app/organization.tsx:29](<../mobile/app/organization.tsx#L29>); [supabase/migrations/20261020000000_initial_schema.sql:268](<../supabase/migrations/20261020000000_initial_schema.sql#L268>); [supabase/functions/marketplace-api/index.ts:658](<../supabase/functions/marketplace-api/index.ts#L658>)

**Problem and impact.** The screen waits on an organizations realtime listener, but organizations is not added to the publication; registration does not explicitly reload state, so it can remain on the registration form. Joining an invite performs three unchecked separate writes, allows multiple org memberships while users has one organizationid, and stores a verification snapshot that later becomes stale. Removing a member can clear a different/current affiliation if memberships drift.

**Proposed fix.** Use transactional organization registration/invite acceptance/removal with explicit membership invariants and role checks, return the new organization DTO, map all columns, and refresh or subscribe to published tables. Show live verified/suspended state rather than a fixed badge.

**Acceptance check.** Register without app restart; interrupt each join/remove step; accept invitations concurrently/from a second organization; roster and user affiliation remain consistent and verified status is current.

<a id="F61"></a>

### F61 — Favorites and cleaner discovery do not provide the promised rebooking path

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Organizations and discovery

**Source:** [mobile/app/favorites.tsx:81](<../mobile/app/favorites.tsx#L81>); [mobile/app/(tabs)/messages.tsx:49](<../mobile/app/(tabs)/messages.tsx#L49>); [mobile/app/cleaners.tsx:78](<../mobile/app/cleaners.tsx#L78>)

**Problem and impact.** Favorites' message button passes cleanerId, but Messages only consumes jobId and supports assigned-job conversations. The list promises quick rebooking but has no such action; cleaner search cards have no detailed public profile/availability/request-this-cleaner flow. Search fetches at most 250 candidates before distance sorting, so nearest/highest-rated results can be arbitrarily excluded as the marketplace grows.

**Proposed fix.** Add a safe public cleaner profile, real review/portfolio detail, availability and explicit invitation/rebooking flow. Keep chat booking-scoped, or deliberately design authorized prebooking messaging. Move geospatial search/paging into the database.

**Acceptance check.** Find, inspect, favorite and rebook a specific eligible cleaner; disabled/departed cleaners are handled honestly, and nearest search remains correct beyond 250 profiles.

<a id="F62"></a>

### F62 — Readable contrast, accessible controls and mobile layout need a dedicated pass

**Severity:** P2 · **Evidence:** Measured / code-confirmed · **Area:** UI and accessibility

**Source:** [site/src/styles.css:2](<../site/src/styles.css#L2>); [site/src/admin/admin.css:1](<../site/src/admin/admin.css#L1>); [mobile/app/(tabs)/_layout.tsx:29](<../mobile/app/(tabs)/_layout.tsx#L29>)

**Problem and impact.** Marketing links use #3906D2 on #0D0A24, measured contrast about 1.96:1; purple stat labels on #1E0378 are about 1.59:1. Several admin muted labels are below 4.5:1. Mobile has many icon-only controls without labels/roles, 9–11px important text, absolute-height bottom navigation and a missing tab. A mocked browser check at 375px found a 1px horizontal overflow; native text scaling, screen readers, keyboard avoidance and small-screen wallets still require device verification.

**Proposed fix.** Apply WCAG AA text/control contrast, accessible names/states, minimum touch targets, dynamic font scaling and focus management. Test narrow widths, large text, VoiceOver/TalkBack, keyboard and reduced motion; fix overflow and use safe-area-aware layouts.

**Acceptance check.** Complete all five journeys at large text and with a screen reader; every control has a clear purpose/state and core content/actions remain visible without inaccessible gestures.

<a id="F63"></a>

### F63 — The public blog origin is blocked by its own backend

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Marketing and blog

**Source:** [site/src/main.tsx:57](<../site/src/main.tsx#L57>); [supabase/functions/marketplace-api/index.ts:11](<../supabase/functions/marketplace-api/index.ts#L11>)

**Problem and impact.** The frontend routes blog.detail.co.zw and blog.detailapp.co.zw to Blog, but neither host is in allowedOrigins. Blog calls to marketplace-api receive 403 before dispatch, even after fixing F01. The deployment workflow copies site and dashboard artifacts but has no explicit blog deployment/host check. Blog rendering/meta is entirely client-side, with static homepage OG/sitemap metadata, which weakens article previews/indexing and does not return a real article 404.

**Proposed fix.** Add the approved blog origins, explicitly provision/deploy its host and use prerender/SSR/static generation for published articles, canonical/OG metadata, sitemap and real HTTP status codes.

**Acceptance check.** Load/list/open/unpublish an article on both intended production blog domains with browser CORS and a JS-free crawler; metadata and 404 behavior match that article.

<a id="F64"></a>

### F64 — An unauthenticated visitor can overwrite another email’s waitlist consent/contact data

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Marketing and blog

**Source:** [supabase/functions/marketplace-api/index.ts:690](<../supabase/functions/marketplace-api/index.ts#L690>); [supabase/functions/marketplace-api/index.ts:702](<../supabase/functions/marketplace-api/index.ts#L702>)

**Problem and impact.** Passing CAPTCHA proves a human, not email ownership. joinWaitlist looks up any supplied email and overwrites its name/phone, marketing choice and unsubscribe token. A third party can opt someone else back into marketing and invalidate their old unsubscribe link. Signup also sends a confirmation email without a durable send quota/double opt-in flow; server validation is weaker than the UI's required fields.

**Proposed fix.** Require email ownership confirmation before subscription/consent changes, preserve unsubscribe identity and an append-only consent history, rate-limit public writes and suppress repeated confirmations. Store pending unverified signups separately.

**Acceptance check.** Submit another person's email and replay signup after unsubscribe: existing consent/contact details remain protected until that mailbox confirms the change.

**Implementation status (2026-10-23).** Public signup now uses a serialized database registration function: an existing normalized address is left unchanged, including contact fields, marketing consent and unsubscribe token. A pgTAP regression test covers case-insensitive duplicate registration and preservation of those fields. The product still has no mailbox-verified change-consent flow or append-only consent history.

<a id="F65"></a>

### F65 — Campaign targeting is ignored and sends are not idempotent

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Marketing and blog

**Source:** [site/src/admin/Waitlist.tsx:15](<../site/src/admin/Waitlist.tsx#L15>); [supabase/functions/marketplace-api/index.ts:814](<../supabase/functions/marketplace-api/index.ts#L814>); [supabase/functions/marketplace-api/index.ts:822](<../supabase/functions/marketplace-api/index.ts#L822>)

**Problem and impact.** The UI submits country/city/service/language filters, but the API ignores them and selects the first 100 consented records without a deterministic campaign cursor. It sends email before validating/storing the idempotency key and never checks for an already-sent campaign. Retrying the same key or even submitting an invalid key can send duplicates; records beyond the first 100 may never be reached. Unsubscribe can race a snapshotted bulk send.

**Proposed fix.** Validate/authorize before effects, show an audience preview/count and persist a campaign/recipient outbox with targeting, suppression, per-recipient state and provider idempotency. Recheck consent at send time and make batches resumable.

**Acceptance check.** Filter each audience, send more than 100 recipients, retry after provider success/response loss and unsubscribe during a send; only the intended currently consented recipients receive one message.

<a id="F66"></a>

### F66 — Waitlist retries, deduplication and CSV export have correctness/security gaps

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Marketing and blog

**Source:** [site/src/main.tsx:29](<../site/src/main.tsx#L29>); [supabase/migrations/20261020000000_initial_schema.sql:124](<../supabase/migrations/20261020000000_initial_schema.sql#L124>); [site/src/admin/Waitlist.tsx:14](<../site/src/admin/Waitlist.tsx#L14>)

**Problem and impact.** There is no unique normalized email constraint, so concurrent check-then-insert requests can duplicate records/consent. The Turnstile widget has no explicit mount/reset/expired-token lifecycle; retrying after a server failure can reuse a consumed token. The UI promises inbox confirmation even when RESEND_API_KEY is missing or delivery fails. CSV values are quoted but not neutralized for spreadsheet formulas such as =... entered in names.

**Proposed fix.** Add normalized-email uniqueness/transactional upsert, explicit CAPTCHA lifecycle/error controls, truthful confirmation delivery state and formula-safe CSV serialization. Preserve consent records while deduplicating.

**Acceptance check.** Run concurrent signup, expired CAPTCHA, provider failure and spreadsheet-formula payloads; retries work, one record exists and exported cells remain data rather than formulas.

**Implementation status (2026-10-23).** Concurrent normalized-email signup is serialized by a database advisory lock; repeated signups preserve the original consent/contact record, and CSV export neutralizes formula-leading cells. The API now returns confirmation-email delivery status and the public success message reflects it. Retry and add-another-person controls reset the Turnstile widget, and expiry/load callbacks now show specific recovery guidance. Concurrent-signup and provider-failure integration tests remain outstanding.

<a id="F67"></a>

### F67 — Trust and service promises exceed implemented product capabilities

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** Marketing and blog

**Source:** [site/src/main.tsx:46](<../site/src/main.tsx#L46>); [mobile/app/(auth)/welcome.tsx:16](<../mobile/app/(auth)/welcome.tsx#L16>); [mobile/app/help.tsx:166](<../mobile/app/help.tsx#L166>); [mobile/app/privacy-policy.tsx:30](<../mobile/app/privacy-policy.tsx#L30>)

**Problem and impact.** Marketing claims two-way ratings, the native welcome describes rigorous identity and background checks, and support copy promises live-chat hours. The active API implements only customer-to-cleaner ratings, Didit identity decisions and support tickets/email, with no background-check adjudication or live operator chat. Office/specialist offerings are broader than the HOUSE/CAR catalog's supported structured scope. The mobile privacy policy lists the placeholder contact privacy@detail and says location is tracked only during active cleaning sessions, although the implementation also shares an online cleaner position before a booking.

**Proposed fix.** Make claims and badges correspond to completed named checks/capabilities. Label demo ratings/portraits as previews, publish truthful support availability and either implement or clearly defer two-way reviews/commercial/specialist scope. Replace placeholder legal contacts and align privacy/location disclosures with the actual online/background behavior and retention policy.

**Acceptance check.** Every public trust/service claim can be traced to an implemented check, operational procedure or clearly labeled future/beta capability.

<a id="F68"></a>

### F68 — Expected credential names do not match this workspace’s configured aliases

**Severity:** P1 · **Evidence:** Code-confirmed / local readiness checked · **Area:** Deployment and operations

**Source:** [.github/workflows/deploy-supabase.yml:26](<../.github/workflows/deploy-supabase.yml#L26>); [supabase/functions/marketplace-api/index.ts:201](<../supabase/functions/marketplace-api/index.ts#L201>); [scripts/live_provider_checks.mjs:69](<../scripts/live_provider_checks.mjs#L69>); [mobile/app.config.js:10](<../mobile/app.config.js#L10>)

**Problem and impact.** The branch reads DIDIT_API_KEY and RESEND_API_KEY with no alias fallback, while this workspace has DIDIT_KYC_SECRET_KEY and EXPO_RESEND_API_KEY instead. Local presence checks also found no DIDIT_WORKFLOW_ID, MAPBOX_DOWNLOADS_TOKEN, SUPABASE_SERVICE_ROLE_KEY or EXPO_TOKEN. A Supabase secret key is present under a different local name. These observations describe the workspace only, not deployed project/CI secret stores. The earlier alias changes are still absent from this branch.

**Proposed fix.** Standardize a credential contract and add the intended aliases in backend/tests/workflows/docs, with no values logged. Validate all required server/build/provider settings at deployment. Keep EAS auth in EXPO_TOKEN and download credentials build-only; scope Supabase server keys to operator/backend use.

**Acceptance check.** Run a values-redacted readiness check for local, staging, GitHub, Supabase and EAS environments; then prove each integration with a controlled staging test using its canonical/accepted alias.

<a id="F69"></a>

### F69 — Production deployment is not gated by completed validation and can publish a partial release

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Deployment and operations

**Source:** [.github/workflows/deploy.yml:10](<../.github/workflows/deploy.yml#L10>); [.github/workflows/deploy-supabase.yml:1](<../.github/workflows/deploy-supabase.yml#L1>); [.github/workflows/ci.yml:1](<../.github/workflows/ci.yml#L1>)

**Problem and impact.** Site deployment, Supabase deployment and validation run independently on pushes to main. There is no dependency requiring all validation to pass before release. cPanel FTPS replaces live files and cancels in-progress deployment; an interrupted upload or independently applied DB/API release can leave mixed versions. Supabase deployment lacks an explicit concurrency lock/release artifact strategy. Dependencies/actions/CLI versions also float in several release steps.

**Proposed fix.** Build immutable validated artifacts, gate deployments on required checks and a compatible release plan, serialize production migrations, use backward-compatible schema changes and atomic/versioned site activation. Pin release tools/actions and retain a tested rollback path.

**Acceptance check.** Fail validation and interrupt deployment at each step; production never activates an unvalidated/mixed release, and rollback restores the previous compatible app/API safely.

**Implementation status (2026-10-23).** The cPanel and Supabase deployment workflows now trigger only after the `Validate Detail` workflow succeeds on `main`, and both check out the exact validated commit SHA. Supabase deployments are serialized. This prevents a failed validation from releasing code, but does not make the separate site/backend deployments atomic or provide rollback; F69 remains open for immutable release artifacts and compatible activation/recovery.

<a id="F70"></a>

### F70 — Automated validation does not exercise the business/security journeys it claims to support

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Deployment and operations

**Source:** [.github/workflows/ci.yml:91](<../.github/workflows/ci.yml#L91>); [qa/booking-lifecycle.md:24](<../qa/booking-lifecycle.md#L24>); [mobile/.maestro/01-email-sign-in.yaml:6](<../mobile/.maestro/01-email-sign-in.yaml#L6>); [mobile/app/(auth)/welcome.tsx:43](<../mobile/app/(auth)/welcome.tsx#L43>)

**Problem and impact.** CI builds/type-checks/lints and resets/lints a local database, but has no behavioral RLS matrix, lifecycle/ledger invariant, concurrency, callback replay, notification routing or browser journey suite. Maestro's welcome-skip test ID is absent from Welcome, and its documentation still specifies Firebase accounts. Existing QA documents explicitly say end-to-end/provider sandbox execution is not yet claimed. This audit demonstrates bugs that pass the existing static checks.

**Proposed fix.** Turn the QA matrices into executable isolated tests: direct REST/RPC permissions, transactional money/state tests, mocked-provider contracts, browser journeys and native device smoke flows. Repair selectors/data fixtures and make critical journey failures release-blocking.

**Acceptance check.** CI detects F01/F02/F03/F36/F41/F53-type regressions and a real staging/device release matrix passes without production data or money.

<a id="F71"></a>

### F71 — Locked mobile and payment dependency trees have unresolved advisories

**Severity:** P1 · **Evidence:** Dependency scan · **Area:** Deployment and operations

**Source:** [mobile/package.json:22](<../mobile/package.json#L22>); [functions/package.json:23](<../functions/package.json#L23>); [supabase/functions/marketplace-api/index.ts:2](<../supabase/functions/marketplace-api/index.ts#L2>)

**Problem and impact.** Registry npm audit --omit=dev reported mobile: 100 affected dependency entries (1 critical, 81 high, 18 moderate), functions: 18 (9 high, 9 moderate), site: zero production entries. Many mobile entries are propagated through Expo/build tooling rather than 100 independent remotely exploitable app flaws. The critical mobile chain includes tar; legacy/payment trees include axios/follow-redirects/node-forge advisories. Active Edge Functions import paynow@2.2.2, so payment-related transitive risk needs Deno-specific analysis too. The root lockfile adds 14 affected production dependency entries (3 critical, 9 high, 2 moderate), including obsolete MapLibre/Express-related chains. The active root scripts delegate to site; remove unused dependencies after import/use analysis rather than treating all root advisories as exposed production endpoints.

**Proposed fix.** Upgrade Expo/React Native using the supported compatibility matrix, update the payment SDK/transitives with contract tests, produce separate build/runtime SBOMs and evaluate advisory reachability. Do not apply a blind audit --force upgrade that breaks native compatibility.

**Acceptance check.** Record fixed versions and reachable attack paths for each remaining high/critical advisory; site/mobile/native builds and provider fixtures pass on the updated supported stack.

<a id="F72"></a>

### F72 — Firebase cutover importer has schema and ledger-loss hazards

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Deployment and operations

**Source:** [functions/scripts/migrate-firebase-to-supabase.mjs:172](<../functions/scripts/migrate-firebase-to-supabase.mjs#L172>); [functions/scripts/migrate-firebase-to-supabase.mjs:153](<../functions/scripts/migrate-firebase-to-supabase.mjs#L153>); [functions/scripts/migrate-firebase-to-supabase.mjs:196](<../functions/scripts/migrate-firebase-to-supabase.mjs#L196>)

**Problem and impact.** The generic import adds cols.id to openJobs even though its primary key is jobid and there is no id column, so importing those rows can fail. walletTransactions is skipped unconditionally because the configured tables array always contains transactions, even if that source collection is empty. Event actor IDs are remapped once in remapKey and then looked up again in uidMap, which can erase actors. Other concerns include media path layout, imported plaintext payout destinations, stale verified state, identity conflicts and dry-run mode not validating target writes/constraints.

**Proposed fix.** Use per-table typed importers, precompute all identity/reference maps, merge/deduplicate both ledger source collections and run integrity/count/balance/object/actor checks. Stage imports, reconcile against signed source snapshots, and rehearse restart/failure/rollback before a write freeze.

**Acceptance check.** A representative legacy fixture imports every open job, ledger record and event actor correctly; rerun is idempotent and table counts, foreign keys, balances and media ACLs reconcile exactly.

<a id="F73"></a>

### F73 — Retained Cloudflare deployment tooling can recreate an insecure obsolete service

**Severity:** P1 if reachable · **Evidence:** Conditional legacy exposure · **Area:** Deployment and operations

**Source:** [scripts/deploy-cloudflare-waitlist.py:48](<../scripts/deploy-cloudflare-waitlist.py#L48>); [cloudflare/waitlist-worker.mjs:36](<../cloudflare/waitlist-worker.mjs#L36>); [functions/package.json:13](<../functions/package.json#L13>)

**Problem and impact.** The retired D1 deploy helper defaults an initial admin password to the admin email when no password is configured, and can reset an incomplete bootstrap to that fallback. The legacy worker's CAPTCHA check fails open without its secret, login has no robust rate limit/MFA and older endpoints have weaker authorization/placeholder operations. These are not the active Supabase path, but the scripts are still executable and may describe an existing legacy deployment. No live legacy endpoint was probed.

**Proposed fix.** Quarantine/remove executable legacy deployment paths, fail closed with required strong one-time credentials if a rollback service is intentionally retained, revoke obsolete access and verify legacy hosts are retired or protected. Keep archives visibly separate from deployable code.

**Acceptance check.** Inventory actual DNS/workers/Firebase runtimes with authorized operators; no obsolete public admin service can be created or accessed using fallback credentials.

<a id="F74"></a>

### F74 — Operational observability, recovery and release readiness are not demonstrated

**Severity:** P1 · **Evidence:** Missing production evidence · **Area:** Deployment and operations

**Source:** [supabase/functions/marketplace-api/index.ts:31](<../supabase/functions/marketplace-api/index.ts#L31>); [.github/workflows/notification-delivery.yml:1](<../.github/workflows/notification-delivery.yml#L1>); [docs/supabase-cutover.md:32](<../docs/supabase-cutover.md#L32>)

**Problem and impact.** There is no implemented end-to-end correlation/error telemetry, user-safe incident IDs, provider/worker/financial reconciliation dashboard, alert thresholds, restore-test evidence or load/capacity results. Logs alone cannot tell operators which customers/jobs lost an alert, payment transition or deletion step. GitHub schedule success does not establish an urgent dispatch/safety SLA. Repository runbooks are useful but are not proof that backups, PITR, support staffing and rollback work in the deployed project.

**Proposed fix.** Define service objectives and instrument errors/latency/outbox/provider lag, add redacted correlation IDs and alerts, maintain a financial exception queue, rehearse restores/rollback and run capacity/device acceptance tests before broad launch.

**Acceptance check.** A staged provider outage and DB/app failure trigger actionable alerts and are recovered using documented procedures with measured data loss/recovery times and reconciled money.

<a id="F75"></a>

### F75 — KYC and contact trust have no complete lifecycle or verified-contact binding

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [supabase/functions/marketplace-api/index.ts:217](<../supabase/functions/marketplace-api/index.ts#L217>); [supabase/functions/marketplace-api/index.ts:242](<../supabase/functions/marketplace-api/index.ts#L242>); [mobile/app/register-cleaner.tsx:61](<../mobile/app/register-cleaner.tsx#L61>)

**Problem and impact.** Didit status is refreshed only when a user requests it; no signed provider webhook/recheck worker, expiry/revocation policy or operational review queue keeps verification current. An approved decision plus application/agreement immediately grants cleaner access without the separately advertised background review. Profile phone/address are arbitrary editable text rather than verified auth contacts, yet phone is used for direct calls and operational SMS. The customer/cleaner can present a contact number they do not own.

**Proposed fix.** Define check types/expiry and provider webhook/poll reconciliation, separate identity verification from operational approval, reverify material identity changes and bind notification/call contacts to verified ownership. Provide a documented manual review/appeal/recovery path without exposing raw identity documents.

**Acceptance check.** Exercise pending, abandoned, revoked, expired and manually reviewed identities plus changed email/phone; badges and booking eligibility reflect current named checks and only owned verified numbers receive account communications.

<a id="F76"></a>

### F76 — Demo/development mode does not isolate production side effects

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Deployment and operations

**Source:** [mobile/utils/env.ts:14](<../mobile/utils/env.ts#L14>); [mobile/services/emailAuth.ts:16](<../mobile/services/emailAuth.ts#L16>); [mobile/services/functions.ts:5](<../mobile/services/functions.ts#L5>); [mobile/services/payments.ts:28](<../mobile/services/payments.ts#L28>)

**Problem and impact.** Comments describe safe mocked/backend-free demo builds, but IS_MOCK only changes selected authentication/UI paths. callFunction, KYC, bookings and payments still use the configured Supabase backend. Mock authentication itself calls signInAnonymously against that backend. A demo build with a usable real session can perform real actions, while normal Metro development cannot exercise genuine SMS/email OTP because __DEV__ always forces mock behavior.

**Proposed fix.** Use explicit dev/staging/production environments with backend-enforced separation, fake provider adapters/test fixtures and a visible environment indicator for nonproduction builds. Make real staging auth testable deliberately and prohibit demo credentials/endpoints in production release configuration.

**Acceptance check.** Attempt booking/KYC/top-up/payout from a demo build configured incorrectly: production rejects it, while isolated demo/staging flows remain testable without real provider side effects.

<a id="F77"></a>

### F77 — Push tokens are not revoked per device on logout or account changes

**Severity:** P1 · **Evidence:** Code-confirmed · **Area:** Security and privacy

**Source:** [mobile/app/(tabs)/profile.tsx:156](<../mobile/app/(tabs)/profile.tsx#L156>); [mobile/services/notifications.ts:22](<../mobile/services/notifications.ts#L22>); [supabase/migrations/20261020000000_initial_schema.sql:18](<../supabase/migrations/20261020000000_initial_schema.sql#L18>)

**Problem and impact.** The model stores one Expo token on users. Logout does not remove that device's registration, and an already-onboarded user signing into another device may never run the permission/token setup step. Notifications for a previous account can reach a shared/logged-out device; one device overwrites another, and disabling notifications clears the user's token globally.

**Proposed fix.** Register authenticated per-device push endpoints with revocation/session lifecycle, refresh tokens on foreground/login and deactivate only the logging-out device. Avoid sensitive lock-screen content and keep delivery/channel preferences per account/device.

**Acceptance check.** Sign in/out of two accounts on one device and one account on two devices; only authorized current devices receive the intended alerts and one device's preference does not disable another.

<a id="F78"></a>

### F78 — Wallet and review dates still expect Firestore Timestamp objects

**Severity:** P2 · **Evidence:** Code-confirmed · **Area:** UI and accessibility

**Source:** [mobile/app/(tabs)/wallet.tsx:229](<../mobile/app/(tabs)/wallet.tsx#L229>); [mobile/app/reviews.tsx:141](<../mobile/app/reviews.tsx#L141>); [mobile/services/supabase.ts:156](<../mobile/services/supabase.ts#L156>)

**Problem and impact.** Supabase returns ISO timestamps and the adapter leaves them as strings, but wallet/review rows call createdAt?.toDate?.() and fall back to 'Recent'. Dates therefore disappear even for old transactions/reviews, weakening the history users need to reconcile money and reputation. Other screens use separate ad hoc date parsing.

**Proposed fix.** Define one typed date/time DTO and locale/timezone formatting helper, parse ISO values consistently and explicitly handle invalid/missing timestamps.

**Acceptance check.** Old/new wallet entries and reviews show their actual dates across local timezone/day boundaries; missing timestamps are labeled honestly rather than all appearing recent.

**Implementation status (2026-10-23).** Wallet and review screens already use the shared date formatter, which parses Supabase ISO strings, numeric timestamps and legacy `toDate()` values. They now label missing/invalid dates as “Date unavailable” instead of implying every record is recent. Device timezone boundary coverage remains part of the native release test matrix.

## Production capability gap matrix

These are capability-level requirements and scope choices, not an additional vulnerability count. Existing partial implementation is identified to avoid rebuilding features unnecessarily.

| ID | Priority / scope | Capability | Current state | Proposed completion |
| --- | --- | --- | --- | --- |
| G01 | Before public launch | A recoverable customer and cleaner Activity hub | Missing/partial; F24/F36/F44 | Pending, upcoming, active, payment-required, disputed and historical jobs with receipts, resumption and pagination. |
| G02 | Before public launch | Authoritative quote and service catalog | Partial; F28/F29 | Server pricing/duration by scope, supplies, service area and add-ons; immutable accepted quote and reviewed change orders. |
| G03 | Before public launch | Reliable dispatch and supply operations | Partial; F26/F30/F35/F52 | Online leases, dispatch rounds, exclusive offers, confirmation timeouts, safe rematching and operator exception queue. |
| G04 | Before public launch | Service area and address quality | Partial; F28 | Search/pin correction, saved named addresses, coverage/lead-time validation, approximate prebooking disclosure and exact participant access. |
| G05 | Before public launch | Cleaner availability calendar | Only booking-derived blocks exist | Working hours, breaks, manual blocks, leave, timezone, travel buffers and a calendar that actually controls dispatch/assignment. |
| G06 | Before public launch | Customer-approved schedule and work changes | Partial; F33 | Reschedule/change-order proposals, expiry and consent; preserve the previous agreement until accepted. |
| G07 | Before public launch | Arrival/start/no-show protocol | Partial; F12/F40 | Arrival evidence or customer PIN, grace periods, customer/cleaner no-show reporting, fair cancellation rules and safe support overrides. |
| G08 | Before public launch | Proof, quality review and rework | Partial; F12/F36/F37 | Before/after checklist, reachable customer approval/dispute, evidence retention, missed-item/rework workflow and quality-resolution policy. |
| G09 | Before public launch | One financial source of truth | Partial; F38–F48 | Double-entry or equivalent auditable subledgers, holds/reversals, immutable intents/attempts/refunds, payout states and automated reconciliation. |
| G10 | Before public launch | Receipts and explainable charges | Partial/missing | Customer receipts and cleaner statements showing gross, fees, supplies, refunds, payout holds and method-specific protection; invoice/tax treatment agreed for the business. |
| G11 | Before public launch | Full identity/contact/account lifecycle | Partial; F13/F18–F21/F75 | Verified email/phone linking, provider account conflicts, recent reauth, recovery, session/device revocation, profile corrections and durable account deletion. |
| G12 | Before public launch | Current vetting and appeals | Partial; F75 | Named identity/qualification/background checks, operational approval where promised, expiry/revocation, manual review and appeal without unneeded document storage. |
| G13 | Before public launch | Safety operations | Partial; F02/F12/F52/F58 | Staffed incident handling, emergency contact guidance, severity/SLA/escalation, block/report counterpart, evidence and abuse-resistant controls. An SOS button alone is insufficient. |
| G14 | Before public launch | Usable operational dashboard | Partial; F53–F60 | Case/booking/payment detail timelines, valid filters, dispatch/reassignment, refunds, owner assignment, notes, audit viewer, reasons and truthful status. |
| G15 | Before public launch | Least-privilege staff administration | Partial; F08–F10/F59 | Direct DB permission matrix, MFA assurance, role delegation boundaries, invite/session revocation, offboarding and lost-factor recovery. |
| G16 | Before public launch | Durable messaging and notifications | Partial; F49–F52/F77 | Transactional chat/outbox, delivery receipts, per-device preferences, reliable deep links, scheduled reminders, offline retry and abuse controls. |
| G17 | Before public launch | Privacy/media lifecycle | Partial; F06/F14/F15 | Secure native uploads, EXIF/location hygiene, narrowly scoped signed media, deletion/retention, consent versioning, access/export/correction process and shared-device handling. |
| G18 | Before public launch | Accessible and resilient mobile experience | Partial; F22/F23/F51/F62 | Large text/screen readers, usable denied-permission/manual-address path, offline/retry states, draft persistence, keyboard/safe-area checks and visible stale tracking. |
| G19 | Before public launch | Production-grade release and recovery | Not demonstrated; F69–F74 | Behavioral security/concurrency tests, compatible rollout/rollback, telemetry/alerts, restore drills, load tests and actual signed Android/iOS device/store acceptance. |
| G20 | Before using marketing audience | Consent-safe marketing | Partial; F64–F66 | Double opt-in/ownership, immutable consent history, suppression, precise audience filters, previews, quotas and resumable idempotent campaigns. |
| G21 | If commercial teams are in launch scope | Real organization operations | Membership only; F60 | Verified business profile, seats/roles, team availability/dispatch, who is legally supplying the service, customer booking ownership, consolidated billing and staff earnings/permissions. |
| G22 | After core launch unless explicitly promised | Recurring and saved bookings | Not implemented as a complete flow | Repeat schedules, skip/pause/change recurring visits, preferred cleaner substitution and explicit pricing/consent per occurrence. |
| G23 | After core launch unless explicitly promised | Two-way reputation and moderation | Only customer-to-cleaner rating exists | Cleaner-to-customer review, eligibility/window, moderation/appeal/abuse protection and clear aggregation; never invent a background-check badge. |
| G24 | After core launch | Promotions, referrals and tips | No complete active flow | Server-validated discount/referral rules and tip accounting, fraud limits and settlement/reporting; add only after ledger reliability. |
| G25 | After core launch unless promised | Product catalog and cleaner inventory | Dashboard skeleton/table only | Catalog, stock ownership, pricing, attributed sales, inventory movement, QR checkout, refunds and commission; hide the module until real. |
| G26 | Before enabling new languages/markets | Localization and country rules | Preferences collected; app mainly English | Real localization, CAT/local timezone formatting, address/phone/currency support and translated terms/support templates; avoid presenting preference as implemented language support. |
| G27 | Before relying on analytics for decisions | Operational and behavioral analytics | Partial reporting skeleton | Revenue vs GMV vs commission definitions, retention/conversion/fulfilment/quality/fraud metrics, reproducible aggregates, consent-safe behavioral events and no fake zero/placeholder metrics. |
| G28 | Before presenting blog as an acquisition channel | Published content delivery | Partial; F63 | Working production host/CORS, article prerendering, canonical/OG/schema/sitemap updates, redirects and real not-found/unpublished behavior. |
| G29 | Before broad distribution | Mobile account and release hardening | Partial | Platform-backed refresh-token storage where appropriate, app foreground/session refresh management, minimum-client/API compatibility, supported Expo/RN SDK, signed builds and crash/rollout monitoring. |
| G30 | Business decision before selling the promise | Damage, insurance and service guarantees | No complete operational workflow visible | Define damage/quality claims, supporting evidence, response windows, responsibility/cover and customer communication with qualified local legal/insurance advice where needed. |

## Five end-to-end user journeys

These are **code-traced scenarios**, not claims that five real users completed live provider/device tests. When an early blocker stops a journey, downstream steps are evaluated using the account/booking state that should have resulted. This prevents an early authentication bug from hiding later payment or support defects.

### Journey 1 — Rudo, a first-time Harare customer booking a scheduled house clean

Rudo uses an inexpensive Android phone, has patchy connectivity, prefers SMS and wants to be confident about who enters her home.

| Step | UI → service/database trace | Failure or missing behavior | Proposed completion criterion |
| --- | --- | --- | --- |
| Discover Detail | Marketing main page → beta configuration → waitlist | Beta copy is visible, but no full launch/download/coverage flow exists. Browser API preflight fails (F01); public email ownership/consent can be overwritten (F64). | Truthful launch/coverage/store links; a verified, consent-safe waitlist until launch. |
| Read terms and register | Sign-in → customer-agreement → AuthGuard; SMS send/verify | The guard sends signed-out users away from legal pages; development/demo OTP behaves differently from real auth (F21/F76). | Rudo reads the exact terms, returns to signup and proves ownership of her phone. |
| Set up account | create-profile → users update; permission setup | Location denial blocks all progress, even though she knows her address. No verified contact-editing flow exists (F19/F22). | Manual address and optional notification onboarding work; contact changes require ownership. |
| Compare cleaners | searchVerifiedCleaners → sanitized profile DTO; favorites | Cards cannot open a complete profile/rebook flow, and favorites chat passes an unsupported cleanerId (F61). | Inspect named verification checks/reviews and send a request to an eligible chosen cleaner, or deliberately choose open bidding. |
| Describe the clean | booking/create → service catalog/checklist/photos | Native photo Blob uploads can fail; the cleaner feed later loses most scope and photos (F04/F06). | Rudo's agreed scope is retained, safely summarized and visible to the quoting cleaner. |
| Set address/time | current GPS → edit address → geocoder/date presets | Text can refer to one address while stored pin stays at the old GPS position. Past/out-of-zone times/locations are weakly enforced (F28). | Confirm one address/pin/time/zone object before submission. |
| Post and leave app | createBooking → create_booking → jobs/openjobs/jobevents | A lost response/new timestamp creates duplicates. No Activity route restores the pending request (F24/F25). | Retry/relaunch resolves to the same request with all pending offers visible. |
| Receive and accept quote | submitBid → bids → notify; offers → accept_bid | Alerts fail column mapping; cleaner IDs/scope fail upstream; concurrent quotes can race. Wallet is captured at acceptance (F02/F03/F31). | A quote arrives once with total/supplies/method, and one authoritative accepted agreement is stored. |
| Follow arrival and work | tracking → cleaner position → Mapbox route → arrival/start/completion RPCs | Stale tracking is not explicit, arrival lacks reliable evidence and fake photo paths can satisfy completion (F12/F35). | Freshness is visible and valid service evidence/check-in is recorded. |
| Inspect result or dispute | COMPLETED listener → PAYMENT instead of review; respondToCompletion | Review/dispute controls become unreachable and a dispute does not enforce a financial hold (F36/F37). | Rudo can inspect before/after evidence, confirm or open a real held dispute, and receives the outcome. |
| Pay, rate, retain receipt | settle_job_payment → ledger → submit_booking_rating → history | Paid bookings reopen the payment step; cancelled retained funds lack full accounting; receipts are incomplete (F36/F40/G10). | One settlement, correct receipt/fee breakdown, one eligible rating and a stable read-only history view. |
| Close account later | deleteAccount → recent-auth check → close_account/Auth delete | Supabase auth_time mismatch blocks deletion; media/precise coordinates and some obligations are missed (F13/F14). | Reauth, settle obligations, receive a durable deletion/redaction result. |

### Journey 2 — Tariro, a returning customer requesting an urgent car clean with Paynow

Tariro needs Book Now, adds supplies, closes the payment browser by mistake and later reports an incomplete clean.

| Step | UI → service/database trace | Failure or missing behavior | Proposed completion criterion |
| --- | --- | --- | --- |
| Start an instant car booking | Home Car shortcut → booking/create category preselection | The shortcut skips the only booking-mode choice (F27). | Book Now is clearly reachable and distinct from quote scheduling. |
| Confirm service/price | DEEP_DETAIL + vehicle choices + supplies → server fixed-price map | Condition, size, add-ons and duration do not affect price/capacity (F29). | Immutable supported-scope quote, supplies total and accurate expected duration are disclosed. |
| Find a nearby cleaner | create_booking → search_instant_cleaners/PostGIS → instantoffers | Dispatch needs fresh location, valid coverage and server eligibility; no-candidate/expired states leave stale requests (F26/F35). | A truthful matching state with deadline, fallback, cancellation and safe rematching. |
| Cleaner accepts | respond_instant_offer → pending bid; customer notification | Alerts fail; routing lacks type. The cleaner has no exclusive confirmation reservation (F02/F30/F50). | Exactly one temporarily reserved eligible cleaner, clear customer confirmation deadline and no misleading acceptance. |
| Choose Paynow | acceptBid → accept_bid capture/assignment → standard SDK checkout | BuySafe integration semantics need staging proof; replay can reinitialize payments and first init is not a durable external transaction (F42/F47). | One recoverable intent/attempt with verified provider protection and no replay side effect. |
| Close browser / lose network | browser dismissal → app kill/restart → payment-return | No native return route and no useful pending checkout-resume control; retry can remain INITIATING (F43/F44). | Tariro finds the same payment-required job in Activity and resumes/reconciles its original attempt. |
| Receive provider update | signed webhook/poll → apply_paynow_status | Hash/amount checks exist, but the newest migration can regress delivery/dispute status. Missed events lack reconciliation (F41/F45). | Duplicate/out-of-order events converge safely and a missed callback is repaired. |
| Track cleaner | native Mapbox/config → location updates/directions | Private download token leaks into public config if used; tracking freshness and background lifecycle need repair (F07/F35). | Build secret stays private, signed native app displays fresh/explicitly stale progress and a safe fallback. |
| Report missed work | completion UI → dispute/support case | Completion review is bypassed; support has no complete case detail/evidence view or financial hold (F36/F37/F58). | A visible dispute freezes the appropriate settlement path and gives both parties a clear next step. |
| Request refund | admin request metadata → manual Paynow portal → callback | Request is not an actual refund; partial/cumulative accounting and refund-after-payout remain incomplete (F46). | Requested/approved/provider-confirmed refund states and amounts reconcile to the original capture and cleaner/platform ledger. |
| Return another day | history/receipt/favorite | Pending/needs-action jobs and receipts are incomplete; favorite does not rebook (F24/F61). | Tariro can see final payment/refund evidence and rebook without repeating the original job. |

### Journey 3 — Nyasha, an independent cleaner using phone signup and earning her first payout

Nyasha has never used Supabase, denies a permission once and expects identity verification to unlock work safely.

| Step | UI → service/database trace | Failure or missing behavior | Proposed completion criterion |
| --- | --- | --- | --- |
| Sign in | default SMS tab → Auth user/profile | SMS-only users have no way to add the verified email later required for cleaner application; iOS Google rendering can also block the sign-in surface (F05/F19). | Either provider leads to one account with owned required contacts and a clear recovery path. |
| Complete Didit | register-cleaner → start session → privatekyc → decision refresh | Local configured alias/workflow names do not match the branch; no complete recheck/revocation/review lifecycle exists (F68/F75). | Hosted verification works with protected server secrets, named check status and retry/review/appeal. |
| Apply and accept agreement | submitCleanerApplication → profile update → acceptCleanerAgreement | Verification/email state can stay stale because reload ignores results. Advertised background approval is absent (F20/F67/F75). | Server decisions and versioned acceptance determine capability; the screen updates without reinstall/relogin. |
| Add proof/portfolio | local photo → storage → cleanerportfolio | Shared Blob upload path is unsupported on RN; raw/signed paths and ownership/retention need clear lifecycle (F06/F15). | Valid authorized media appears, can be removed and cannot masquerade as a trust document. |
| Go online | updateCleanerPresence → foreground/background permission → TaskManager/locationPoint | UI/server/task state can diverge; logout/role switch does not reliably stop sharing (F35). | Opt-in online lease, fresh position, visible permission failure and explicit stop/restart behavior. |
| Assess a nearby scheduled request | openjobs subscription → normalization → job detail | ID becomes undefined; sanitized summary lacks the very scope/distance needed to quote (F03/F04). | Correct stable job ID, safe scope summary/distance and an honest ETA. |
| Quote / accept an instant offer | submitBid/respond_instant_offer → bids/offers/availability | Duplicate/racing quotes and unreserved customer confirmation allow contradictory commitments (F30/F31). | One active quote per intent and no overlapping confirmed/reserved commitments. |
| Travel, arrive, clean | job status RPCs → background location → evidence | Role switch can break assigned-job actions, arrival is not verified and completion evidence can be fake (F11/F12/F35). | Role-independent assignment capabilities, safe check-in, visible job checklist and valid evidence. |
| Mark complete | completeBooking → customer response/payment/ledger | Cleaner is routed to 'Rate your cleaner', whose server call rejects her role (F36). | Cleaner sees submitted/accepted/disputed/paid earnings states and support access, not the customer's rating form. |
| Request payout | earnings balance → secure encrypted request → two-admin queue | UI/DB availability disagree; role-dependent wallet buckets are inconsistent; pending rejection/transfer recovery is incomplete (F38/F39/F48). | One server-calculated available amount, protected destination and exactly-once reserved/paid/rejected history. |
| Pause/logout/use another phone | presence/notification/profile/auth lifecycle | Background tasks and tokens can survive logout; one token overwrites other devices (F35/F77). | Online/location/push registrations follow account/device consent and stop for the correct session. |

### Journey 4 — Farai, a cleaning-business owner inviting a team

Farai wants to register the business, invite cleaners, understand eligibility, assign work and reconcile team income.

| Step | UI → service/database trace | Failure or missing behavior | Proposed completion criterion |
| --- | --- | --- | --- |
| Register a business | organization form → registerOrganization → organizations/users | Separate writes can partially succeed; organizations is absent from the realtime publication and the form does not explicitly reload (F60). | Immediate successful state with one authoritative organization/profile relationship. |
| Invite a cleaner | createOrganizationCleanerInvite → hashed code/email/expiry | No complete invite status/revoke/resend management; team roles are minimal. | An owner sees pending/accepted/expired/revoked invitations and can safely replace one. |
| Cleaner joins | email + KYC → joinOrganization → membership/invite/profile | Phone-first cleaner email dead-end; three unchecked writes and multi-org/single-org contradictions (F19/F60). | A verified intended identity joins atomically under a defined affiliation policy. |
| Review team eligibility | organizationMembers snapshot → fixed 'Identity verified' UI | Stored verification snapshot/labels can be stale after suspension/revocation (F60/F75). | Current check/capability state appears without exposing private KYC. |
| Set schedules and assign work | available calendar/team dispatch | Existing organization view is membership management, not an operational team product (G05/G21). | Defined business roles and authorized work assignment using actual capacity and worker consent. |
| Handle staff changes | removeOrganizationCleaner → membership deletion/profile update | Separate writes and ambiguous multiple memberships risk wrong affiliation; no active-job transfer policy. | Offboarding preserves valid jobs/history, removes the correct access and supports reassignment safely. |
| Communicate/escalate | job-scoped chat/support | No complete team/owner communication permissions or case workspace exists (F49/F58/G21). | The owner can access only authorized team work and use a traceable support process. |
| Bill and pay | individual wallets/payouts | No consolidated business billing, team commission/earnings ownership or statements are defined. | Either explicitly launch individuals only or implement the business financial/contractual model before advertising it. |
| Audit business access | owner/member/private profile RLS | Direct REST and admin role boundaries need tests; business verification is self-entered. | A tested organization permission matrix plus owned business identity, seat revocation and export/retention policy. |

### Journey 5 — Chipo, a restricted operations/marketing administrator, with a separate finance approver

Chipo starts at a support case link, handles a cleaner replacement, coordinates a refund/payout, then sends a targeted campaign.

| Step | UI → service/database trace | Failure or missing behavior | Proposed completion criterion |
| --- | --- | --- | --- |
| Accept invitation / MFA | acceptAdminInvite → adminroles → AdminMfaGate | API gate exists, but direct-table access bypasses granular permissions/MFA. Effective invitation write ACL can allow escalation (F08/F09). | Least-privilege access holds for UI, Edge, REST and RPC; invite redemption is single-use/transactional with controlled delegation. |
| Open a case URL | /admin/support/:id → route parser/history | Reload lands on Overview and history navigation leaves stale content (F53). | The intended authorized case opens on reload/back/forward. |
| Read the incident | adminQuery support → generic table | Description, evidence, reporter, ownership and linked financial timeline are unavailable or rendered as dashes (F58). | Chipo can understand and assign/triage the case with an SLA and contact history. |
| Find affected booking/cleaner | filters/search/paging → REST queries | UUID ilike/incorrect filters and unstable timestamp cursors miss or reject records (F56). | Correct typed search/paging at production-sized datasets. |
| Replace a cleaner | adminMutation reassign_booking → direct jobs update | Completed jobs can reopen; old reserve/payment/contact identity is not moved safely (F55). | Stage-aware transactional replacement with correct financial ownership and notices to both cleaners/customer. |
| Reschedule | trigger updates booking+buffer | A modest time shift can hit its own old buffer; participant changes have no acceptance flow (F32/F33). | Correct calendar check and an accepted schedule change. |
| Refund/resolve | request_refund → support metadata → merchant portal; resolve_case | Request can look refunded before payment, and resolving the case does not execute its financial outcome (F46/F58). | Chipo records a truthful provider-confirmed outcome with reconciliation and customer communication. |
| Pay a cleaner | finance MFA → encrypted payout → approve/reveal/settle | First approver can reveal/pay despite being forbidden to settle; pending rejection and amount models disagree (F39/F48). | The separate finance administrator sees the correct amount and executes/records exactly one authorized transfer. |
| Review revenue/alerts | admin_marketplace_metrics → Overview | Series dollars are displayed as cents; support attention links go toward bookings; retry is ineffective (F57). | Revenue units reconcile and urgent items open the case needing action. |
| Send Harare-only opt-in mail | Waitlist filters → campaign API → Resend batch | Country/city/language filters are ignored; idempotency is checked after sending and never deduplicated (F65). | Previewed current-consent audience receives one correctly targeted message per campaign. |
| Offboard an admin / end shift | Admins & Security → account/session controls | Role/session/invite revoke and audit viewer are incomplete, with assurance not reacting correctly to reauth (F59). | Immediate server-enforced offboarding and a verified immutable operational timeline. |

## Proposed implementation order and release gates

This is an ordered repair plan, not an estimate of engineering days. Many findings share a root cause; fix those foundations once instead of applying screen-specific patches.

1. **Stabilize the API/database contract.** Fix browser preflight, notification column names, open-job identity, platform auth configuration and native uploads. Introduce generated Supabase database types and explicit request/response DTOs. Remove the Firebase-style compatibility assumptions incrementally. Gate: browser/native contract checks for auth, quotes, media and alerts pass.
2. **Close authorization and credential boundaries.** Explicitly reset grants, enforce permission/MFA in RLS, lock invitation writes, prevent public config secret exposure, centralize capability/account-state checks and bind contacts/devices to owned identities. Gate: anon/customer/cleaner/suspended/organization/least-privilege-admin/elevated-admin direct REST/RPC/Edge tests pass at aal1 and aal2.
3. **Make money/state changes transactional and recoverable.** Define balances/holds/commission semantics, immutable payment intents/attempts, exactly-once effects, completion/dispute policy, cancellation allocation, refund/payout transitions and reconciliation. Gate: concurrency/crash/replay tests reconcile all money and no provider outcome strands a booking.
4. **Complete the mobile core journey.** Add Activity/resumption, correct booking mode/address/quote flow, exclusive dispatch reservations, fresh tracking, accepted reschedules, evidence review, role-specific completion, receipts and robust chat/notifications. Gate: the Rudo/Tariro/Nyasha journeys pass on real Android/iOS devices with denied permissions, relaunches, multiple accounts and bad network.
5. **Build the operational control room and truthful public surfaces.** Fix routing/search/case/financial DTOs, implement real support/booking/payout tools, audience targeting/consent and blog delivery. Hide unfinished product/analytics/commercial claims until implemented. Gate: Farai (if teams are in scope) and Chipo can complete their responsibilities without direct SQL or misleading success messages.
6. **Prove release operations.** Upgrade/test supported dependencies, rehearse source-data import, run a full staging provider lifecycle, native signed builds, load/abuse tests, backups/restores/rollback and staffed incident drills. Gate: a reviewed release checklist has actual evidence, owners and rollback criteria, not only code compilation.

### Required test matrix before production

- **Identity/access:** signed out; fresh customer; phone-only customer; verified cleaner; suspended/banned user with an existing token; org owner/member/removed member; marketing-only admin; finance reader/writer; elevated admin; each at the applicable assurance level. Test direct REST and RPC as well as the UI.
- **Lifecycle:** scheduled/instant; no candidates; duplicate bids; simultaneous accepts; expiry; reschedule self/other collisions; no-show; each cancellation actor; valid/fake completion; confirmation/dispute/24-hour timeout; reopen/retry/relaunch.
- **Money:** wallet/direct/Paynow, insufficient commission/funds, same operation replay, provider success with dropped response, old callback after new attempt, out-of-order statuses, partial/full/refund-after-payout, role switch during top-up/refund, duplicate payout and two-admin separation.
- **Media/messages:** device-native file formats and sizes; wrong object owner/path; nonexistent object; signed-link expiry; customer/cleaner/avatar authorization; unread-count races; duplicate sends; token revocation and multi-device notifications.
- **Operations:** every supported admin action mutates the intended record once; unknown commands fail; permissions/MFA remain enforced at the database; support can inspect/communicate/resolve; campaigns honor audience and latest consent.
- **Environment/release:** explicit staging separation, values-redacted configuration readiness, source import count/balance reconciliation, locked artifact rollout and rollback, restore test, worker/provider alarms, load limits and signed native store builds.

### Decisions the product owner still needs to make

- Which launch area, service scopes and working hours are actually supported? Is the first release individuals only, or are commercial teams genuinely in scope?
- What is a fixed-price unit of cleaning, how is duration estimated, who provides supplies, and how are agreed extras/price changes approved?
- What happens financially when the customer cancels, the cleaner cancels, someone does not show, the customer does not respond, work is disputed or a provider refund arrives after payout?
- Which verification checks are promised, who reviews them and how often do they expire? Which safety incidents can the staffed team handle and within what response time?
- What payment custody/payout/refund, insurance, tax and data-retention policies will the business operate under in its actual jurisdiction? Implement the decided policy; do not invent guarantees in UI copy.

These decisions need not block foundation fixes. Recurring bookings, tips, promotions, advanced analytics and products can be deferred unless they are explicitly part of the first commercial promise.

## Evidence files and coverage inventory

- [Machine-readable finding backlog](audit/findings.json) — IDs, priorities, confidence, source needles and proposed acceptance checks.
- [Tracked file inventory](audit/codebase-inventory.csv) — source/assets/config grouping and line counts for the audited snapshot.
- [Dependency audit summary](audit/dependency-audit-summary.json) — exact affected package entries, advisory URLs and suggested-fix metadata from the registry, with runtime/tooling reachability still to be assessed.
- [Isolated source probes](audit/source-probes.cjs) and [recorded probe output](audit/source-probes.txt). After installing `site` dependencies, run `node docs/audit/source-probes.cjs`; the script stubs auth/database/environment and forbids network.
- [Mocked-browser observations](audit/browser-results.txt) — built-frontend checks with fake Supabase responses, not live API results.

The checked-in audit artifacts contain no credential values or customer/provider data. Application code was not changed by the audit. Use the findings and acceptance matrix as the repair backlog; production readiness requires evidence that the repaired journeys, authorization boundaries and financial invariants hold in staging and on real devices.
