# SMSPoP for Supabase phone authentication

The `auth-sms-smspop` Edge Function adapts Supabase Auth's signed **Send SMS Hook** event to SMSPoP's REST campaign API. The SMSPoP token remains server-side. A successful hook response is returned only when SMSPoP confirms that the requested recipient was accepted; skipped, failed, or invalid recipients fail closed so Auth does not report an OTP as sent when it was not.

## Provider requirements

SMSPoP currently documents SMS support for Econet and NetOne Zimbabwe numbers. Its API documentation requires an approved sender ID. The [SMSPoP FAQ](https://smspop.co.zw/faq) says its shared sender can be used for web campaigns, and that SMSPoP Support can enable the shared sender for API use; shared-sender API messages have campaign/daily limits and cannot contain links. Ask Support for the exact sender ID and API access before using it while `Detail` approval is pending. Confirm Telecel and non-Zimbabwe coverage with SMSPoP before using this as the only phone-auth route. SMSPoP's [pricing page](https://smspop.co.zw/pricing) advertises prepaid packs; its [API docs](https://smspop.co.zw/documentation) are the source for endpoint and network coverage.

## Configure after SMSPoP account setup

1. Register at [SMSPoP](https://smspop.co.zw/register), apply for the `Detail` sender ID, and wait for approval on the networks you need. If you want to test before approval, contact SMSPoP Support to request shared-sender API access and use only the exact sender ID they provide.
2. Buy the smallest suitable credit pack and create an API token under **API Tokens → Generate New Token**. Copy the token when it is shown.
3. Deploy the `auth-sms-smspop` Edge Function. Set these as Supabase Edge Function secrets (not in the mobile app):
   - `SMSPOP_API_KEY` or `SMSPOP_API_TOKEN`: the SMSPoP bearer token. The production deploy workflow accepts either GitHub Actions secret name and sets `SMSPOP_API_KEY` in Supabase.
   - `SMSPOP_SENDER_ID`: the approved sender ID, e.g. `Detail`.
   - `SEND_SMS_HOOK_SECRET`: the signing secret generated when configuring the Supabase Auth hook (keep its full `v1,whsec_...` value).
4. In Supabase **Authentication → Hooks → Send SMS Hook**, configure an HTTP hook URL:
   `https://<project-ref>.supabase.co/functions/v1/auth-sms-smspop`
   Paste the same generated signing secret into the Edge Function secret. This hook replaces the built-in SMS provider for Auth sends.
5. The hook composes the SMS body itself, so Supabase's built-in Auth SMS template is bypassed while this hook is enabled. The function currently sends a one-segment Detail verification message. Test once on a registered/approved recipient and inspect SMSPoP's delivery report.

The production GitHub Actions deploy workflow can copy `SMSPOP_API_KEY`, `SMSPOP_SENDER_ID`, and `SEND_SMS_HOOK_SECRET` into Supabase Edge Function secrets and deploy this function. Add the API token and hook secret as GitHub Actions secrets, and the approved sender ID as the `SMSPOP_SENDER_ID` Actions variable. GitHub secrets are only available inside workflow runs; they cannot be read back by local tools.

The hook validates Supabase's Standard Webhooks signature, sends only one recipient per campaign, and never logs OTPs, full phone numbers, provider response bodies, or API tokens. SMSPoP can still accept a send before a carrier delivery receipt arrives; use its delivery report to distinguish accepted from delivered messages.
