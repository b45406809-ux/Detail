# Didit cleaner identity verification

Cleaner registration launches a hosted Didit verification session. Didit collects identity information and documents; Detail stores the session reference in the signed-in user's private Firestore subcollection and receives the decision from its API. The mobile app never receives the Didit API key. A cleaner role is granted only after the server sees an approved decision and the cleaner accepts the agreement.

Zimbabwe is listed on Didit's country coverage page: <https://didit.me/solutions/countries/zimbabwe/>. Configure a Didit workflow in the Didit dashboard for the Zimbabwean identity checks Detail requires, then copy its workflow ID. Confirm the workflow, pricing/quota, document types and retention policy in the Didit account before live use.

## Configure and deploy

1. Create a Didit API key and verification workflow in the Didit dashboard. Select the document and liveness checks appropriate for Zimbabwe.
2. From the repository root, store the API key in Firebase Secret Manager:

   ```bash
   firebase functions:secrets:set DIDIT_API_KEY
   ```

   Enter the key at the Firebase prompt; do not put it in the app or a checked-in file.
3. Deploy the Functions and Firestore rules:

   ```bash
   firebase deploy --only functions,firestore:rules
   ```

   Firebase prompts for the non-secret `DIDIT_WORKFLOW_ID` on the first deployment. Enter the workflow ID from Didit. Firebase Functions deployment requires the Firebase project to have billing enabled.
4. In the app, select **Become a Cleaner**, complete the Didit check, return to the app and press **Check** if the provider is still processing. After approval, complete the cleaner form and accept the Cleaner Agreement.

The API integration uses Didit's session creation and decision endpoints from Cloud Functions. Test with Didit's sandbox workflow before using live verification. Rejected or pending decisions never grant cleaner access. Verification results are checked server-side; clients cannot change verification status or cleaner role in Firestore.

The in-app privacy notice explains that identity documents go directly to Didit. Review it against the selected workflow and Didit's current retention and processing terms before production use.
