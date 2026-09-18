# Detail Mobile UI — Figma reconstruction and handoff specification

**Status:** implementation-derived source of truth  
**Platform:** Expo / React Native, iOS and Android  
**Primary reference:** `mobile/` at the revision containing this document  
**Design intent:** premium, calm cleaning marketplace; light canvas, deep indigo identity, soft glass surfaces, highly rounded geometry, and clear operational states.

This document contains the information a product designer needs to rebuild the current mobile application in Figma without treating screenshots as the source of truth. Where responsive values depend on a device, use Auto Layout and the constraints below rather than fixing the design to one screenshot.

---

## 1. Figma file structure

Create one Figma file named **Detail — Mobile Product UI** with these pages:

1. `00 Cover & changelog`
2. `01 Foundations`
3. `02 Components`
4. `03 Auth & onboarding`
5. `04 Customer home & discovery`
6. `05 Booking flow`
7. `06 Cleaner workflow`
8. `07 Tracking & completion`
9. `08 Messages, wallet & profile`
10. `09 Secondary & legal`
11. `10 States & accessibility`
12. `11 Prototype flows`
13. `12 Developer handoff`

Use **390 × 844 px** as the primary iPhone frame and **360 × 800 px** as the compact Android validation frame. Add a 430 px-wide large-phone validation frame. Do not design tablet-specific screens unless product scope changes.

### Naming

- Frames: `Platform / Area / Screen / State`, e.g. `iOS / Booking / Service / House selected`.
- Components: `Mobile/<family>/<component>`.
- Variables: `Color/<group>/<token>`, `Space/<token>`, `Radius/<token>`.
- Variants: use properties such as `Theme=Light|Dark`, `State=Default|Pressed|Disabled|Loading|Error`, `Role=Customer|Cleaner`, and `Platform=iOS|Android`.

---

## 2. Foundations

### 2.1 Colour variables

These values come from `mobile/constants/theme.ts` and `mobile/tailwind.config.js`.

| Figma variable | Hex | Usage |
|---|---:|---|
| `Brand/50` | `#F0EDFE` | palest selected surfaces |
| `Brand/100` | `#DDD5FD` | map/demo gradients, quiet accent |
| `Brand/200` | `#BCAAFB` | gradients |
| `Brand/300` | `#9580F7` | gradients |
| `Brand/400` | `#7357F2` | glow/highlight |
| `Brand/500` | `#3906D2` | **primary Detail purple**, main CTA, selected controls |
| `Brand/600` | `#2F05B0` | pressed primary |
| `Brand/700` | `#27049C` | dark accent |
| `Brand/800` | `#1E0378` | deep accent |
| `Brand/900` | `#150256` | darkest brand text/background |
| `Ink/Primary` | `#0F0B2E` | primary text |
| `Surface/App` | `#F2F1F5` | tab-screen background |
| `Surface/White` | `#FFFFFF` | cards, auth background |
| `Surface/Dark` | `#0D0A24` | dark/glass background |
| `Surface/Dark card` | `#17133A` | dark cards |
| `Border/Dark` | `#2A2456` | dark surface borders |
| `Semantic/Success` | `#0FB77A` | completed, online, credits |
| `Semantic/Warning` | `#F5A524` | processing and caution |
| `Semantic/Danger` | `#E5484D` | failures, delete, destructive controls |

Common implementation neutrals are Tailwind Slate: `Slate/50 #F8FAFC`, `100 #F1F5F9`, `300 #CBD5E1`, `400 #94A3B8`, `500 #64748B`, `700 #334155`, and `900 #0F172A`. Create these as variables rather than detached colours.

#### Gradients

- `Gradient/Brand`: `#3906D2 → #27049C`.
- `Gradient/Brand glow`: `#7357F2 → #2F05B0`.
- `Gradient/Dusk`: `#150256 → #3906D2`.
- Demo map: diagonal `#DDD5FD → #BCAAFB → #9580F7`, start `(10%, 0%)`, end `(90%, 100%)`.

#### Opacity conventions

Use purple/ink opacity rather than inventing new greys: 5% subtle fill, 10% selected icon well, 25–40% tertiary label, 50–60% secondary copy, 70% light text on purple, and 100% primary content. White glass borders use 60–70% white; dark glass borders use 12% white.

### 2.2 Typography

**Typeface:** Public Sans via Expo Google Fonts. Include weights 300, 400, 500, 600, 700, 800, and 900. The product mainly uses 400, 500, 700, and 900.

Create these Figma text styles:

| Style | Size / line | Weight | Notes |
|---|---|---:|---|
| `Display/XL` | 34 / 38 | 900 | onboarding titles |
| `Heading/XL` | 30 / 36 | 900 | rating/payment completion headings |
| `Heading/L` | 24 / 30 | 900 | main tab titles |
| `Heading/M` | 20 / 26 | 900 | stack headers and modal headings |
| `Heading/S` | 18 / 24 | 900 | card/empty-state headings |
| `Body/L` | 16 / 24 | 500 | onboarding support copy |
| `Body/M` | 14 / 20 | 500 | general content |
| `Body/S` | 12 / 17 | 500–700 | supporting metadata |
| `Label/Upper` | 12 / 16 | 900 | uppercase; tracking 1.2–1.8 px |
| `Label/Micro` | 10 / 14 | 700–900 | uppercase; tracking 1 px |
| `Caption` | 10 / 14 | 500–700 | timestamps and card metadata |

Headings use tight tracking (approximately `-0.4 px`). Uppercase action labels use wide tracking. Avoid synthetic weights.

### 2.3 Spacing, grid, radii, elevation

Use a 4 px base grid.

- Screen horizontal gutter: **20 px** normally; **24–28 px** for onboarding.
- Vertical section gap: 16, 20, or 24 px.
- Card internal padding: 16 px compact; 20 px normal; 24 px prominent.
- Inline icon/text gap: 8–12 px.
- Minimum touch target: **44 × 44 px**.
- Radii: 8, 12, 16, 20, 24, 28, 32, and full pill (`999`).
- Default list/card radius: 24 px; primary CTA: 28 px; glass card: 28 px; anchored sheet top corners: 32 px.
- Primary purple shadow: `0 8 16 rgba(57,6,210,.30–.35)`.
- Glass card shadow: `0 8 24 rgba(57,6,210,.12)`.
- Sheet shadow: `0 -8 24 rgba(21,2,86,.20)`.

All frames must respect Safe Area. Tab content reserves 82 px plus the bottom safe-area where required.

### 2.4 Iconography and imagery

- Use **Lucide** outlined icons, generally 16, 18, 20, 24, or 28 px with default/medium stroke.
- Use filled stars only when communicating an actual rating.
- Avatars: circular in people lists; rounded-square (16–24 px radius) in profile and job contexts.
- Service imagery can be replaced by category icon wells when absent.
- Before/after photos use a dark bottom label overlay: `NEEDS CLEANING`, `DIRTY / BEFORE`, `COMPLETED`, or `CLEAN / DONE`.
- Maps occupy the full available background on home and tracking screens. The demo map is visibly labelled and must not pretend to be live.

### 2.5 Brand marks

#### D. symbol

Create a vector component on a 120 × 120 view box:

- Stroke path `M32 32 L32 76`, 8 px, square caps.
- Outer path `M32 32 L60 32 A32 32 0 0 1 60 96 L32 96`, 8 px, square caps, miter joins.
- Inner path `M50 48 L60 48 A16 16 0 0 1 60 80 L32 80`, same stroke.
- Vertical rectangle: x 42, y 56, 8 × 16.
- Period: circle at `(100,92)`, radius 6.
- Default colour `Brand/500`.

#### Wordmark

“Detail.” uses Public Sans 900, default 40 px, line-height 105%, tracking `-0.5 px`. On dark/brand surfaces use white. On light surfaces use `Brand/900`. The period may use a separate accent colour.

---

## 3. Core components to build in Figma

### 3.1 Buttons

Create variants for:

- **Primary:** purple, white `Label/Upper`, 20 px vertical padding, 28 px radius, optional leading/trailing icon, purple shadow.
- **Secondary:** white or transparent, ink label, 1 px subtle border.
- **Tertiary/text:** no container; purple or muted label.
- **Danger:** pale red fill or red outline with danger label/icon.
- **Icon:** 44 px circular/rounded control.
- **Loading:** label replaced or prefixed by spinner; interaction disabled.
- **Disabled:** reduced contrast and no shadow.

Create pressed state at roughly 85% opacity and use the native behavior in prototypes.

### 3.2 Glass primitives

#### `Mobile/Surface/Glass card`

- Radius 28, 1 px border, clip content.
- Light: blur 40; white 55% overlay; white 60% border.
- Dark: blur 40; `#0D0A24` 55% overlay; white 12% border.
- Brand: dark blur; `#3906D2` 45% overlay; white 25% border.
- Android fallback variants: no blur, overlays at 92% opacity.

#### `Mobile/Button/Glass icon`

- Default 44 × 44, circular.
- Blur 50; light white 50% overlay / 70% border or dark `#0D0A24` 50% / white 15% border.
- Center icon 18–20 px.

#### `Mobile/Sheet/Glass`

- Full-width bottom-anchored sheet; top radii 32; no bottom radius.
- Top padding 10; horizontal padding 20; safe-bottom minimum 16.
- Handle 36 × 4, 2 px radius, muted lavender 35%.
- Light blur 50 with white 62%; dark with `#0D0A24` 68%.
- Home implementation max-height: 62% of screen.

#### `Mobile/Sheet/Modal`

- Black 50% scrim.
- Default height 60% of viewport.
- White sheet, top radii 32, horizontal 24, bottom 32.
- Handle 48 × 6, grey 200.
- Spring open (damping 30, stiffness 200); 250 ms close.

### 3.3 Form controls

- Input: white, 1 px Slate/brand-tinted border, 12–16 px radius, minimum 48 px high, 12–16 px inset.
- Label: `Label/Upper` or micro label in Ink 50%.
- Focus: brand border and a subtle brand glow.
- Error: pale-red container/border and danger text; preserve entered value.
- OTP: six individual cells, large centered digits; active/error/success variants.
- Password: trailing visibility action; “Forgot password?” text action aligned with label.
- Segmented option/chip: default white with subtle border; selected purple or Brand/50 with purple border.
- Toggle: off Slate/200, on Brand/500, white thumb.
- Photo uploader: dashed/quiet bordered tile plus camera/gallery actions; uploaded thumbnail has remove/replace control.

### 3.4 Role toggle

208 × 44 track, full-pill radius, 4 px inset, translucent white 50% fill and 70% border. Active pill is 100 × 36 Brand/500 with purple shadow. Labels are 12 px, 800; inactive Brand/900 and active white. Spring movement: friction 9, tension 80.

### 3.5 Navigation

#### Bottom tab bar

- Five equal tabs: Home, Activity, Messages, Wallet, Profile.
- Bar height 82; 10 px top padding; 1 px brand 8% top border.
- iOS: light blur intensity 80; Android: white 96% flat surface.
- Labels are intentionally hidden.
- Icon hit area 40 × 40, radius 14. Active is Brand/500 with white 20 px icon; inactive is transparent with `#9B93C9` icon.
- **Design follow-up:** the router declares `activity`, but no `mobile/app/(tabs)/activity.tsx` exists at this revision. Keep the tab in navigation designs and mark its destination “implementation required.”

#### Stack header

Safe-area-aware row with 44 px back control, centered 20 px/900 screen title, and a 44 px balancing action or spacer. Background follows screen; avoid native header chrome.

### 3.6 Reusable content components

Build:

- Person row: avatar, name, secondary line, rating/status, chevron/action.
- Job card: category image/icon, service, distance/address, date/time, budget/status badge.
- Transaction row: 48 px semantic icon well, description/time, signed amount, state.
- Settings row: 40 px icon well, title/subtitle, chevron or switch.
- KPI tile: icon, 16 px/900 value, 10 px uppercase label.
- Empty state: 56 px icon well or emoji, heading, supporting copy, optional CTA.
- Status chip: Pending/warning, Accepted/brand, In progress/brand, Completed/success, Cancelled/danger, Offline/neutral.
- Alert/banner: info, warning, error, offline, and outstanding-balance variants.
- Cleaner bid card: avatar, verification, rating/jobs, price, ETA, message, Decline and Accept actions.
- Timeline step: status icon, label, timestamp; active, complete, upcoming, and failed variants.
- Rating input: five 44 px star targets and 1–5 selection states.

---

## 4. Screen inventory and exact content

Every screen needs Default, Loading, Empty (where meaningful), Error, Offline, and Disabled variants. Forms also need validation and submitting variants.

### 4.1 Auth and onboarding

#### Splash — `/(auth)/splash`

- Full-bleed `intro.mp4`, content mode cover, no native controls.
- Purple `#3906D2` fallback canvas.
- Video animates brand swoosh → D. mark → wordmark.
- Auto-advance on completion; fallback advance after 8 seconds.

#### Welcome carousel — `/(auth)/welcome`

- White Safe Area canvas.
- Top: 20 px dark wordmark left, `Skip` right except on final slide.
- Horizontal paging, three slides. Each has a 300 px-high brand glass card, badge at top-left, and centered 96 × 96 translucent icon tile (28 px radius, 44 px icon).
- Slide content:
  1. `Elite Verified` / **Trusted Professionals** / ShieldCheck.
  2. `You set the price` / **Bid-Based Pricing** / Zap.
  3. `Payment protected` / **Live Tracking, Secure Pay** / MapPinned.
- Below: 34/38 black title, 16 px support copy, indicator (active 28 × 6; inactive 6 × 6), full-width primary `CONTINUE` or `GET STARTED`.
- Final slide adds “Already have an account? **Log In**”.

#### Sign in — `/(auth)/sign-in`

- Heading **Welcome back**, support “Sign in to your Detail account”.
- Phone/email mode control.
- Phone mode: country picker, calling code, formatted number, `SEND CODE`.
- Email mode: email, password with visibility, Forgot password, submit.
- Social sign-in actions where supported.
- Footer links: Customer Agreement, Cleaner Agreement, Privacy Policy.
- Trust footer: “Bank-grade encryption. Fully verified pros.”
- Include loading, invalid phone/email/password, provider error, and keyboard-open frames.

#### Verify code — `/(auth)/verify`

- Heading **Enter the code**; masked destination support line.
- Six OTP cells, sending/verifying/error variants.
- Resend disabled countdown, then purple `Resend Code` action.

#### Forgot password

- Email entry → sending → sent confirmation frames.
- Resend link and “Remember your password? **Sign in**”.

#### Create profile

- Heading **Set up your profile**.
- Optional profile photo with camera affordance.
- Full name.
- “I want to” role selection: Customer / Cleaner.
- Full-width `CONTINUE`.
- Cleaner selection leads to extended cleaner registration after baseline setup.

#### Permissions

- Heading **Allow permissions**.
- Permission cards for notifications, location, and camera/photos with icon, rationale, and state.
- Full-width `CONTINUE TO APP`; show denied instructions and limited-permission state.

### 4.2 Home and discovery

#### Shared map home — `/(tabs)/home`

- Full-screen native map (or clearly labelled demo map).
- Safe-area floating top controls: identity/greeting and role toggle; notification/profile actions as implemented.
- Locate-me glass icon at right, 44 px.
- If active work exists, show a brand glass Active Job card with icon, service title, and chevron.
- Bottom glass sheet, max 62% high, internally scrollable and pull-to-refresh.

#### Customer home sheet

1. Primary purple `REQUEST CLEANING` row with plus icon and chevron.
2. Two equal service cards: House and Car; white surface, 44 px brand icon well.
3. Favorites horizontal avatar rail, only when data exists; “See All”.
4. Recent Jobs list, only when data exists; “View All”.
5. Empty, loading, location denied, offline, booking-disabled and active-job variants.

#### Cleaner home sheet

1. `YOUR STATUS`, green dot + Online or grey dot + Offline.
2. `GO OFFLINE` quiet action when online; purple `GO ONLINE` when offline.
3. KPI tiles: Jobs, Rating, Earned.
4. `INCOMING JOBS (n) · NEAREST FIRST` when online.
5. Job cards: 56 px thumbnail/category well, service, distance/location metadata, budget badge.
6. Empty card: icon and “No jobs nearby right now”; supporting notification copy.
7. Include verification pending, suspended, unavailable, notification permission, and location permission states.

### 4.3 Booking wizard — `/booking/create`

Use a progress header and sticky bottom Back/Continue action area. Preserve entered state when moving between steps.

1. **What do you need cleaned?** — House or Car large selection cards.
2. House configuration:
   - Property Size & Stories.
   - Areas to Clean: Living Room, Bedrooms, Kitchen, Dining Room, Bathrooms, Hallways, Stairs, Other.
   - Cleaning Required: Standard, Deep, Move In/Out, Post Renovation (each with description).
   - House Condition: Light, Moderate, Heavy.
   - Additional Services: Laundry, Ironing, Dishes, Carpet Cleaning, Inside Fridge, Organizing, Window Cleaning, Other.
3. Car configuration:
   - Vehicle type: Sedan, SUV, Truck, Van, Other.
   - Cleaning type: Exterior, Interior, Full Service, Other.
   - Condition: Clean, Average, Very Dirty.
   - Registration number (optional).
   - Exterior options: Wash, Wax/Polish, Tire Shine, Rim Cleaning, Scratch Removal, Headlight Cleaning, Bug Removal, Other.
   - Interior options: Vacuum, Dashboard, Seat, Door Panel, Carpet Shampoo, Air Freshener, Window, Other.
   - Deep options: Steam, Upholstery Shampoo, Engine Bay, Odor, Pet Hair, Other.
4. **Details & Condition** — special instructions plus before-photo camera/library uploader.
5. **Where is the job?** — address autocomplete/manual input, current-location action, map confirmation and location error.
6. **When do you need it?** — ASAP (“Within the hour”), Today, Tomorrow, Pick Date; custom date/time controls.
7. **Set your budget** — Instant Book or Receive Bids; suggested options including Popular badge or custom currency input.
8. Review Request — service summary, address, schedule, budget, photos/instructions, edit links and submit.

Include validation frames for missing required choices, bad custom budget, unavailable schedule, photo upload failure, geocoding failure, duplicate submission, kill switch, and no network.

#### Offers — `/booking/offers`

- Header **Bids Received**.
- Waiting animation/empty state: “Waiting for offers…” and cancellation reason input/action.
- Bid card: cleaner avatar, name, verified/rating/completed jobs, price, “Arrives in ~n min”, optional message, Decline and purple Accept.
- Counter/low bid, insufficient funds, bid withdrawn, stale offer, no cleaner found, and accepted confirmation states.
- Accept requires payment method and confirmation; disable all competing offers while processing.

#### Confirmation — `/booking/confirmation`

- Success mark, confirmed service/date/address/cleaner/payment summary.
- Primary track/view job action and secondary home action.
- Pending-payment variant must not imply confirmed capture.

### 4.4 Cleaner job workflow — `/job/[jobId]`

- Header, category/service and current status.
- Detail rows: Location, Customer Budget, Estimated Duration; House Property Layout or Car Vehicle Registration; Notes.
- Before-photo grid with `Tap to enlarge` and `Dirty / Before` overlays.
- Completion-photo grid for completed jobs.
- Bid form: Your Price (USD), Estimated Arrival (minutes), ETA presets, optional introduction message, submit.
- Submitted state: “Bid submitted — waiting for customer to accept”.
- Closed state: “This job has already been accepted”.
- Design loading, job-not-found, out-of-coverage, unavailable, outstanding commission, duplicate bid and bid error states.

### 4.5 Live tracking, execution, payment and rating — `/tracking/[jobId]`

This route changes by role and lifecycle state. Create a component-driven set rather than unrelated frames.

- Full/large map with job marker and live cleaner marker; map loading/failed/permission state.
- Bottom sheet header with cleaner/customer avatar, service, message/call/SOS actions where present.
- ETA module: `ESTIMATED ARRIVAL`, time, `ON SCHEDULE` chip.
- Lifecycle timeline: assigned/accepted → en route → arrived → in progress → completed/cancelled.
- Checklist rows with completion affordances.
- Before/after photo preview and `View Photos →`.
- Cleaner completion actions: `TAKE DONE PHOTO`, `UPLOAD GALLERY`, thumbnails, upload progress/error, then completion confirmation.
- Customer payment state: **Complete Payment**, amount and method (Wallet/Cash), insufficient funds and processing variants.
- Customer rating state: **Rate your cleaner**, five stars, low-rating problem description required, submit and Skip.
- Completion state: **All done!**, receipt/result and `BACK TO HOME`.
- Photo gallery modal: Before and Clean/Done sections, empty states, full-screen viewer.
- Cancellation/no-show/dispute, stale sync, offline live location and missing completion-event states.

### 4.6 Messages — `/(tabs)/messages`

- Title **Messages**.
- Conversation list: avatar, participant name, job/service context, message preview, time, unread badge.
- Empty: “No conversations yet”.
- Conversation view: compact header, alternating bubbles, timestamps/read state, attachment affordance, composer placeholder “Type a message…”, send action.
- Create typing, sending, failed/retry, attachment preview/upload, offline and chat-locked states.

### 4.7 Wallet — `/(tabs)/wallet`

- `Surface/App` background and title **Wallet**.
- Purple balance card: wallet icon + `AVAILABLE BALANCE`, 36–40 px currency value, “Detail Wallet”, Add Funds and Withdraw translucent actions.
- Negative cleaner balance banner: outstanding commission explanation and add-funds action.
- Accepted Payment Methods white card with 40 px purple-tint icon wells.
- Recent Transactions list: credit green, debit red; signed value, description, status/time.
- Empty: card/emoji and “No transactions yet”.
- Add Funds bottom sheet: amount, processor handoff, loading, cancelled, pending, failed and success states.
- Withdrawal informational dialog currently indicates 1–3 business days and support initiation.

### 4.8 Profile — `/(tabs)/profile`

- Title **Profile**.
- White 24 px-radius profile card: 64 px rounded avatar with camera badge, name, email, role chip, camera action.
- Cleaner-only KPI row: Jobs, Rating, Balance.
- Notifications settings row with switch.
- Grouped menu cards. Include all routes represented in implementation: history, favorites, reviews, wallet/payment-related settings, cleaner registration/agreement as applicable, privacy/legal, and Help & Support.
- Destructive outlined Delete Account and pale-red Sign Out buttons.
- Include photo uploading/error, notification denied, delete confirmation/re-authentication, suspended and incomplete cleaner-profile states.

### 4.9 Secondary screens

- **Service History:** completed/cancelled jobs, price/status/date, empty, job detail, Report an Issue sheet with required description.
- **Favorites:** saved cleaner list and empty state.
- **Notifications:** grouped notification rows, read/unread variants, “You’re all caught up”.
- **My Reviews:** average/summary as available, review cards and “No comment left”.
- **Help & Support:** FAQs, WhatsApp/email/contact routes, urgent safety path, fallback/offline copy.
- **Become a Cleaner:** full legal name, phone, physical address, services/coverage, verification uploads and uploading states.
- **Cleaner Agreement / Customer Agreement / Privacy Policy:** readable scroll layout, 20 px bold title, back header, section headings/body, current acceptance action where applicable.
- **Screen not found:** centered title, supporting copy, return action.

---

## 5. State model to represent in Figma

Create component properties and a state matrix rather than duplicating arbitrary colours.

### Data states

`Initial`, `Skeleton/Loading`, `Refreshing`, `Populated`, `Empty`, `Partial`, `Offline cached`, `Recoverable error`, `Permission denied`, `Fatal/not found`.

### Job states

`PENDING`, `CONFIRMED`, `ASSIGNED`, `EN_ROUTE`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Show the state label consistently, but customer-friendly supporting copy can vary.

### Payment states

`Not started`, `Authorized`, `Captured`, `Pending`, `Failed`, `Insufficient funds`, `Partially refunded`, `Refunded`, `Refund failed`. Never use success visuals for pending processor confirmation.

### Account/cleaner states

`Customer`, `Cleaner unverified`, `Cleaner pending verification`, `Cleaner approved`, `Online`, `Offline`, `Busy`, `Suspended`, `Banned/deactivated`.

### Global operational states

Design prominent banners/sheets for booking disabled, bid acceptance disabled, payment disabled, global maintenance, forced update, and no connectivity. Keep a support fallback visible.

---

## 6. Motion and prototyping

- Stack push: slide from right; tracking opens from bottom and cannot be gesture-dismissed during active work.
- Auth group and tab switches: no page animation.
- Bottom sheet: spring in (damping 30, stiffness 200); 250 ms timing out.
- Role selector: spring slide (friction 9, tension 80).
- Map recenter: 400 ms camera animation.
- Use 150–220 ms ease for press, chip, and disclosure transitions.
- Respect Reduce Motion: replace large translations with dissolve/instant state changes.
- Never animate indefinite progress without a text label.

Prototype these primary journeys:

1. New customer: Splash → Welcome → Sign in → Verify → Profile → Permissions → Home.
2. Customer booking: Home → category → details → location → schedule → budget → review → offers → accept/payment → confirmation → tracking → completion → rating.
3. Cleaner: Home offline → online → nearby job → job detail → bid → accepted → tracking → photos/checklist → complete → earnings.
4. Support: History/low rating/no-show → report → support case acknowledgment.
5. Account: Profile → settings/legal/help; delete and sign-out confirmations.

---

## 7. Accessibility requirements

- Target WCAG 2.2 AA contrast; check translucent glass over both brightest and darkest map regions.
- Minimum touch target 44 × 44 px and at least 8 px separation between destructive and primary actions.
- Do not encode job/payment state by colour alone: always provide label and, where useful, icon.
- Preserve Dynamic Type behavior. Validate 200% text on 360 px frames; allow rows/cards to grow vertically.
- Provide accessible names for icon-only buttons (`Back`, `Locate me`, `Notifications`, `Show password`, etc.).
- Maintain logical focus order matching visual order; sheets trap focus and return it to their opener.
- Announce loading, validation, payment, bid, completion and error changes.
- Provide text alternatives for job photos and map-derived address/distance information.
- Keyboard-open layouts must keep the focused field and primary action reachable.
- Use reduced-motion alternatives and avoid rapid/pulsing animations.

---

## 8. Content and formatting rules

- User currency is currently presented as **USD** with `$`, normally two decimals in wallet/payment contexts and compact whole values in KPI tiles.
- Use sentence case for headings and explanatory text; action buttons are usually uppercase with wide tracking.
- Use explicit dates plus times for scheduled work; do not rely on “Today” alone in confirmations or history.
- Distance is displayed in kilometres to one decimal when location is known.
- Ratings display one decimal and a star; use an em dash when unavailable.
- Use “cleaner” for marketplace professionals and “customer” for requesters.
- Error copy explains what happened and provides a next step; do not expose raw Firebase/processor errors.
- Pending states must say that confirmation is still in progress.

---

## 9. Figma handoff checklist

Before handing the file to engineering, verify:

- [ ] All colours, type, spacing and radius values use published variables/styles.
- [ ] Every repeated row, button, field, chip, sheet and navigation element is an instance.
- [ ] Components include default, pressed, focused, disabled, loading and error states.
- [ ] Frames exist at 390, 360 and 430 px widths for critical flows.
- [ ] iOS blur and Android flat-fallback surfaces are separate variants.
- [ ] Safe-area, keyboard, long-content, long-name and large-text behavior is shown.
- [ ] Customer and cleaner variants are both complete.
- [ ] Empty/loading/error/offline/permission states are linked from each core screen.
- [ ] Payment and lifecycle language matches the server states in this document.
- [ ] Maps and QR/photo assets have export/replacement guidance and are not rasterized UI.
- [ ] Icons remain Lucide vectors; logo remains an editable vector.
- [ ] Export settings: SVG for marks/icons, PNG @1x/@2x/@3x only for raster assets.
- [ ] Prototype connections cover the five journeys above.
- [ ] The missing Activity route is visibly flagged rather than fabricated.

---

## 10. Implementation source map

Use these files when reconciling a Figma revision with the app:

- Tokens and service catalogs: `mobile/constants/theme.ts`, `mobile/constants/services.ts`, `mobile/tailwind.config.js`.
- Fonts, route transitions and guards: `mobile/app/_layout.tsx`.
- Tab bar: `mobile/app/(tabs)/_layout.tsx`.
- Brand: `mobile/components/Logo.tsx`, `mobile/components/Wordmark.tsx`.
- Glass primitives: `mobile/components/glass/*`.
- Generic modal sheet: `mobile/components/BottomSheet.tsx`.
- Auth/onboarding: `mobile/app/(auth)/*`.
- Home roles: `mobile/app/(tabs)/home.tsx`.
- Booking and offers: `mobile/app/booking/*`.
- Cleaner job detail: `mobile/app/job/[jobId].tsx`.
- Tracking, photos, payment and rating: `mobile/app/tracking/[jobId].tsx`.
- Messages, wallet and profile: `mobile/app/(tabs)/messages.tsx`, `wallet.tsx`, `profile.tsx`.
- Secondary screens: `mobile/app/history.tsx`, `favorites.tsx`, `notifications.tsx`, `reviews.tsx`, `help.tsx`, legal/agreement screens, and `register-cleaner.tsx`.

When Figma and implementation disagree, record the decision in `00 Cover & changelog`; do not silently change a token or lifecycle label in only one system.
