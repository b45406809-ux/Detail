# Twilio in-app calls setup

Detail's chat call controls use Twilio Voice for calls between the two participants of an active booking. The caller and callee are app identities, not phone numbers. The backend issues signed access tokens and creates TwiML only after checking both participants against the booking. The TwiML enforces a five-minute maximum call duration; the app also ends a connected call at five minutes if it remains active in the foreground.

## Required protected configuration

Keep these in the protected GitHub Actions `production` environment. Do not put values in app config, source, screenshots, or chat.

| Secret | Purpose |
| --- | --- |
| `TWILIO_API_KEY_SID` | Signs Voice access tokens. |
| `TWILIO_API_KEY_SECRET` | Signs Voice access tokens; server only. |
| `TWILIO_TWIML_APP_SID` | Selects the TwiML App for app-to-app routing. |
| `TWILIO_AUTH_TOKEN` | Validates Twilio's signed webhook request; already used by the SMS integration. |
| `TWILIO_VOICE_PUSH_CREDENTIAL_SID_ANDROID` | Routes incoming-call pushes through the Android FCM credential. |
| `TWILIO_VOICE_PUSH_CREDENTIAL_SID_IOS` | Routes incoming-call pushes through the iOS APNs VoIP credential. |

The deployment workflow already forwards `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, and will forward the Voice secrets to Supabase when present. The Voice endpoints return unavailable until the required Voice key, TwiML App, and platform push credential secrets are set.

## TwiML App webhook

Create a TwiML App in Twilio Console → **Develop** → **Voice** → **Manage** → **TwiML Apps**. Set its Voice Request URL to:

`https://<supabase-project-ref>.supabase.co/functions/v1/twilio-voice-twiml`

Use **HTTP POST**. The endpoint validates `X-Twilio-Signature`, checks the job is still active and confirms both client identities are its participants. It returns a `<Dial timeLimit="300">` response. The request URL configured in Twilio must exactly match the public function URL.

## Incoming-call push

Incoming calls while Detail is backgrounded need a Twilio Voice Push Credential for each platform. Configure the Android FCM credential and iOS APNs VoIP credential in Twilio, then save their separate credential SIDs under the matching names above. The Firebase project must be the same one configured for the app. An iOS simulator cannot receive PushKit calls or validate CallKit behavior; complete those checks on a physical iPhone. Android incoming-call behavior also needs a physical-device check after FCM and the Voice credential are configured.

The mobile call controls stay unavailable until incoming-call delivery is configured and the device registers successfully. Never test with a real customer, charge, or KYC flow.

## Usage reporting

The admin overview reports Twilio Voice usage separately from Twilio SMS, using the account's prior-month Voice usage records. It is account-wide and cannot attribute those charges to Detail app calls. No call has been placed during the current test cycle.
