# Didit cleaner identity verification

Cleaner registration uses a hosted Didit verification session. Didit collects identity documents and any workflow-required liveness information. Detail stores the provider session reference and decision status in the private Supabase `privateKyc` table; the mobile app never receives the Didit API key. A cleaner role is granted only after the server confirms approval, the cleaner completes their application, and accepts the Cleaner Agreement.

Zimbabwe is listed on Didit's country coverage page: <https://didit.me/solutions/countries/zimbabwe/>. Configure the Zimbabwe document checks and workflow in the Didit dashboard. Verify current pricing/quotas, accepted document types, data retention, and controller/processor terms with Didit before enabling live checks.

## Configure and deploy

1. Create a Didit API key and Zimbabwe verification workflow in the Didit dashboard.
2. Store `DIDIT_API_KEY` (or the accepted alias `DIDIT_KYC_SECRET_KEY`) and `DIDIT_WORKFLOW_ID` in Supabase Edge Function secrets (`supabase secrets set ...`). Never add either value to an Expo or Vite client variable.
3. Deploy the Supabase migrations and `marketplace-api` Edge Function. The mobile app starts a session and can refresh its decision; approval is checked by server-side code.
4. In the app, select **Become a Cleaner**, accept the identity notice, complete the hosted check, return to Detail, and refresh if the provider is still processing. After approval, complete the cleaner application and accept the Cleaner Agreement.

Test with Didit's sandbox workflow before using live verification. Rejected or pending decisions must never grant cleaner access. Detail does not store the raw identity document images. Review the in-app privacy notice against the selected workflow and Didit's current retention and processing terms before production use.
