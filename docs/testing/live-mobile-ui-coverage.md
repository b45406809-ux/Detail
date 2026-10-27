# Live mobile UI test coverage

The `Live Android APK UI test` workflow builds the production-profile APK, installs it on an Android emulator, and runs the Maestro journeys against disposable accounts in the live Supabase project. It refuses to run booking submission while the live configuration says bookings are open.

## Automated in the workflow

- New customer: welcome, email/password sign-in, customer agreement, profile creation, permission gate, home screen, and the closed-booking response after completing the first booking form.
- Cleaner: email/password sign-in, customer agreement, profile setup, role selection, cleaner registration, and the Didit verification gate. It does not start a Didit verification session.
- Signed-in customer route smoke: Home, Activity, Messages, Wallet, Profile, Service History, Favorites, Find Cleaners, Notifications, My Reviews, Help & Support, Support Requests, Organization, Email Address, Cleaner Registration, Portfolio, Instant Offers, both agreements, Privacy Policy, booking creation, quote offers, booking confirmation, job unavailable, and tracking unavailable.
- Signed-out route smoke: sign-in, forgot password, email verification-code entry, profile setup, permissions, and password reset views. It does not request or send a reset email or verification code.
- Account cleanup: temporary Auth accounts and related data are removed/anonymized and checked after the emulator run, including when Maestro fails.

## Still requires provider/device setup or safe test fixtures

Screen rendering is not proof that every backend mutation works. The live booking kill switch prevents testing dispatch, quotes, assignment, completion, disputes, and booking payments against production. Twilio SMS, a Didit identity session, Paynow checkout/refunds/payouts, Google/Apple native OAuth, camera/gallery uploads, background location, and push delivery need their own controlled provider fixtures and signed-device runs. The workflow deliberately does not simulate successful provider callbacks or write financial records into production.

The `Validate Detail` CI workflow also runs Playwright against the production marketing homepage, waitlist validation, privacy and terms pages, public blog, and all 12 administrator dashboard modules. It reloads a routed admin module to catch route restoration failures and checks that admin pages show no MFA gate. These checks only read data; they do not send campaigns, create invites, modify settings, or submit the waitlist. Supabase SQL and Edge Function suites run separately. No single screen smoke claims that every business capability in the production-readiness audit works end to end.
