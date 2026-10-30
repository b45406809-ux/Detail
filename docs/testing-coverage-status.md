# Detail test coverage status

Baseline: commit `eabd7d7`, 2026-10-30. This is an evidence inventory, not a production-readiness sign-off. A screen rendering is not evidence that every control or backend action works.

| Area | Result | Evidence and remaining work |
| --- | --- | --- |
| Mobile type checking | Pass | `npm run type-check` on the baseline. |
| Marketing site build | Pass | `npm run build` on the baseline. |
| Marketing, waitlist form, privacy, terms and blog rendering | Pass, limited | [CI run](https://github.com/b45406809-ux/Detail/actions/runs/40984580133) checked rendering and empty-form validation; it did not submit a waitlist entry and verify the dashboard. |
| Admin dashboard | Failed / incomplete | Same CI run timed out after admin password sign-in waiting for Overview. Root cause and all dashboard modules remain to be verified. |
| Supabase database and Edge Function CI | Pass | Supabase job in the same CI run passed. A fresh local run was blocked when container image extraction reported no space. |
| Customer Android UI | Pass, partial | [Customer run](https://github.com/b45406809-ux/Detail/actions/runs/40991470032) covers password sign-in, onboarding, booking details and scripted account routes; it does not submit or complete a booking. |
| Cleaner Android UI and KYC gate | Pass, partial | [Cleaner run](https://github.com/b45406809-ux/Detail/actions/runs/40991752252) reaches registration and identity-check gate and checks unverified-cleaner backend rejection. Actual identity verification and verified cleaner booking remain untested. |
| Email registration and recovery | Not verified on baseline | Existing AgentMail workflows target an older Appetize build. Confirm mailbox and test latest build before reporting email delivery or code verification as passing. |
| Scheduled booking end to end | Not verified on baseline | Test request, quote, acceptance, direct-payment notice, messages, arrival, completion, rating, cancellation and rescheduling using dedicated customer and verified-cleaner fixtures. Existing SQL tests do not establish UI or live delivery. |
| Push notifications | Not verified on a real device | Verify registration, accepted quote and other event delivery, foreground banner, background tap routing and permission failure on physical Android; emulator behavior is insufficient. |
| Maps, photos, location and offline/error states | Not verified on baseline | Test real-device permission flows, address selection, camera/library, recovery, back navigation and slow connections. |
| Paynow and Twilio | Blocked pending configuration | Test unavailable-state messaging now; provider delivery and payment settlement require configured providers and separate end-to-end checks. |
| Google Play | Not verified | AAB, Play Console app setup, testing track and release requirements remain before store publication. |

Appetize workflows create and remove disposable live accounts; their success is limited to their scripted steps. Do not use real customer identities or incur provider charges for automated fixtures.
