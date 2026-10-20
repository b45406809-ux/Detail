# iOS App Store readiness

Detail now has an iOS EAS production build profile, the `com.detail.app` bundle identifier, Sign in with Apple capability, foreground location and camera purpose strings, an in-app privacy policy, and an in-app account deletion flow. The production profile does not enable the client-side callable simulator. Map and Firebase/Paynow/Didit production configuration still needs to be supplied through the appropriate EAS and Firebase environments.

Before submission, complete these Apple-side items:

- Enroll the organization in the [Apple Developer Program](https://developer.apple.com/programs/), register the App ID and Sign in with Apple capability, and configure distribution credentials in EAS.
- Create the app in [App Store Connect](https://appstoreconnect.apple.com/), then add the product name, description, category, support URL, privacy-policy URL, age rating, screenshots for the required device sizes, and review notes/test account.
- Complete [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) accurately for Firebase Authentication, identity verification, precise booking location, photos, phone/email, analytics if enabled, and payment processing.
- Review the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) for user-generated content, service marketplaces, payments, account deletion, privacy, and required moderation/support flows. Cleaning services are physical services, so do not add App Store in-app purchase for the booking charge; verify current policy and local payment obligations before release.
- Build and install a production-signed iOS artifact, test sign-in, account deletion, booking/cancellation, notifications, location permissions, camera/library permissions, payment status and payout support flows on real devices, then submit through EAS Submit or Transporter.

The environment blocks direct requests to `developer.apple.com` with an outbound proxy 403, so the official pages above were not live-verified during this implementation. Confirm the current review requirements and App Store Connect privacy declarations before submitting. No Apple team ID, signing credentials, support URL, screenshots, or reviewer account were present in the workspace, so those release inputs cannot be completed from source code alone.
