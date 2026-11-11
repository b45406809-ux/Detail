import React from 'react';
import { BrandMark } from './BrandMark';

export function PrivacyPolicy() {
  return <>
    <header><a className="logo" href="/"><BrandMark />DETAIL</a><a className="nav-cta" href="/">Back home</a></header>
    <main className="legal">
      <p className="eyebrow">CATALYST LABS</p>
      <h1>Privacy Policy</h1>
      <p>Last updated: 11 November 2026</p>
      <p>This policy describes how Detail handles information when you use the Detail mobile app, website, beta waitlist, and related support services. Detail is a Catalyst Labs product. For privacy questions or requests, contact <a href="mailto:support@detailapp.co.zw">support@detailapp.co.zw</a>.</p>

      <h2>Information used to operate Detail</h2>
      <p>Depending on the features you use, Detail processes your name, email address, phone number, account role, profile photo, service area, cleaner profile and portfolio, identity-verification status, device and app information, push-notification token, booking details, bids, reviews, support requests, and payment and payout records. Customers may provide an address, service instructions, schedule, checklist, and photos needed for a booking.</p>

      <h2>Location</h2>
      <p>Location is used to find nearby cleaners, choose or confirm a booking location, and show progress on an active booking. If a cleaner chooses to go online, Detail shares the cleaner’s location for matching while online and for customer tracking while assigned to an active booking. A cleaner can go offline or change device permissions to stop availability sharing. Location permissions are optional for general access to the app, but location-based features need the relevant permission.</p>

      <h2>Photos, chat, and voice calls</h2>
      <p>Photos are processed when you choose to add a profile photo, cleaner portfolio image, booking or completion photo, chat photo, or support evidence. Booking chat is available to the booking participants and authorized Detail support staff. Common abusive language is screened before text messages are stored, and users can report messages or block a booking partner. Chat messages stop appearing in the in-app chat after 24 hours, but they remain in Detail’s database; the 24-hour display period is not a database deletion period. In-app voice calls are provided through Twilio. Twilio processes call connection information and carries call audio. The app does not provide call recording.</p>

      <h2>Identity checks</h2>
      <p>Cleaners may choose to complete identity verification through Didit. Didit collects the identity documents, selfie, and liveness information required by the verification flow under its own privacy terms. Detail receives the verification session and decision status; identity document images are submitted to Didit and are not stored by Detail.</p>

      <h2>Payments and marketplace records</h2>
      <p>Payment providers process payments for cleaning services, refunds, and related settlement. Detail records booking and transaction status, amounts, provider references, wallet ledger entries, and payout information needed to operate the service, resolve disputes, and maintain financial records. Payment information is shared with the relevant customer, cleaner, payment provider, and authorized support or finance staff as needed for the transaction. Do not send money to a booking partner outside the payment flow shown in Detail.</p>

      <h2>How information is shared</h2>
      <p>Detail shares information with the customer and cleaner involved in a booking so they can arrange and complete the service. Its current providers include Supabase for authentication and the marketplace backend; Cloudflare R2 for private media storage; Mapbox for maps and routes; Didit for identity verification; Paynow for payments; Resend for email; SMSPOP for SMS; Meta for WhatsApp messages; Expo Push Service, Apple Push Notification service, and Firebase Cloud Messaging for push delivery as configured; Twilio for voice calls; and Apple or Google when you choose their sign-in option. PostHog is used for optional website analytics only after consent. Cloudflare Turnstile may process waitlist form anti-abuse checks. Providers process information to deliver their services under their own terms and privacy policies. We do not sell personal information.</p>

      <h2>Website and beta waitlist</h2>
      <p>If you join the waitlist, Detail collects your customer-or-cleaner role, name, phone number, email address, country, city, area, preferred language, service interests, marketing-email choice, campaign source, and privacy acceptance record. Optional website analytics are enabled only if you accept the website analytics prompt. Waitlist marketing is sent only according to the choice you recorded; operational messages about your request are separate.</p>

      <h2>Notifications and marketing choices</h2>
      <p>Detail uses in-app and push notifications for account, booking, safety, and support updates. You can change device notification permissions in iOS or Android settings. Email, SMS, and WhatsApp marketing preferences can be managed in your Detail profile or through the unsubscribe option in a campaign message. Turning off push notifications does not prevent you from using the app.</p>

      <h2>Retention and account deletion</h2>
      <p>We keep account and service information while needed to operate Detail, support bookings, prevent abuse, resolve disputes, and meet financial or legal recordkeeping obligations. Chat messages remain in the database after they leave the chat view. When an account is deleted, Detail removes or anonymizes identifying profile information and private media where feasible. Some booking, support, payment, payout, and accounting records may be retained in de-identified form where needed to resolve obligations or maintain required records. Active bookings, wallet balances, commission, or pending payouts must be resolved before account deletion can finish. You can start deletion in the app’s Profile screen.</p>

      <h2>Security and your choices</h2>
      <p>Detail uses access controls and service-provider safeguards appropriate to the information processed. No online service can guarantee absolute security. You can update eligible profile information in the app, manage device permissions, change communication preferences, report or block another participant in a booking chat, and request access or deletion by contacting support.</p>

      <h2>Children</h2>
      <p>Detail is a marketplace for arranging cleaning services and is not designed for children to create accounts or arrange bookings.</p>

      <h2>Policy updates</h2>
      <p>We may update this policy as Detail’s features and providers change. The current version and its update date are published here. We will provide additional notice in the app when a material change requires it.</p>

      <h2>Contact</h2>
      <p>Privacy requests and questions: <a href="mailto:support@detailapp.co.zw">support@detailapp.co.zw</a>. You can also contact support by WhatsApp at <a href="https://wa.me/263714885936">+263 71 488 5936</a>.</p>
    </main>
  </>;
}
