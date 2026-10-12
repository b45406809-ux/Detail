# Maestro mobile smoke tests

These flows are intentionally separate from load tests. Maestro drives one installed mobile build and checks the real user interface; k6 should exercise the Worker API independently.

## Prerequisites

- Install Maestro from the official installer: <https://docs.maestro.dev/getting-started/installing-maestro>
- Start the Expo app in a development build or install an EAS development/preview build.
- Use the package identifier from the installed build. The current app identifier is `com.detail.app`.
- Create a dedicated Firebase email/password test user. Do not use a personal or production account.

## Run

From the repository root in PowerShell:

```powershell
$env:APP_ID = "com.detail.app"
maestro test mobile/.maestro/00-auth-smoke.yaml
```

The authenticated flow needs a test account. Keep these values only in the current shell session:

```powershell
$env:APP_ID = "com.detail.app"
$env:E2E_EMAIL = "your-dedicated-test-user@example.com"
$env:E2E_PASSWORD = "your-test-password"
maestro test mobile/.maestro/01-email-sign-in.yaml
```

Expo Go uses its own host application identifier and is not the target for these standalone flows. For reliable runs, use an Expo development build or an EAS build with the app identifier above.

The phone OTP flow is intentionally not automated here because it requires a real SMS provider. Firebase fictional phone numbers can be added later for deterministic auth tests without sending SMS.
