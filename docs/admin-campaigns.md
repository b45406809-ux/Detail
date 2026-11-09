# Admin campaigns

Registered users can choose email, push announcements, in-app announcements, SMSPoP, WhatsApp, and inactivity reminders separately in **Profile → Marketing and reminders**. All choices default off. SMS and WhatsApp opt-in requires a verified account phone number. A recipient's current preference and contact details are checked again when queued work is delivered.

The admin **Waitlist & Campaigns** page retains the existing consent-filtered waitlist email campaign and adds registered-user campaigns. Campaigns can target all active accounts, customers, cleaners, or accounts inactive for at least seven days. In-app announcements are stored in the existing notifications inbox. Push requires the user to opt in to campaign push and have a current Expo device token. Inactivity reminders are sent only to users who enabled them, once per inactive period, and can be paused from the dashboard.

External campaign deliveries are queued and processed by the existing five-minute `delivery-worker` workflow. Campaign history reports provider acceptance or inbox persistence, not proof a recipient read the message. Pausing a channel holds its queued deliveries. Failed sends are not automatically retried, because a timeout can happen after a provider accepted a message. Work left processing for over 15 minutes becomes `UNCERTAIN`; check the provider before starting a replacement campaign. Retry keys prevent the admin page from accidentally queuing a second campaign after a lost response.

## Provider configuration

The production Supabase deployment workflow copies these GitHub Actions environment values into Supabase Edge Function secrets. Keep credentials in GitHub Secrets; never add their values to the repository.

- Email: `RESEND_API_KEY` (or `EXPO_RESEND_API_KEY`).
- SMS: `SMSPOP_API_KEY` (or `SMSPOP_API_TOKEN`) and the `SMSPOP_SENDER_ID` repository variable.
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and the `WHATSAPP_TEMPLATE_NAME` repository variable. Optional repository variables: `WHATSAPP_GRAPH_API_VERSION` (defaults to `v22.0`) and `WHATSAPP_TEMPLATE_LANGUAGE` (defaults to `en`). The named Meta WhatsApp template must be approved, use a body text variable, and be approved as a marketing template. Detail supplies the campaign title, message and channel-specific opt-out link in that body variable.
- Push uses Expo's push service and requires no additional server credential. Users still need a registered device token.

The campaign screen returns a configuration error and does not queue a send when a selected provider is missing required credentials. Test provider configuration with a small, opted-in audience before a larger send.
