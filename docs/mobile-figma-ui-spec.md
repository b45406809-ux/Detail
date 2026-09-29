# DETAIL APP — COMPLETE UI SPECIFICATION

> **Implementation-derived audit, 29 September 2026.** Scope is the user-facing Expo application in `mobile/`; the public website and internal web admin are separate products. Every statement below is classified as **Direct** (literal implementation), **Derived** (resolved NativeWind/theme value), **Responsive** (runtime/device calculation), or **Not defined**. Anything absent from the code is stated as **NOT DEFINED IN CODE** rather than designed speculatively.

## A. Application Overview

Detail is a two-sided cleaning marketplace. A shared account chooses a `CUSTOMER` or `CLEANER` role. Customers request house/car cleaning, receive bids, track work, pay, favorite cleaners, and review completed jobs. Cleaners toggle availability, inspect nearby jobs, bid, progress accepted work, upload completion photos, and see wallet/commission information.

The implemented visual language is a light mobile UI with deep purple `#3906D2`, Public Sans, large rounded surfaces, translucent map overlays, and Lucide outline icons. It is **not** Montserrat or Open Sans. USD, kilometres, and 12-hour time formatting are directly implemented.

### Audit boundaries and important implementation gaps

- All files under `mobile/app`, `mobile/components`, `mobile/constants`, route guards, notifications, and image assets were audited.
- The five-tab router declares `activity`, but `mobile/app/(tabs)/activity.tsx` does not exist. The icon appears; tapping it resolves to a missing route. Do not invent an Activity screen.
- There is no separate Settings route, search screen, cleaner-selection directory, negotiations/chat-before-bid policy screen, saved service, administrative mobile screen, or side drawer.
- There are no “Basic House Clean — $10”, “Specific Room/Part — $15”, “Exterior Wash — $3”, “Full Car Clean — $12”, or “Deep Detail — $65” cards. The actual catalogs and custom budget flow are documented below; do not add example prices.
- Most failures use native `Alert.alert`; their pixel layout, radius, shadow, and typography are OS-owned and therefore **VISUAL VALUE CANNOT BE DETERMINED FROM IMPLEMENTATION**.
- Hover is not implemented. Native `TouchableOpacity` gives opacity feedback (usually `activeOpacity=.7` or `.8`, otherwise platform default). Explicit focus rings are not implemented.

## B. Technology/UI Architecture

- Expo 52 / React Native 0.76 / React 18, Expo Router 4 file routes.
- NativeWind/Tailwind supplies utility styles; exceptional geometry uses `StyleSheet`.
- `react-native-maps` renders native maps; `MapPlaceholder` renders a labelled gradient when maps are unavailable/demoed.
- `expo-blur` and `expo-linear-gradient` produce glass and brand surfaces; Android receives opaque fallback surfaces where coded.
- `react-native-safe-area-context` owns safe areas. No fixed artboard is coded. Screens are flex layouts spanning the device.
- Root stack headers are hidden. App-authored headers sit inside safe areas.
- Root push animation is `slide_from_right`; auth and tab groups use `none`; tracking uses `slide_from_bottom` with gesture dismissal disabled.
- Auth guard: signed-out users are replaced to Splash; authenticated users without profile go to Create Profile; without permissions go to Permissions; complete accounts go to Home.
- A notification with `BOOKING_CREATED` or `NEW_BID` and a `jobId` opens Offers; other job notifications open Tracking.
- Data comes from Firebase listeners. Loading is generally an `ActivityIndicator`, empty data has authored cards, and mutations use disabled buttons plus indicators where implemented.

## C. Design System

### Colours

| Token/status                        | Value                                                                                                        | Classification and use                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Brand 50–900                        | `#F0EDFE`, `#DDD5FD`, `#BCAAFB`, `#9580F7`, `#7357F2`, `#3906D2`, `#2F05B0`, `#27049C`, `#1E0378`, `#150256` | Direct constants; 500 is primary CTA/selection.                                 |
| Accent / accent-dark / accent-light | `#3906D2`, `#27049C`, `#6B4FF0`                                                                              | Direct Tailwind aliases.                                                        |
| Ink                                 | `#0F0B2E`                                                                                                    | Direct primary text. Opacity modifiers create secondary text.                   |
| App background                      | `#F2F1F5`                                                                                                    | Direct tab-list background.                                                     |
| Home map fallback                   | `#EDEBFA`                                                                                                    | Direct.                                                                         |
| White                               | `#FFFFFF`                                                                                                    | Direct surface and inverse text.                                                |
| Dark/card/border                    | `#0D0A24`, `#17133A`, `#2A2456`                                                                              | Direct glass/dark tokens.                                                       |
| Success                             | `#0FB77A`                                                                                                    | Direct; emerald Tailwind shades also occur.                                     |
| Warning                             | `#F5A524`                                                                                                    | Direct; amber Tailwind shades also occur.                                       |
| Danger                              | `#E5484D`                                                                                                    | Direct; red Tailwind shades also occur.                                         |
| Inactive tab                        | `#9B93C9`                                                                                                    | Direct inline value.                                                            |
| Slate neutrals                      | Tailwind Slate 50–900                                                                                        | Derived from Tailwind defaults; list/card borders, metadata, disabled controls. |
| Brand gradient                      | `#3906D2 → #27049C`                                                                                          | Direct constants.                                                               |
| Demo map gradient                   | `#DDD5FD → #BCAAFB → #9580F7`, `(10%,0%)→(90%,100%)`                                                         | Direct.                                                                         |

Opacity is expressed through utilities: ink 3/5/10/25/30/40/50/60/70%, white 15/20/25/40/50/60/70%, and black scrims 50 or 95%. There is no semantic design-token API for every Tailwind shade.

### Typography

Public Sans is loaded in 300, 400, 500, 600, 700, 800, and 900; utility aliases map sans/medium/bold/black to 400/500/700/900. NativeWind default line-height applies unless `leading-*` is present.

| UI family          | Direct sizes/weight                     | Other properties                                        |
| ------------------ | --------------------------------------- | ------------------------------------------------------- |
| Display/onboarding | 30 (`text-3xl`) or 36 (`text-4xl`), 900 | `tracking-tight`; left or centered by container.        |
| Page title         | 24 (`text-2xl`), 900                    | usually Slate 900/Ink; tight tracking.                  |
| Stack/modal title  | 20 (`text-xl`), 900                     | left aligned.                                           |
| Section/card title | 14–18, 900                              | sentence case except labels.                            |
| Body large         | 16, 500                                 | secondary lines commonly Ink 50–60%.                    |
| Body               | 14, 500/700                             | default copy and field text.                            |
| Caption            | 12, 500/700/900                         | metadata.                                               |
| Micro              | 9–11, 700/900                           | status and tiny metadata.                               |
| Upper label        | 10–12, 900                              | uppercase, `tracking-wider/widest`.                     |
| Button label       | 12–14, 900                              | usually uppercase, widest tracking.                     |
| Price/balance      | 16–36, 900                              | tabular formatting is NOT DEFINED IN CODE.              |
| Error/success      | 11–14, 500–900                          | color communicates semantic status alongside copy/icon. |

Exact CSS letter-spacing and default line-heights are inherited from Tailwind/NativeWind. Where only `tracking-tight/wider/widest` is present, a standalone numeric value is **DERIVED FROM THE INSTALLED TAILWIND PRESET**, not declared locally.

### Spacing

- Base utilities follow Tailwind’s 4 px scale. Repeated values: 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40 px.
- Screen gutters: 20 px (`px-5`) on tabs/stack lists; 24 px (`px-6`) on auth and most modal bodies.
- Section gaps: 12, 16, 20, 24, or 32 px. Card padding: 12, 16, 20, 24, or 32 px.
- Inline gaps: 4–16 px. Tab bar reserves 82 px. Safe-area inset is responsive.
- Scroll content uses native content size. No global max content width or tablet breakpoint exists.

### Radius

- 6/8 px badges; 12 px icon wells; 16 px inputs/small cards; 20/22/24 px buttons/cards; 28/32/36 px prominent cards/sheets; `9999` circles/pills.
- `rounded-4xl` is 32 px; `rounded-5xl` is 40 px. Default list cards frequently use 24 px.

### Shadows

- Auth/brand CTAs: NativeWind `shadow-lg` or `shadow-xl` tinted with accent at 30%.
- `shadow-glass`: web-style definition `0 8px 32px rgba(57,6,210,.15)`; actual native rendering is platform-dependent.
- GlassCard: iOS shadow opacity/radius/elevation values are component-defined; Android uses elevation/fallback. Exact raster appearance is platform-dependent.
- Many white cards use `shadow-sm`; Android/iOS outputs differ. No universal shadow token exists.

### Icons

Primary icon library is `lucide-react-native`; typical sizes are 12, 14, 16, 18, 20, 22, 24, 28, 32, and 36. Stroke/fill follows Lucide defaults unless `fill` is explicitly supplied (rating stars). Emoji (`🧹`, `🚗`, `💬`, `💳`, payment emoji) are platform glyphs and visually vary by OS.

Icon/action inventory: ArrowLeft=back; X=close/remove; Bell=notifications; Home/Activity/MessageSquare/Wallet/User=bottom tabs; LocateFixed=map recenter; ChevronRight=disclosure; House/Car=categories; Plus=request; MapPin=address/job pin; Navigation=distance/ETA; Clock/Calendar=schedule; Camera/Image=photo capture/library; Send=message; Phone=call placeholder; Shield/ShieldCheck=trust/safety; Star=rating; Heart=favorite; Trash/Delete and LogOut=destructive; Eye/password affordance where present; Search and Check in Country Picker; Dollar/credit-card/wallet icons for money.

Unless specified per screen, icons inherit the adjacent semantic color, have no background, and are centered inside the declared icon well. Tooltips, hover, and long-press behavior are **NOT DEFINED IN CODE**.

### Buttons

| Family              | Exact implementation pattern                                                                                            | States/action                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Primary auth/wizard | Full available width; vertical padding 20; radius 24–32; brand background; white 14/900 uppercase/widest; accent shadow | Disabled uses Ink 10% and Ink 30% label; submitting often swaps to `ActivityIndicator`. Press opacity native. |
| Map glass icon      | 44 or 48 square/circle, centered 18–20 icon; translucent/blurred white                                                  | Opens notifications, back, recenter, etc.                                                                     |
| Secondary           | White/translucent or Ink 5%; 1–2 px low-opacity border; 12–14/700–900 label                                             | No universal disabled/loading variant.                                                                        |
| Destructive         | Red 50 fill or red 200 border; red 500/600 label                                                                        | Opens native confirmation before deletion/cancellation/sign-out.                                              |
| Chip/option         | Content-sized or flex; 12–20 padding; 12–24 radius; default white/Ink 5% with border; selected Brand 50 or Brand 500    | Selection is local state. Check/icon may appear.                                                              |
| Text link           | No visual container; purple 12–14/700–900, sometimes underline                                                          | Navigation or state toggle.                                                                                   |

No hover style exists. Failure behavior is action-specific in later sections. Button exact width is usually responsive (`w-full`, `flex-1`, or parent-minus-gutters), not a fixed number.

## D. Complete Screen Inventory

1. Bootstrap/Auth routing (`/`)
2. Authentication and onboarding
   2.1 Splash
   2.2 Welcome carousel — slides 1, 2, 3
   2.3 Sign in — Phone and Email/Create-account modes
   2.4 Country Picker
   2.5 reCAPTCHA sheet
   2.6 Phone verification
   2.7 Forgot Password — entry and sent
   2.8 Create Profile
   2.9 Permissions
3. Shared Home
   3.1 Map/loading shell
   3.2 Customer sheet
   3.3 Cleaner online/offline sheet
   3.4 Active Job banner
4. Customer booking
   4.1 Category
   4.2 House checklist
   4.3 Car checklist
   4.4 Details & Condition
   4.5 Location
   4.6 Schedule
   4.7 Budget & review
   4.8 Offers — waiting/bids/raise-budget
   4.9 Confirmation
5. Cleaner workflow
   5.1 Job Detail/loading/not found
   5.2 Open bid form
   5.3 Bid submitted/closed
   5.4 Cleaner Registration
6. Tracking lifecycle
   6.1 Map tracking
   6.2 Cleaner status controls
   6.3 Customer payment
   6.4 Customer rating
   6.5 Success
   6.6 Job Photos sheet
   6.7 Full-screen photo viewer
7. Messages
   7.1 Conversation list/loading/empty
   7.2 Chat thread
   7.3 Send-photo native action dialog
8. Wallet
   8.1 Balance/transactions
   8.2 Add Funds sheet
   8.3 Withdraw native dialog
9. Profile
   9.1 Customer Profile
   9.2 Cleaner Profile
   9.3 Profile-photo native chooser
   9.4 Delete/Sign-out native confirmations
10. Secondary
    10.1 History
    10.2 Report an Issue sheet
    10.3 Favorites
    10.4 Notifications
    10.5 Reviews
    10.6 Help & Support
    10.7 Customer Agreement
    10.8 Cleaner Agreement
    10.9 Privacy Policy
    10.10 Not Found
11. Global fatal Error Boundary
12. Missing Activity destination (declared, no implemented screen)

## E. Authentication

### 2.1 Splash — `/(auth)/splash`

**Purpose/entry/exit.** First signed-out destination; root index and AuthGuard replace here. `intro.mp4` completion replaces to Welcome; an 8-second fallback also advances. No back or tab bar.

**Layout.** Full-screen purple fallback `#3906D2`; Expo Video fills width/height with `contentFit="cover"`, native controls hidden. Status/safe-area-specific composition is not authored. The video’s internal imagery/timing beyond the file itself is **VISUAL VALUE CANNOT BE DETERMINED FROM JSX**.

### 2.2 Welcome — `/(auth)/welcome`

White SafeArea, vertical layout. Header has 24 px horizontal padding and 8 px top padding: Wordmark left (20 px); `Skip` 14/700 Ink 40% right on slides 1–2, absent on slide 3. Horizontal `pagingEnabled` ScrollView uses runtime `Dimensions.get('window').width`; each slide is exactly that width with 24 px gutters.

Each slide has a 300 px brand/glass illustration card: top-left pill badge (11/900 white), centered 96×96 white-15% tile, radius 28, 44 px Lucide icon. Content:

1. `Elite Verified`; `Trusted Professionals`; shield/check icon; copy about vetted cleaners.
2. `You set the price`; `Bid-Based Pricing`; Zap; cleaner offers.
3. `Payment protected`; `Live Tracking, Secure Pay`; MapPinned; tracking/payment copy.

Below sit a 30/900 title, 16/500 centered support copy, and page indicators (active 28×6 purple capsule; inactive 6×6 Ink-10 circles). Bottom full-width CTA is `CONTINUE` or `GET STARTED`: purple, `py-5`, radius 28, 14/900 uppercase, purple shadow. It advances the pager or pushes Sign In. Final `Already have an account? Log In` text action also pushes Sign In. No loading/error states are coded; tab bar hidden.

### 2.3 Sign In — `/(auth)/sign-in`

SafeArea white → keyboard-avoiding view → scroll content with 24 px gutters. Top back is 48×48 white, radius 16, Ink-10 border; then 32 px gap. `Welcome back` is 30/900, followed by `Sign in to your Detail account` at 16/500 Ink 50%.

The glass card contains a two-item Phone/Email segmented control: equal-width, `py-3`, radius 12, icons and 14/900 uppercase. Selected surface is white; precise shadow follows `GlassCard`. Phone mode has uppercase `PHONE NUMBER`; country trigger (flag 18 px + dial code + chevron) divided from flexible phone input, all within 16 px-radius translucent row. Placeholder comes from country metadata; keyboard is phone-pad. A 20×20 rounded terms checkbox controls acceptance. Agreement and Privacy substrings are purple underlined links. `SEND CODE` is full-width primary; validates number/terms, initiates phone auth, then pushes Verify with phone params. Failures are native alerts.

Email mode has a sign-in/create-account text toggle, labeled email field (`email-address`, no capitalization) and password field (`secureTextEntry`). Forgot Password appears right of Password label for existing accounts. It repeats the terms checkbox, then primary `SIGN IN` or `CREATE ACCOUNT`; during work the label is replaced by white spinner and control is disabled. Success replaces to Create Profile if incomplete, otherwise Home. Errors use `Sign In Error` alert.

Below: SocialSignInButtons; then a divider/footer headed `LEGAL & PRIVACY` with Customer Agreement • Cleaner Agreement • Privacy Policy links; trust dot and `Bank-grade encryption. Fully verified pros.` Apple button only renders on iOS. Bottom navigation hidden.

### 2.4 Country Picker — component modal

Triggered by phone country area. Full-screen white modal with SafeArea. Header: 20 px gutters; 36×36 purple-tint icon tile, `Select Country` 18/900, subtitle 12/500, 36×36 round close. Search row has Search icon, placeholder `Search country or code (e.g. Zimbabwe, +263, US)...`, native clear behavior, and explicit X when nonempty. FlatList rows have 20 px horizontal/14 px vertical padding, 24 px flag, name/code, dial-code pill, and selected 20×20 purple check. Empty result is `No countries found` plus advice. Selection calls parent and closes. No tab bar.

### 2.5 reCAPTCHA modal

Only non-mock phone auth. Native page-sheet/slide modal containing a SafeArea header title and Cancel action, then WebView; ActivityIndicator overlays while loading. Size/radius of OS page-sheet is platform-owned. Closing rejects verification.

### 2.6 Verify — `/(auth)/verify`

White SafeArea, keyboard avoiding, 24 px gutters/top. Same 48×48 back. `Enter the code` 30/900; support line shows mock explanation or bold display phone. Sending state is spinner + `Sending code…`. Six 48×56 OTP cells, 16 px radius, 20/900 centered; default Ink-5 background/Ink-10 border, active/filled brand treatment, and error treatment from inline condition. Numeric single-character inputs auto-advance/backspace. Full-width `VERIFY` primary is enabled only at six digits and not busy; success replaces Create Profile. Resend row shows disabled `Resend in Ns`, then purple `Resend Code`. Native alerts cover send/verification failure. No tab bar.

### 2.7 Forgot Password

Entry uses white SafeArea, 24 px gutters, back, 64×64 purple tint icon tile, `Reset your password`, support, uppercase Email label, translucent 16 px-radius input, and full-width `SEND RESET LINK` primary. Empty email and reset errors alert. Sent state replaces form: 80×80 emerald success circle, `Check your email`, explanatory copy with bold email, spam note, `Resend Link` Ink-5 secondary, and `BACK TO SIGN IN` primary. Back links exit. No bottom tab.

### 2.8 Create Profile

White SafeArea/keyboard-scroll, 24 px gutters. A three-segment progress strip uses flexible 6 px-high capsules; completed/current are brand, remaining Ink-10. `Set up your profile` and support. Centered 96×96 circular avatar tile has 2 px accent border, cover-cropped uploaded image or User icon, plus bottom-right 32×32 purple camera badge with 2 px white border. Tap opens native chooser: Camera, Photo Library, Cancel; permission/upload errors alert.

`FULL NAME` field is `py-4`, 16 px radius, Ink-10 border. If role was not preselected, `I WANT TO` shows Customer/Cleaner cards: `p-4`, radius 24, border, 48×48 role icon well, title and subtitle; selected gets brand border/tint/check. Full-width `CONTINUE` validates name, saves, replaces Permissions; busy spinner. No tab bar.

### 2.9 Permissions

White SafeArea. Non-scrolling flex layout, 24 px gutters, 32 px top/bottom, content/footer separated. Three fully-purple 6 px progress capsules; 64×64 purple-tint icon tile; `Allow permissions`; explanatory copy. Permission cards are GlassCards with 48×48 colored icon wells, title/subtitle, `REQUIRED` micro badge for location, and per-row grant buttons. Items cover Location, Notifications, Camera & Photos. Main `CONTINUE TO APP` requires location; denial alert offers `Open Settings` where applicable. Busy spinner; success replaces Home. Bottom nav hidden.

## F. Customer Experience

### 3.1–3.4 Home — `/(tabs)/home`

**Entry/exit.** Default authenticated destination and Home tab. Category/request actions open Booking; favorite/history links open their lists; bell opens Notifications; Active Job opens Tracking. RoleToggle changes current role in AuthContext. Bottom tabs visible.

**Shell.** Root fills screen with `#EDEBFA`. Map fills the background; while loading, white centered ActivityIndicator. A top SafeArea absolute overlay holds a centered 208×44 RoleToggle and right 44×44 Bell GlassIconButton, in a 20 px gutter row. RoleToggle track is translucent with 4 px inset; animated selected pill is 100×36 brand with spring friction 9/tension 80; labels are 12/800.

An Active Job GlassCard appears below header with 20 px side gutters and 12 px top gap: purple/brand variant, 16 px padding, 40×40 white-20 icon well, micro uppercase `ACTIVE JOB`, service title, ChevronRight. It is absent without an active job.

Bottom `GlassSheet` is absolute, full width, maximum `62%` of screen, top radius 32, handle, 20 px horizontal padding and safe bottom. Content scrolls internally and supports refresh. The map recenter/permission behavior follows native map state; explicit denied-permission full screen is not authored beyond alerts/placeholder.

**Customer sheet.** `REQUEST CLEANING`: full width responsive, purple, radius 24, `py-4 px-5`, 36×36 white-20 Plus tile, white 14/900 uppercase, ChevronRight; pushes generic Category. Below are two equal white House/Car cards, 12 px gap, radius 16, 16 px padding, 44×44 accent-tint wells and 12/900 labels; each pushes Booking with category preselected. Favorites appears only if nonempty: uppercase header and `See All`; horizontal 80 px person columns, 64 px circular cover avatar, 10/700 one-line name. Recent Jobs appears only if nonempty: header/`View All`, 12 px gap, reusable JobSummary rows (white-70%, radius 24, 16 px, 44 px icon well, title/address and status pill). No customer data shows neither section—there is no authored combined-home empty illustration.

**Cleaner sheet.** Status header shows `YOUR STATUS`, 10 px green/grey dot, 18/900 Online/Offline, and toggle action (`GO OFFLINE` quiet or `GO ONLINE` purple). Three equal KPI tiles show icon, Jobs, Rating, Earned. Online content header is `INCOMING JOBS (n) · NEAREST FIRST`. Empty: white radius-16 card with 32 px padding, 56×56 icon tile, `No jobs nearby right now`, notification copy. Jobs: white radius-16 rows, 16 px padding; 56×56 photo/icon tile, title, purple budget pill, one-line address, distance, schedule, registration micro badge and `📷 n` when applicable; tap Job Detail. Offline does not show incoming jobs. Attempting Online while unregistered alerts with Cancel/`Register Now`; registration navigation is the exit.

## G. House Cleaning

House is not a separate route: it is the `CHECKLIST` branch of Booking Create. The exact progressive content is:

1. Numbered section `Property Size`: selectable size chips/cards sourced in the route; `Square Metres` numeric field placeholder `e.g. 120` and story selection. Numeric keyboard.
2. `Areas to Clean`: multi-select chips — Living Room, Bedrooms, Kitchen, Dining Room, Bathrooms, Hallways, Stairs, Other.
3. `Cleaning Required`: single-select rows — Standard Cleaning / `Regular upkeep of common areas`; Deep Cleaning / `Thorough top-to-bottom clean`; Move In / Move Out Cleaning / `Full clean before or after a move`; Post Renovation Cleaning / `Dust and debris removal after work`.
4. `House Condition`: Light, Moderate, Heavy.
5. `Additional Services` (optional): Laundry, Ironing, Dishes, Carpet Cleaning, Inside Fridge, Organizing, Window Cleaning, Other.

Section number circles are 20 px purple with white 10/900 digits; headings 14/900. Selected small chips are purple with white 12/900; default is Ink-5/white with Ink-70 label. Selected large options use Brand 50/border and purple title. Exact service prices are **NOT DEFINED IN CODE**. Bottom nav hidden; wizard footer documented in Booking.

## H. Car Cleaning

Car is the other `CHECKLIST` branch:

- Vehicle Type: Sedan, SUV, Truck, Van, Other.
- Cleaning Type: Exterior (`Wash, wax, and detail the outside`), Interior (`Vacuum, wipe down, and freshen the cabin`), Full Service (`Complete inside and out detail`), Other (`Tell us what you need`).
- Condition: Clean, Average, Very Dirty.
- Registration Number (optional): row begins `#`, placeholder `e.g. ABC 1234`, auto-capitalized input; helper explains it identifies the vehicle.
- Exterior Services: Wash, Wax / Polish, Tire Shine, Rim Cleaning, Scratch Removal, Headlight Cleaning, Bug Removal, Other.
- Interior Services: Vacuum, Dashboard Cleaning, Seat Cleaning, Door Panel Cleaning, Carpet Shampoo, Air Freshener, Window Cleaning, Other.
- Deep Services: Steam Cleaning, Upholstery Shampoo, Engine Bay Cleaning, Odor Removal, Pet Hair Removal, Other.

Service arrays render through the same chip/option components as House. Visibility of sub-service sections responds to cleaning type. No fixed Exterior/Full/Deep price exists; **NOT DEFINED IN CODE**.

## I. Booking

### Shared wizard chrome — `/booking/create`

White SafeArea. Fixed authored header: 20 px gutters; 40×40 back control; center title (service/category context, 20/900) and uppercase step count 11/700; right balancing space. Beneath is progress made from six flexible bars. Main content is a vertical ScrollView; sticky footer has top border, Back where applicable and responsive primary `NEXT`/`SUBMIT REQUEST`. Back goes to prior state; on first step it calls router back. Primary disabled state is Ink 10% with Ink 30% text. Tab bar hidden.

### 4.1 Category

Title `What do you need cleaned?`, subtitle `Choose a service to get started`. Two selection cards for House Cleaning and Car Cleaning contain 48 px icon wells, 16/900 title, 12/500 description and selected indicator. A route category param preselects and advances context. Next requires category.

### 4.2–4.3 Checklists

See G/H. Validation is state-based; no inline error copy is rendered. Next remains disabled until required category-specific values satisfy `canProceed()`.

### 4.4 Details & Condition

Title/subtitle, uppercase `SPECIAL INSTRUCTIONS (OPTIONAL)`, multiline input placeholder `Gate code, pets, stains to focus on, parking instructions…`. Before Photos area explains requirements, then a wrapping thumbnail grid. Each thumbnail is cover-cropped square with `Needs Cleaning` black overlay label and remove action. Maximum six; `TAKE PHOTO` purple-tint and `CHOOSE FROM LIBRARY` secondary actions. Permission, six-limit, and upload failures use native alerts; uploading state uses indicators. Next does not require notes.

### 4.5 Location

`Where is the job?`; address field with MapPin and placeholder `Enter an address…`; below, current-location action with location icon and dynamic fetching label. Current coordinates reverse/compose address as available. Failure: `Location Error` native alert. An embedded confirmation map is not implemented in this step. Next requires nonempty address and coordinates per route validation.

### 4.6 Schedule

`When do you need it?`; option rows: ASAP/`Within the hour`; Today/`Later today`; Tomorrow/`Schedule for tomorrow`; Pick Date/`Choose a specific date`. Selected row uses brand treatment. Custom selection exposes native `DateTimePicker` controls for date/time; picker visual appearance is OS-owned. Next requires a valid schedule.

### 4.7 Budget & Review

`Set your budget`; strategy cards: Instant Book/`Match with a highly-rated pro at a fixed local rate.` and Receive Bids/`Let professionals compete for your job. Review profiles and prices.` A `Popular` micro pill is shown on the configured strategy. Budget choices/custom entry use a dollar prefix, placeholder `$0`, numeric keyboard, and selected pills. `Review Request` summary rows show category/service, location, schedule, budget and captured details. This is review embedded in the Budget screen, not a seventh route/step. `SUBMIT REQUEST` creates the job then replaces Offers; duplicate protection is the loading/disabled flag. Failure alert: `Failed to post job. Please try again.`

### 4.8 Offers — `/booking/offers`

White/light screen with back 40×40, title `Bids Received`, and live job listener. If accepted/assigned, it replaces Tracking. Waiting state shows animated/loading visual, current budget, and explanatory copy. Bid list cards contain cleaner avatar/initials, name, verification/rating/job metadata when available, offered price, ETA, message, `DECLINE` secondary and `ACCEPT` brand action. Accept opens native `Accept Offer?` with price and cleaner; processing disables conflicting action, then replaces Confirmation. Failure alerts.

Raise-budget control opens an authored sheet/form with current value and numeric amount; validation requires positive and greater than current; update error alerts. Cancel Job is native destructive confirmation; success replaces Home. Empty/no bids is the waiting state; there is no separate no-cleaner terminal screen.

### 4.9 Confirmation — `/booking/confirmation`

White SafeArea centered with 24 px gutters: large emerald success circle/check, `Booking Confirmed!`, support text, then full-width purple `TRACK YOUR CLEANER` button (replaces Tracking) and text/secondary `BACK TO HOME` (replaces Home). The route does not render a detailed service/address/payment card. Loading/error is **NOT DEFINED IN CODE**. Tab bar hidden.

## J. Cleaner Experience

### 5.1–5.3 Job Detail — `/job/[jobId]`

Light SafeArea and ScrollView; header has 40×40 back and title. Loading is centered ActivityIndicator. Missing job shows centered copy and a back text action. Main card displays category/service, pending/status badge, budget, location, schedule, details, house property layout or car registration, notes, and before-photo grid. Photos are cover squares with `Dirty / Before` overlay; no full-screen viewer is coded here.

Open jobs show bid form: uppercase `YOUR PRICE (USD)` numeric input; `ESTIMATED ARRIVAL (MINUTES)` numeric input, ETA preset chips; optional introduction message multiline; primary submit. Price must be >0; ETA integer 1–120; closed job and duplicate state are checked. Native success `Bid Placed!` explains notification; then submitted view says the offer is waiting. Closed state says job already accepted. Errors are native alerts. Bottom navigation hidden.

### 5.4 Become a Cleaner — `/register-cleaner`

White SafeArea, header/back, scroll form, 24 px gutters. Fields: full legal name, phone, physical address; selectable House/Car service cards; email verification card/action with sent/check states; proof-of-residence uploader with photo thumbnail/status. The uploader uses image library/camera mechanisms and async progress where coded. Main submit validates all three text fields, at least one service, proof, and verified email. Success stores registration then pushes Cleaner Agreement. Errors are exact native alerts listed by missing requirement. Tab bar hidden.

Cleaner verification outcomes, suspension dashboard, equipment inventory, earnings analytics, commission payment flow, and admin approval screen are **NOT SEPARATE IMPLEMENTED SCREENS**. Pending registration/status is surfaced through profile/home data and alerts.

## K. Messaging

### Conversation list — `/(tabs)/messages`

SafeArea `#F2F1F5`; 20 px header gutters, `Messages` 24/900. Bottom tabs visible. Loading is centered ActivityIndicator. Empty has centered 80×80 Slate tile with Message icon, `No conversations yet`, and support. Populated FlatList uses 20 px gutters and spacing: white radius-24 card, 16 px padding, 48×48 accent-tint emoji avatar, other-user name, one-line last-message preview, time/chevron, and 20×20 purple unread badge with white micro count. Tapping sets selected conversation in the same route—no router transition.

### Chat thread

White SafeArea/keyboard-avoiding root; bottom tabs remain part of tab route but content occupies the tab screen above the bar. Header has 40×40 Back local action, name 16/900 and service/job subtitle 12/500, bottom border. Scroll list groups bubbles right for self, left for other. Bubble maximum width is 78%; self is purple/white text with asymmetric 24 px radii, other Slate 100/Slate 900. Text is 14/500; timestamps/read receipts are small metadata adjacent/below as implemented. Image messages render remote image content.

Suggested quick replies appear horizontally as Slate-100 outlined pills. Composer: top border, 16 px horizontal/12 px vertical; 44×44 accent-tint attachment button; flexible Slate-50 16 px-radius input with `Type a message…`; 44×44 send button purple only with nonblank content, otherwise Slate-100/disabled. Send clears local input and calls service. Attachment opens native `Send Photo` choices Camera/Photo Library/Cancel; denied permission alerts. Explicit typing indicator, retry bubble, and chat-lock state are **NOT DEFINED IN CODE**.

## L. Maps & Location

- Home and Tracking maps fill the available background. Native map styling, POI typography, legal marks, zoom controls, and pin collision are SDK/platform-owned.
- `MapPlaceholder` is a full-size three-stop purple gradient with decorative translucent map lines/markers and centered pill `Demo mode — live map disabled`.
- Home top overlays do not consume map layout space. Tracking uses a 40×40 purple rounded-square job marker and a 40×40 emerald cleaner marker, each with shadow and Lucide/emoji content.
- Tracking enables native user location and suppresses default my-location button. Location recenter uses map camera animation where invoked.
- Booking location is a text address + current-location action, not a dedicated selector map/autocomplete screen.
- Location permission is requested in Permissions and at use sites. Denied state is a native alert/settings path; no designed full-screen denial illustration.
- ETA is calculated/displayed in minutes; distance in cleaner job cards is kilometres. Exact geocoding accuracy and map loading skeleton are outside UI code.

## M. Profile

`/(tabs)/profile` is a SafeArea `#F2F1F5`, ScrollView, bottom tabs visible. Header is 20 px gutters with `Profile` 24/900. Profile card: 20 px side margin, white, radius 32, padding 24, Slate-100 border/shadow. Avatar is 64×64 rounded-24, purple fallback with white initial or cover image, and 24×24 camera badge. Name is 20/900; email 14/500; role pill is 10/900 uppercase and role-colored. A 40×40 camera action also appears at row right.

Cleaner profiles add a top-divided three-column KPI strip (Jobs, Rating, Balance) at 20 px top padding. A standalone Notifications settings card has 40×40 tint well, title/subtitle and native Switch; Switch exact geometry is OS-owned.

Menu groups are white radius-24 cards with section uppercase labels. Each row has 40×40 Slate icon well, 14/900 label, 12/500 subtitle, ChevronRight, 20 px horizontal/16 px vertical padding, and dividers except last. Actual routes/actions include History, Favorites (customer), Reviews, portfolio placeholder (cleaner), Become a Cleaner (customer), Privacy Policy, role-specific agreement, Help & Support. At bottom: outlined `DELETE ACCOUNT`, then pale-red `SIGN OUT`. Both open native confirmations; deletion may fail due to re-auth/active financial state. Photo tap opens Camera/Library/Remove Photo/Cancel native menu; progress overlays avatar, failures alert.

There is no profile text-edit form or standalone settings screen.

## N. Settings

There is **NO SETTINGS ROUTE**. The Profile screen contains notification Switch, legal/help links, photo management, delete, and sign out. Wallet holds payment methods. OS Settings can be opened from permission alerts. Do not fabricate password, theme, language, address-book, or privacy-toggle screens.

## O. Notifications

`/notifications`: light SafeArea; header with 40×40 back, `Notifications` 20/900, balancing area. FlatList with 20 px gutters. Each row is white/radius-24 with semantic icon well, title, body, timestamp, unread accent dot/background distinction. Tap marks read and, when `jobId` exists, pushes Tracking. Empty state says `You're all caught up` with supporting copy/icon. Loading is an ActivityIndicator. Bottom nav hidden because it is a stack route. Badge count on Home Bell is **NOT DEFINED IN CODE**.

## P. Modals & Bottom Sheets

1. `BottomSheet`: transparent Modal, black-50 pressable scrim, white sheet anchored bottom at default 60% viewport (`snapHeight * Dimensions.height`), top radius 32, 48×6 handle, 24 px sides, spring open (damping 30/stiffness 200), 250 ms close. Scrim/back dismisses.
2. `GlassSheet`: non-modal anchored home surface; full width, radius 32 top, 36×4 handle, 20 px sides; max home height 62%; cannot be scrim-dismissed.
3. Wallet Add Funds: black-50 scrim, white top-radius-32 sheet, `p-6 pb-10`; close X; amount, quick amounts, submit. Scrim dismisses.
4. Tracking Job Photos: black-50 scrim; white top-radius-36, 24 px sides/top, 40 px bottom, max 85%; close, segmented Before/After, scroll grids. Back/close dismiss.
5. Tracking Photo Viewer: black-95 full-screen, `resizeMode=contain`, 40×40 white-20 top-right close; back dismisses.
6. Country Picker and reCAPTCHA: full-screen/page-sheet modals documented in E.
7. Report an Issue: BottomSheet triggered from eligible History item; title, multiline reason, cancel/submit; empty submit alerts.
8. Native dialogs: terms-required, permission, photo source, accept bid, cancel job, SOS, calling placeholder, wallet withdraw, delete/sign-out, errors/success. Their authored text/actions are documented; visual metrics and animation are **NOT DEFINED IN CODE**.

## Q. Forms & Inputs

| Input                | Label/placeholder                   | Geometry/type/validation                                      |
| -------------------- | ----------------------------------- | ------------------------------------------------------------- |
| Phone                | Phone Number / country-specific     | Flexible row, `py-4`; phone pad; required.                    |
| Email                | Email / `you@example.com`           | 16 px radius, `px-4 py-4`; email keyboard, no caps; required. |
| Password             | Password / `••••••••`               | Same; secure text; required; visibility behavior where coded. |
| OTP                  | none                                | 6 × 48×56 cells; numeric, max 1; exactly six.                 |
| Full name            | Full Name / `Your full name`        | full width; required trim.                                    |
| Address              | Address / `Enter an address…`       | icon row; required plus location.                             |
| Square metres        | section label / `e.g. 120`          | numeric; exact min/max NOT DEFINED.                           |
| Registration         | optional / `e.g. ABC 1234`          | uppercase text; optional.                                     |
| Instructions         | optional / gate-code sentence       | multiline; optional.                                          |
| Custom budget        | amount / `$0`                       | numeric/decimal; positive.                                    |
| Bid price            | Your Price (USD)                    | decimal; >0.                                                  |
| ETA                  | Estimated Arrival (Minutes)         | numeric; 1–120.                                               |
| Bid message          | optional introduction               | multiline; optional.                                          |
| Chat                 | `Type a message…`                   | flexible; send disabled when trimmed empty.                   |
| Wallet amount        | Amount (USD) / `0.00`               | decimal; minimum $1.00.                                       |
| Country search       | search sentence                     | filters name, ISO code, calling code.                         |
| Cleaner registration | legal name, phone, physical address | text/phone fields; all required.                              |
| Report/problem       | descriptive prompt                  | multiline; required for reports and rating <3.                |

Common default: white or translucent background, 1 px Ink/Slate border, 16 px radius, 12–16 px inset, 14–16 px Public Sans. Focus style is largely native; an explicit cross-app purple focus ring is **NOT DEFINED IN CODE**. Errors mostly alert rather than inline. Disabled inputs are action-specific, not a common variant. Date/time controls are native pickers.

## R. Loading / Empty / Error / Success States

| Area         | Loading                                 | Empty                                                        | Error                                                                 | Success/disabled/offline                             |
| ------------ | --------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| App/fonts    | returns `null` until font load resolves | N/A                                                          | font failure still continues                                          | native splash hidden.                                |
| Home         | centered spinner before data/map        | cleaner empty card; customer omits empty sections            | registration/location native alert                                    | online/offline local state; no global offline UI.    |
| Booking      | button spinner/upload spinners          | photo list absent                                            | native location/upload/submit alerts                                  | Next disabled by validation; submit routes Offers.   |
| Offers       | listener/loading/waiting animation      | waiting-for-offers state                                     | native action alerts                                                  | accepted routes Confirmation/Tracking.               |
| Job          | centered spinner                        | not-found copy                                               | bid alerts                                                            | submitted/closed card.                               |
| Tracking     | `Loading map…`/screen listener          | empty photo sections                                         | status/payment/photo alerts                                           | payment/rating/success stages.                       |
| Messages     | centered spinner                        | authored no-conversations                                    | permission alerts; send failure has no authored retry                 | send disabled blank; no offline state.               |
| Wallet       | service/loading indicators              | No transactions yet                                          | payment alerts                                                        | pending transaction label; top-up alert/sheet close. |
| Profile      | photo spinner                           | fallbacks initials/KPI values                                | native alerts                                                         | destructive confirmation.                            |
| Lists        | ActivityIndicator                       | authored History/Favorites/Notifications/Reviews empty cards | listener failures generally no dedicated screen                       | pull/list updates where implemented.                 |
| Fatal render | N/A                                     | N/A                                                          | ErrorBoundary: `Something went wrong`, raw error message, `Try again` | reset rerenders subtree.                             |

Global maintenance, forced-update, offline banner, skeleton loaders, and universal retry screens are **NOT DEFINED IN CODE**. Do not create them as current-state frames.

## S. Navigation Map

```text
Index/AuthGuard → signed out → Splash → video/end/8s → Welcome
Welcome → Skip/Get Started/Log In → Sign In
Sign In → country trigger → Country Picker → selection → Sign In
Sign In(phone) → Send Code → reCAPTCHA when required → Verify → Create Profile
Sign In(email) → sign in/create → Create Profile if incomplete OR Home
Sign In → Forgot password → sent → Sign In
Create Profile → Permissions → Home

Home(Customer) → Request Cleaning → Booking Category
Home(Customer) → House/Car → Booking preselected branch
Booking → Checklist → Details → Location → Schedule → Budget/Review
Budget/Review → Submit → Offers → Accept → Confirmation → Track → Tracking
Offers → Cancel → Home
Confirmation → Home OR Tracking
Tracking(customer) → Payment → Rating/Skip → Success → Home

Home(Cleaner) → Go Online → registration gate OR incoming jobs
Incoming Job → Job Detail → Submit Bid → waiting
accepted notification/active banner → Tracking → status progression/photos → completed
Home/Profile → Become a Cleaner → registration → Cleaner Agreement → Home

Bottom tabs: Home | Activity (missing route) | Messages | Wallet | Profile
Messages list → conversation card → inline Chat → local Back → list
Wallet → Add Funds sheet / Withdraw native dialog
Profile → History → Report sheet
Profile/Home → Favorites → Message cleaner
Profile → Reviews / Help / Privacy / applicable Agreement
Home Bell → Notifications → job notification → Tracking
Any unknown route → Not Found
Job notification: BOOKING_CREATED or NEW_BID → Offers; other job type → Tracking
```

## T. Component Library

| Actual component                                          | Props/variants                                   | Usage                                                                           |
| --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `Logo`                                                    | size, color                                      | splash/brand contexts. SVG D mark.                                              |
| `Wordmark`                                                | size, color/accent                               | Welcome/brand contexts.                                                         |
| `GlassCard`                                               | light/dark/brand, style/class                    | auth cards, home active content, permission content. iOS blur/Android fallback. |
| `GlassIconButton`                                         | size (44 default), light/dark, disabled, onPress | map/header controls.                                                            |
| `GlassSheet`                                              | light/dark, maxHeight, children                  | Home bottom sheet.                                                              |
| `RoleToggle`                                              | Customer/Cleaner                                 | Home top; animated pill.                                                        |
| `BottomSheet`                                             | visible, close, title, `snapHeight=.6`           | report/general sheet.                                                           |
| `CountryPickerModal`                                      | countries, selected, search, onSelect            | Sign In.                                                                        |
| `RecaptchaModal`                                          | imperative verify/cancel                         | phone auth.                                                                     |
| `SocialSignInButtons`                                     | Google plus iOS Apple; loading                   | Sign In.                                                                        |
| `StarRating`                                              | rating, size, readonly/onChange                  | Reviews/tracking input/display; filled yellow stars.                            |
| `MapPlaceholder`                                          | no interactive props                             | map fallback/demo.                                                              |
| `ErrorBoundary`                                           | children/reset                                   | wraps whole authenticated app.                                                  |
| Local `JobSummary`                                        | Job data/status                                  | Customer Home recent jobs.                                                      |
| Local booking `SectionHeader`, chips/options, `ReviewRow` | selection/data                                   | House/Car wizard.                                                               |
| Bottom `TabIcon`                                          | Lucide + focused                                 | all tab routes.                                                                 |

Figma should componentize local repeated patterns too: PrimaryButton, ChoiceCard, Field, PhotoTile, StatusChip, PersonAvatar, JobCard, BidCard, TransactionRow, SettingsRow, EmptyState, Timeline, MapMarker, ChatBubble, Composer, NativeDialog annotation. States should reflect only implemented variants: default/pressed/disabled/loading; selected/unselected; semantic status; customer/cleaner; iOS blur/Android fallback.

## U. Asset Inventory

| File                                  |                           Intrinsic dimensions | Type/purpose/presentation                                                |
| ------------------------------------- | ---------------------------------------------: | ------------------------------------------------------------------------ |
| `mobile/assets/intro.mp4`             | runtime video metadata; **NOT DEFINED IN JSX** | Splash full-bleed cover video.                                           |
| `mobile/assets/splash.png`            |                                1242×1242 (1:1) | Native Expo splash image; configured by app config, not an in-app Image. |
| `mobile/assets/adaptive-icon.png`     |                                1024×1024 (1:1) | Android adaptive launcher foreground.                                    |
| `mobile/assets/favicon.png`           |                                  196×196 (1:1) | Web/favicon build asset.                                                 |
| `mobile/assets/notification-icon.png` |                                  256×256 (1:1) | Android notification glyph, not screen content.                          |

All other people/job/completion images are remote URI data and use `cover` for thumbnails/avatars or `contain` in full-screen viewer. Their image subject, intrinsic ratio, and crop cannot be specified from source. Brand Logo/Wordmark are code-native SVG/text. Lucide icons are vector dependencies. Map tiles are external native SDK assets.

## V. Animation & Interaction Inventory

- Root pushes: slide from right; auth/tab group: no transition; Tracking: slide from bottom, gesture disabled.
- Welcome: native horizontal paging tied to screen width; programmatic next scrolls to next page. Duration/easing **NOT DEFINED IN CODE**.
- BottomSheet: spring in, damping 30/stiffness 200; timing close 250 ms.
- RoleToggle: Animated spring, friction 9/tension 80.
- Splash: animation is embedded in MP4; advances on playback end/8 seconds.
- TouchableOpacity: opacity feedback; common explicit activeOpacity .7/.8/.85. Duration/easing are native and not specified.
- ActivityIndicator: native indefinite spinner. No custom skeleton/shimmer.
- Map camera/live marker changes are native; exact easing/duration except any inline map duration is implementation/platform owned.
- Native Modal variants use slide/fade as individually configured; OS alerts/pickers own animations.
- Reduce Motion handling is **NOT DEFINED IN CODE**.

## W. Responsive Behaviour

- All screens are phone-first flex layouts. SafeArea adds runtime top/bottom insets.
- Widths are primarily `flex-1`, `w-full`, 20/24 px gutters; cards split with equal flex. No min/max phone width or breakpoint.
- Welcome slide width equals live window width. BottomSheet height equals window height × snapHeight; Home sheet maximum is 62%; Job Photos maximum 85%.
- Message bubbles max 78%; photo grids use roughly 47% widths; images use square aspect ratio. Long labels use `numberOfLines=1` in cards.
- ScrollView/FlatList makes long portrait content reachable. KeyboardAvoidingView uses `padding` on iOS and `height` on Android.
- Bottom tab is absolute, 82 px tall, so tab content must visually account for it; screens generally provide bottom padding.
- iOS uses blur for tab/glass; Android uses near-opaque white fallback. Apple sign-in is iOS only.
- Landscape/tablet-specific layout is **NOT DEFINED IN CODE**; it will stretch/reflow flex containers, potentially poorly. No orientation lock appears in screen code; app configuration is authoritative.
- Dynamic Type caps/minimum scaling are **NOT DEFINED IN CODE**. Figma should reproduce current fixed utility sizes, not invent an accessibility redesign.

## X. FIGMA RECREATION SPECIFICATION

### Page structure

1. Cover
2. Design System
3. Components
4. Authentication
5. Customer
6. House Cleaning
7. Car Cleaning
8. Booking
9. Cleaner
10. Messaging
11. Profile
12. Settings (place a “No route implemented” audit note only)
13. States
14. User Flows

Use 390×844 as a convenient working frame, then validation frames at 360×800 and 430×932. These are Figma recommendations, **not code-defined target dimensions**.

### Components and variants

- `Button`: Primary/Secondary/Text/Danger/Icon × Default/Pressed/Disabled/Loading.
- `Choice`: Chip/Card/Segment × Default/Selected/Disabled.
- `Field`: Text/Password/Phone/Search/Multiline/Currency/OTP × Empty/Filled/Focused/Error/Disabled (mark Error/Focus as audit gaps where not authored).
- `Surface`: GlassCard Light/Dark/Brand and Android fallback; ListCard; Sheet.
- `Navigation`: BottomTab Item active/inactive; StackHeader; RoleToggle Customer/Cleaner; ProgressBar 1–6.
- `Job`: Summary/Incoming/Bid/Tracking × lifecycle status.
- `Media`: Avatar image/initial, BeforeTile, DoneTile, uploading/empty.
- `Feedback`: Spinner, EmptyState, StatusChip, native-alert annotation, fatal error.
- `Messaging`: ConversationRow read/unread, Bubble self/other/image, Composer enabled/disabled.
- `Money`: BalanceCard, PaymentMethod, Transaction credit/debit/pending.

### Auto Layout and constraints

- Every screen: vertical Auto Layout root; safe-area header fixed/hug; content fill and scroll; CTA footer hug/fixed.
- Headers: left/right 40–48 px fixed; center fills and centers. Home header overlays and pins top.
- Tab bar: pin left/right/bottom, fixed 82; five equal fill-width items.
- Map: pin all edges. Home/Tracking overlays pin top/bottom; bottom sheet stretches horizontally.
- Cards/fields/buttons: stretch to parent width unless explicitly icon-sized. Two-column category/KPI cards share equal width.
- List rows: avatar/icon fixed; text column fill; price/chevron hug. Permit vertical growth in long-text test frames even though some implementation text truncates.
- Chat composer pins above tab/keyboard; message list fills remaining height.
- Modal scrim pins all edges; sheet pins left/right/bottom; height percentage annotated.

### Complex hierarchy examples

```text
Home → Map(fill) + SafeAreaHeader(RoleToggle, Bell) + ActiveJob(optional)
     + GlassSheet(handle → role-specific ScrollView) + BottomTabs
Booking → SafeArea → Header(back, title/step) → Progress → ScrollContent
        → Footer(back/next)
Tracking → Map(fill) → FloatingHeader(back,status,SOS) → GlassSheet
         → identity → timeline → photo/checklist/actions → stage overlay/modal
Messages/Chat → SafeArea → ChatHeader → MessageList → QuickReplies(optional)
              → Composer → BottomTabs
```

### Recreation rules

1. Bind all colors/type/radius/space to variables; retain opacity modifiers.
2. Use Lucide vector instances rather than traced raster icons.
3. Keep native controls (alerts, switches, date pickers) as iOS/Android platform components with an annotation—not fabricated Detail styling.
4. Represent remote images with clearly labelled placeholders and correct crop/radius.
5. Prototype only implemented links in S; mark Activity with a broken/missing-route note.
6. Place source classification on measurements: Direct, Derived, Responsive, Not defined.
7. Do not add imagined error/offline/search/settings screens to the “current implementation” page.

## Y. Screen-by-Screen Figma Checklist

Apply every sub-check to **each named frame/state**; repeated text is intentionally retained so no screen is silently skipped.

### 1. Bootstrap/Auth routing

- [ ] Screen frame created
- [ ] Correct background; header; navigation; typography; spacing
- [ ] Correct buttons; icons; cards; images
- [ ] Correct states; interactions; responsive behaviour

### 2.1 Splash

- [ ] Screen frame created
- [ ] Correct background/video cover; no header/navigation
- [ ] Correct typography, spacing, buttons, icons, cards, images (N/A items annotated)
- [ ] Correct completion/fallback interactions and responsive behaviour

### 2.2 Welcome slide 1 / 2 / 3 (three frames)

- [ ] All three screen frames created
- [ ] Correct background, wordmark, Skip visibility and no bottom navigation
- [ ] Correct slide typography, spacing, CTA, icons, illustration cards and indicators
- [ ] Correct pager states, interactions and responsive width

### 2.3 Sign In — Phone / Email sign-in / Email create (three frames)

- [ ] All mode frames created
- [ ] Correct white background, back header and hidden tabs
- [ ] Correct typography, glass card spacing, buttons, icons, fields and legal content
- [ ] Correct empty/filled/loading/terms-error interactions and keyboard behaviour

### 2.4 Country Picker

- [ ] Screen frame created
- [ ] Correct white background, modal header and hidden navigation
- [ ] Correct search, country rows, flags, dial pills, selected/empty states
- [ ] Correct close/select/filter interactions and responsive list

### 2.5 reCAPTCHA

- [ ] iOS/Android platform frames annotated
- [ ] Correct page-sheet background/header and Cancel
- [ ] Correct WebView/loading state
- [ ] Correct cancel/success interaction and platform-responsive behaviour

### 2.6 Phone Verification

- [ ] Screen frame created
- [ ] Correct white background/back header/no tabs
- [ ] Correct six cells, typography, spacing, Verify and resend
- [ ] Correct sending/error/verifying/countdown interactions and keyboard

### 2.7 Forgot Password — Entry / Sent

- [ ] Both screen frames created
- [ ] Correct background/back header/navigation
- [ ] Correct field/success icon, typography, buttons and cards
- [ ] Correct validation/loading/resend/sign-in interactions

### 2.8 Create Profile

- [ ] Screen frame created
- [ ] Correct background/progress/no tabs
- [ ] Correct avatar, field, role cards, CTA, typography and spacing
- [ ] Correct upload/selected/disabled/loading interactions and keyboard

### 2.9 Permissions

- [ ] Screen frame created
- [ ] Correct background/progress/header relationship/no tabs
- [ ] Correct permission cards, badges, grant buttons, icons and CTA
- [ ] Correct denied/granted/loading interactions and safe areas

### 3.1 Home Map Loading / Loaded

- [ ] Both frames created
- [ ] Correct map/fallback background and floating header
- [ ] Correct spinner, role toggle, bell, sheet and bottom tabs
- [ ] Correct overlay constraints and responsive safe areas

### 3.2 Customer Home — Empty sections / Populated

- [ ] Both frames created
- [ ] Correct map/sheet/background/header/tabs
- [ ] Correct Request button, category cards, Favorites and Recent Jobs
- [ ] Correct conditional states, links, scroll and responsive cards

### 3.3 Cleaner Home — Offline / Online empty / Online jobs

- [ ] All three frames created
- [ ] Correct shared shell/navigation
- [ ] Correct status action, KPI tiles, empty or incoming cards
- [ ] Correct registration gate/toggle/job interactions and sheet scroll

### 3.4 Active Job Banner

- [ ] Customer and cleaner applicable overlay states created
- [ ] Correct brand background, typography, icon and chevron
- [ ] Correct placement below header and tracking interaction
- [ ] Correct responsive width

### 4.1 Booking Category

- [ ] Screen frame created
- [ ] Correct white background/header/progress/footer/no tabs
- [ ] Correct title, cards, icons and selected states
- [ ] Correct Back/Next interactions and responsive scroll

### 4.2 House Checklist

- [ ] Screen frame created
- [ ] Correct shared wizard chrome
- [ ] Correct every house section, label, option, field and add-on
- [ ] Correct multi/single selections, validation and scrolling

### 4.3 Car Checklist

- [ ] Screen frame created
- [ ] Correct shared wizard chrome
- [ ] Correct every vehicle/type/condition/registration/service option
- [ ] Correct conditional sections, selections, validation and scrolling

### 4.4 Details & Condition

- [ ] Screen frame created
- [ ] Correct shared chrome, textarea, photo section
- [ ] Correct photo tiles/overlays/remove and both upload buttons
- [ ] Correct empty/uploading/limit/error interactions and keyboard

### 4.5 Location

- [ ] Screen frame created
- [ ] Correct shared chrome, address field/current-location action
- [ ] Correct icon, text and loading state
- [ ] Correct required/error interactions and responsive keyboard layout

### 4.6 Schedule

- [ ] Screen frame created
- [ ] Correct shared chrome and four option rows
- [ ] Correct native date/time controls annotation
- [ ] Correct selection/validation interactions and responsive layout

### 4.7 Budget & Review

- [ ] Screen frame created
- [ ] Correct shared chrome, strategy cards, Popular badge and amount controls
- [ ] Correct every review row and Submit Request button
- [ ] Correct selected/disabled/submitting/error interactions and scrolling

### 4.8 Offers — Waiting / Bids / Raise Budget

- [ ] All three state frames created
- [ ] Correct background/header/no tabs
- [ ] Correct waiting visual, bid cards and raise-budget UI
- [ ] Correct accept/decline/cancel/loading/error interactions and list response

### 4.9 Confirmation

- [ ] Screen frame created
- [ ] Correct white background/no standard header/no tabs
- [ ] Correct success icon, title, copy and two actions
- [ ] Correct Tracking/Home interactions and responsive centering

### 5.1 Job Detail — Loading / Not Found / Open

- [ ] All frames created
- [ ] Correct background/header/no tabs
- [ ] Correct spinner/empty/detail rows/photo grid
- [ ] Correct back and responsive scroll behavior

### 5.2 Bid Form

- [ ] Screen frame created
- [ ] Correct price/ETA/message fields, presets and CTA
- [ ] Correct typography, spacing, cards and icons
- [ ] Correct validation/submitting/error interactions and keyboard

### 5.3 Bid Submitted / Closed

- [ ] Both states created
- [ ] Correct status card/copy and shared job details
- [ ] Correct disabled actions/icons
- [ ] Correct live-update/back interactions and responsive layout

### 5.4 Cleaner Registration

- [ ] Screen frame created
- [ ] Correct background/header/no tabs
- [ ] Correct all fields, service choices, verification and proof uploader
- [ ] Correct missing/uploading/verified/submitting/error interactions

### 6.1 Tracking Map

- [ ] Customer and cleaner/lifecycle frames created
- [ ] Correct map, markers, floating header and bottom sheet
- [ ] Correct identity, ETA, status timeline and actions
- [ ] Correct loading/live-update/responsive overlay behaviour

### 6.2 Cleaner Tracking Controls

- [ ] Each available next-status frame created
- [ ] Correct before/done photos, upload buttons, checklist and CTA
- [ ] Correct disabled/uploading/error/success interactions
- [ ] Correct sheet scrolling and responsive media grid

### 6.3 Complete Payment

- [ ] Screen frame created
- [ ] Correct title/total/payment method cards/CTA
- [ ] Correct typography, selection, emoji/icons and spacing
- [ ] Correct processing/error/success interactions and safe areas

### 6.4 Rate Cleaner

- [ ] Screen frame created
- [ ] Correct avatar/title, five-star input, conditional problem field, Submit/Skip
- [ ] Correct low-rating validation/loading/error interactions
- [ ] Correct keyboard and responsive layout

### 6.5 Tracking Success

- [ ] Screen frame created
- [ ] Correct success background/icon/title/copy/Home action
- [ ] Correct typography, spacing and imagery
- [ ] Correct Home interaction and responsive centering

### 6.6 Job Photos Sheet

- [ ] Before/After/empty frames created
- [ ] Correct scrim/sheet/close/segment controls
- [ ] Correct 47% square grids, overlays, icons and first-photo CTA
- [ ] Correct close/select/upload interactions and max-height scroll

### 6.7 Full-screen Photo Viewer

- [ ] Screen frame created
- [ ] Correct black-95 background/contain image/top-right close
- [ ] Correct icon sizing and safe placement
- [ ] Correct close/back interaction and responsive image fit

### 7.1 Conversations — Loading / Empty / Populated

- [ ] All three frames created
- [ ] Correct app background/header/bottom tabs
- [ ] Correct spinner/empty state/all conversation-row elements
- [ ] Correct unread/navigation/list responsiveness

### 7.2 Chat Thread

- [ ] Screen frame created
- [ ] Correct white background/thread header/navigation
- [ ] Correct self/other/image bubbles, replies, composer and icons
- [ ] Correct blank/enabled/sending/attachment interactions and keyboard

### 7.3 Send Photo Native Dialog

- [ ] iOS and Android annotated states created
- [ ] Correct platform background/typography/buttons/icons
- [ ] Correct Camera/Library/Cancel and permission-error paths
- [ ] Correct platform-responsive behavior

### 8.1 Wallet — Empty / Transactions / Negative Balance

- [ ] All states created
- [ ] Correct app background/header/bottom tabs
- [ ] Correct balance card, payment rows, transactions and warning banner
- [ ] Correct Add/Withdraw interactions and list responsiveness

### 8.2 Add Funds Sheet

- [ ] Screen frame created
- [ ] Correct scrim/sheet/header/amount/quick chips/CTA
- [ ] Correct selected/loading/error/success interactions
- [ ] Correct keyboard and responsive bottom anchoring

### 8.3 Withdraw Native Dialog

- [ ] Platform dialog states annotated
- [ ] Correct authored title/body/actions
- [ ] Correct dismiss/support interaction
- [ ] Correct platform behaviour

### 9.1 Customer Profile

- [ ] Screen frame created
- [ ] Correct app background/header/tabs
- [ ] Correct identity card, switch, customer menu groups and destructive actions
- [ ] Correct routes/photo/sign-out/delete interactions and scroll

### 9.2 Cleaner Profile

- [ ] Screen frame created
- [ ] Correct background/header/tabs
- [ ] Correct role chip, KPI row, cleaner-specific menu items and actions
- [ ] Correct portfolio placeholder/routes and responsive scroll

### 9.3 Profile Photo Chooser

- [ ] Native chooser states annotated
- [ ] Correct Camera/Library/Remove/Cancel content
- [ ] Correct permission/upload/error paths
- [ ] Correct platform behavior

### 9.4 Delete / Sign-out Confirmations

- [ ] Both native confirmation states annotated
- [ ] Correct destructive copy/actions
- [ ] Correct failure/re-auth and success navigation paths
- [ ] Correct platform behavior

### 10.1 History

- [ ] Loading/empty/populated frames created
- [ ] Correct background/back header/no tabs
- [ ] Correct job cards/status/date/price/report actions
- [ ] Correct detail/report interactions and list response

### 10.2 Report an Issue Sheet

- [ ] Screen frame created
- [ ] Correct scrim/sheet/handle/title/textarea/buttons
- [ ] Correct required/submitting/error/success interactions
- [ ] Correct keyboard/dismiss/responsive height

### 10.3 Favorites

- [ ] Empty/populated frames created
- [ ] Correct background/back header/no tabs
- [ ] Correct cleaner rows/avatar/name/rating/message/remove
- [ ] Correct confirm/remove/message interactions and list response

### 10.4 Notifications

- [ ] Loading/empty/read/unread frames created
- [ ] Correct background/back header/no tabs
- [ ] Correct notification icon wells/title/body/time/unread indicator
- [ ] Correct mark-read/deep-link/list responsiveness

### 10.5 Reviews

- [ ] Loading/empty/populated frames created
- [ ] Correct background/back header/no tabs
- [ ] Correct summary/review cards/stars/comment fallback
- [ ] Correct scrolling and responsive text

### 10.6 Help & Support

- [ ] Screen frame created
- [ ] Correct background/back header/no tabs
- [ ] Correct FAQ/contact/safety cards, icons and buttons
- [ ] Correct expand/email/safety-alert/error interactions and scroll

### 10.7 Customer Agreement

- [ ] Screen frame created
- [ ] Correct white background/back header/no tabs
- [ ] Correct title, every section heading/body and spacing
- [ ] Correct long scroll/back interaction and responsive text

### 10.8 Cleaner Agreement

- [ ] Screen frame created
- [ ] Correct white background/back header/no tabs
- [ ] Correct every legal section and acceptance/Home action where shown
- [ ] Correct long scroll/navigation and responsive text

### 10.9 Privacy Policy

- [ ] Screen frame created
- [ ] Correct white background/back header/no tabs
- [ ] Correct title/every section typography and spacing
- [ ] Correct long scroll/back interaction and responsive text

### 10.10 Not Found

- [ ] Screen frame created
- [ ] Correct background, centered title/support and return link
- [ ] Correct typography/buttons/icons/cards/images (N/A annotated)
- [ ] Correct return interaction and responsive centering

### 11. Fatal Error Boundary

- [ ] Screen frame created
- [ ] Correct white background/centered error card relationship
- [ ] Correct `Something went wrong`, raw message and `Try again`
- [ ] Correct reset interaction and responsive layout

### 12. Missing Activity destination

- [ ] Audit-only frame created, explicitly labelled `NOT IMPLEMENTED`
- [ ] Bottom-tab active icon shown only as router evidence
- [ ] No invented cards, buttons, content, states or interactions
- [ ] Broken/missing destination documented for engineering
