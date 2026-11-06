# Guided physical-device validation v1

Use this checklist only with a staging build connected to the explicitly identified isolated Supabase project. Confirm the test accounts have the `qaRunId` tag, the production project ref differs, and no live payment credential is available to the build. Use Paynow sandbox only. Record each case as **Pass**, **Fail**, **Blocked**, or **Not run**; attach redacted evidence and backend record IDs to the current evidence index.

## Run header

- Run ID:
- Branch and source commit:
- Android APK / iOS build ID:
- Supabase project ref and migration commit:
- Appetize build ID, if applicable:
- Device model and OS version:
- Network type and approximate signal:
- Fixture account keys (never email/password):
- Tester and date:

## Android device

| ID | Check and steps | Expected result and backend evidence | Result / evidence |
| --- | --- | --- | --- |
| AND-01 | Install the pinned APK; cold launch, finish splash, background for 30 seconds, then resume. | Home becomes usable without an indefinite splash or crash; record app state and timing. | Not run |
| AND-02 | Start a customer house booking; deny location once, then use the app's permission prompt to open Android settings, allow location, and return. | Clear denial recovery; location is acquired after return; booking state remains unchanged until submitted. | Not run |
| AND-03 | In a separate run, deny location permanently; use the settings shortcut to re-enable it. Repeat with camera and photo-library access while attaching booking photos. | Permission prompts explain purpose; denied access leaves a recoverable form; allowed access attaches only the selected images. Verify upload paths belong to the tagged fixture. | Not run |
| AND-04 | Submit a sandbox booking, open Android app settings, revoke location and notification permissions, then restore them and return to the active booking. | Tracking pauses while denied and resumes only after permission returns; server state and participant privacy remain correct. | Not run |
| AND-05 | With the assigned cleaner account, enable location; lock the screen and background the app for five minutes while en route. Repeat with battery optimization enabled and disabled. | Location updates are timestamped, visible only to job participants, and stop when the job/permission ends. Record OS limits separately from app failures. | Not run |
| AND-06 | Receive a sandbox chat/bid/arrival notification in foreground and background; tap each notification. Repeat with notifications denied and an expired token. | Correct fixture account receives a single event; tap opens the matching job/chat; denied or expired delivery is not reported as delivered. | Not run |
| AND-07 | Open the official Android OAuth option if configured; cancel once and complete once using a QA identity. | Cancel returns to sign-in with no account mutation; success restores the intended session without exposing another fixture. | Blocked pending QA OAuth configuration |
| AND-08 | Open a Detail app link to a seeded test booking, then log out and open it again. | Assigned participants reach the correct booking; unrelated accounts see a denial; logged-out users are asked to sign in without leaking job data. | Not run |
| AND-09 | Begin Paynow sandbox checkout; return to the app, interrupt the handoff once, then resume and retry once. | Provider sandbox state reconciles to exactly one payment; amount, currency, fees and ledger rows agree. Never infer success from the app screen alone. | Blocked pending Paynow sandbox |
| AND-10 | During chat and an active booking, toggle airplane mode before a submit and after server acceptance; force-stop and relaunch. | Clear offline status; retry returns authoritative backend state without duplicate bookings, messages, bids or charges. | Not run |

## iPhone device

| ID | Check and steps | Expected result and backend evidence | Result / evidence |
| --- | --- | --- | --- |
| IOS-01 | Install the signed iOS candidate; cold launch and resume after 30 seconds in background. | Home becomes usable without an indefinite splash or crash; record app state and timing. | Blocked pending signed iOS build |
| IOS-02 | Repeat AND-02/03 using iOS location, camera and Photos permission choices: allow once/while using, deny, limited Photos selection, then change in Settings. | App recovers from each choice; only selected media is uploaded; no permission is silently escalated. | Blocked pending signed iOS build |
| IOS-03 | Repeat AND-05 with Background App Refresh and precise-location controls varied. | Tracking behavior matches the OS permission; participant-only visibility and timestamps are verified in the isolated backend. | Blocked pending signed iOS build |
| IOS-04 | Receive and tap foreground/background push notifications; test denied permission and token rotation after reinstall. | Recipient and route are correct; provider acceptance is distinguished from delivery; no duplicate event is recorded. | Blocked pending APNs and signed build |
| IOS-05 | Complete Sign in with Apple using a QA identity; cancel and then sign in. | Cancellation causes no account mutation; success associates only the QA identity and survives app restart. | Blocked pending Apple QA OAuth configuration |
| IOS-06 | Open a universal link to a seeded booking while signed in as a participant, a third fixture, and signed out. | The assigned users reach the job; unauthorized and signed-out paths reveal no private data. | Blocked pending signed iOS build |
| IOS-07 | Repeat AND-09 with Paynow sandbox and the iOS checkout return path. | Exactly one sandbox payment is reconciled; provider handoff and return behavior are evidenced independently. | Blocked pending Paynow sandbox |
| IOS-08 | Repeat AND-10 while backgrounding during chat, upload and checkout. | Resume reconciles with server state and never duplicates an accepted action. | Blocked pending signed iOS build |

## Evidence and cleanup

- Capture screenshots/video only with synthetic fixture data; redact email, phone, coordinates, booking IDs, codes and provider references before indexing.
- For each mutation, record the relevant tagged fixture IDs and persisted backend record IDs. For payment, include sandbox provider event/reference only after redaction and verify ledger totals independently.
- At the end of each run, sign out of every fixture account, confirm no active test jobs or pending payment/payout records remain, and run the fixture cleanup tool. Keep financial/audit history if a completed test record must be retained; anonymize it and disable the login.
- Record OS restrictions separately from app defects. A simulator or Appetize run cannot satisfy these physical-device rows.
