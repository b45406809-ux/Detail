#!/usr/bin/env node
// Fills in the App Store listing for Detail through the App Store Connect API and, with
// MODE=submit, sends the version for App Review. Steps that Apple does not expose through
// the API (App Privacy answers, screenshots if none are supplied) are reported, not faked.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY_P8, CUSTOMER_PASSWORD, CLEANER_PASSWORD,
//      CONTACT_FIRST_NAME, CONTACT_LAST_NAME, CONTACT_PHONE, CONTACT_EMAIL,
//      BUILD_NUMBER (optional, defaults to the newest valid 1.0.0 build), MODE=fill|submit
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const BUNDLE_ID = 'zw.co.detailapp.mobile';
const VERSION = '1.0.0';
const BUILD_VERSION = '1.0.0'; // CFBundleShortVersionString of the uploaded builds
const MODE = process.env.MODE === 'submit' ? 'submit' : 'fill';
const report = [];
const note = (ok, text) => { report.push(`${ok ? '✅' : '⚠️'} ${text}`); console.log(`${ok ? 'OK' : 'TODO'}: ${text}`); };

const LISTING = {
  name: 'Detail: Cleaning Services',
  subtitle: 'Home & car cleaners near you',
  promotionalText: 'Book trusted home and car cleaners in Harare. Compare quotes, chat and follow your booking live.',
  keywords: 'cleaning,cleaner,maid,house cleaning,car wash,valet,harare,zimbabwe,home services,booking',
  description: `Detail connects you with cleaners near you for your home or your car.

BOOK IN A FEW TAPS
Choose a service, tick what needs doing, pin the exact spot and send your request. You can also tap a saved cleaner to send the request straight to them.

COMPARE QUOTES, CHOOSE YOUR PRO
Nearby cleaners send their quotes. Compare price, rating and arrival time, then accept the one you like.

FOLLOW EVERY JOB
See when your cleaner is on the way, chat in the app, and review proof-of-work photos before you confirm the job and leave a rating.

KNOW WHO YOU ARE BOOKING
Cleaners verify their identity before they can quote. This is an identity check, not a background check.

PAY YOUR CLEANER DIRECTLY
You pay your cleaner directly, the way you both agree. Detail does not hold your money.

FOR CLEANERS
Go online to receive nearby requests, send quotes, and track your jobs and earnings. Detail charges a 10% commission from prepaid credit when a job is completed.

Safety tools are built in: report or block anyone from a chat, and use the emergency button during an active booking.`,
  supportUrl: 'https://detailapp.co.zw/support',
  marketingUrl: 'https://detailapp.co.zw',
  privacyPolicyUrl: 'https://detailapp.co.zw/privacy',
  copyright: '2026 Catalyst Labs (Private) Limited',
};

const reviewNotes = `Detail is a marketplace for in-person cleaning services in Harare, Zimbabwe. Customers post a cleaning job, verified cleaners send quotes, and the customer accepts one.

Two demo accounts are provided. Both can switch between Customer and Cleaner with the toggle at the top of the home screen. They are a private test pair: their bookings only reach each other, from any country, and never real users. Identity verification and the cleaner fee are already completed, and the cleaner side has prepaid test credit, so no payment is needed.

Customer: appreview@detailapp.co.zw (password in the sign-in fields)
Cleaner: appreview.cleaner@detailapp.co.zw / ${process.env.CLEANER_PASSWORD ?? ''}

To test with one account: create a booking as Customer, switch to Cleaner ("Nearby jobs"), open the booking and send a quote, then switch back to Customer and accept it. Chat and live tracking then open.

Location: precise location places the booking pin and matches nearby cleaners. Background location is used only while a cleaner has chosen to be online or is on an active booking; they can go offline at any time.

Payments for the cleaning are made directly between customer and cleaner for a physical, real-world service. Cleaners prepay a 10% platform commission; no digital goods are sold.

Account deletion: Profile > Delete account.`;

function token() {
  const now = Math.floor(Date.now() / 1000);
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${enc({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' })}.${enc({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })}`;
  const signature = cryptoSign('sha256', Buffer.from(unsigned), { key: createPrivateKey(process.env.ASC_API_KEY_P8), dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

async function asc(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = (data?.errors ?? []).map((e) => `${e.title}: ${e.detail}`).join('; ');
    throw new Error(`${method} ${path.split('?')[0]} → HTTP ${response.status} ${detail}`);
  }
  return data;
}

async function attempt(label, fn) {
  try { await fn(); note(true, label); } catch (error) { note(false, `${label} — ${error.message}`); }
}

const app = (await asc(`/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data?.[0];
if (!app) throw new Error('App not found in App Store Connect.');

// Version 1.0.0 (create it if needed).
// Use the version that is still being prepared (it may be named 1.0 rather than 1.0.0).
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY', 'DEVELOPER_REMOVED_FROM_SALE'];
const allVersions = (await asc(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`)).data ?? [];
let version = allVersions.find((v) => EDITABLE.includes(v.attributes.appStoreState ?? v.attributes.appVersionState)) ?? allVersions.find((v) => v.attributes.versionString === VERSION);
if (!version) {
  version = (await asc('/v1/appStoreVersions', { method: 'POST', body: { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION }, relationships: { app: { data: { type: 'apps', id: app.id } } } } } })).data;
}
note(true, `Version ${version.attributes.versionString} found (state ${version.attributes.appStoreState ?? version.attributes.appVersionState})`);

await attempt('Copyright set', () => asc(`/v1/appStoreVersions/${version.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: LISTING.copyright } } } }));

// Version text (description, keywords, URLs).
await attempt('Description, keywords, promotional text, support and marketing URLs set', async () => {
  const locs = (await asc(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data ?? [];
  const attributes = { description: LISTING.description, keywords: LISTING.keywords, promotionalText: LISTING.promotionalText, supportUrl: LISTING.supportUrl, marketingUrl: LISTING.marketingUrl };
  const loc = locs.find((l) => l.attributes.locale === 'en-US') ?? locs[0];
  if (loc) await asc(`/v1/appStoreVersionLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes } } });
  else await asc('/v1/appStoreVersionLocalizations', { method: 'POST', body: { data: { type: 'appStoreVersionLocalizations', attributes: { locale: 'en-US', ...attributes }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } } });
});

// App info: name, subtitle, privacy policy, category, age rating.
const appInfos = (await asc(`/v1/apps/${app.id}/appInfos`)).data ?? [];
const appInfo = appInfos.find((info) => !['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(info.attributes.appStoreState ?? info.attributes.state)) ?? appInfos[0];
await attempt('App name, subtitle and privacy policy URL set', async () => {
  const locs = (await asc(`/v1/appInfos/${appInfo.id}/appInfoLocalizations`)).data ?? [];
  const loc = locs.find((l) => l.attributes.locale === 'en-US') ?? locs[0];
  await asc(`/v1/appInfoLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { name: LISTING.name, subtitle: LISTING.subtitle, privacyPolicyUrl: LISTING.privacyPolicyUrl } } } });
});
await attempt('Category set to Lifestyle (secondary: Business)', () => asc(`/v1/appInfos/${appInfo.id}`, { method: 'PATCH', body: { data: { type: 'appInfos', id: appInfo.id, relationships: { primaryCategory: { data: { type: 'appCategories', id: 'LIFESTYLE' } }, secondaryCategory: { data: { type: 'appCategories', id: 'BUSINESS' } } } } } }));
const BOOLEAN_AGE_KEYS = new Set(['gambling', 'unrestrictedWebAccess', 'lootBox', 'messagingAndChat', 'userGeneratedContent', 'parentalControls', 'ageAssurance', 'healthOrWellnessTopics', 'advertising', 'seventeenPlus', 'gamblingAndContests']);
await attempt('Age rating answered (no objectionable content; users can chat)', async () => {
  const declaration = (await asc(`/v1/appInfos/${appInfo.id}/ageRatingDeclaration`)).data;
  const current = declaration.attributes ?? {};
  const attributes = {};
  for (const [key, value] of Object.entries(current)) {
    if (typeof value === 'string' && /^(NONE|INFREQUENT_OR_MILD|FREQUENT_OR_INTENSE|INFREQUENT|FREQUENT)$/.test(value)) attributes[key] = 'NONE';
    else if (typeof value === 'boolean') attributes[key] = false;
    // Unanswered questions come back as null: yes/no questions take false, content-level ones take NONE.
    else if (value === null) attributes[key] = BOOLEAN_AGE_KEYS.has(key) ? false : 'NONE';
  }
  for (const key of ['kidsAgeBand', 'ageRatingOverride', 'ageRatingOverrideV2', 'koreaAgeRatingOverride', 'developerAgeRatingInfoUrl']) delete attributes[key];
  for (const key of ['userGeneratedContent', 'messagingAndChat']) if (key in current) attributes[key] = true;
  await asc(`/v1/ageRatingDeclarations/${declaration.id}`, { method: 'PATCH', body: { data: { type: 'ageRatingDeclarations', id: declaration.id, attributes } } });
});

// App Review information (demo account and contact).
await attempt('App Review sign-in, contact and notes set', async () => {
  const attributes = {
    // Blank inputs are left out (undefined), so previously saved contact details are kept.
    contactFirstName: process.env.CONTACT_FIRST_NAME || undefined, contactLastName: process.env.CONTACT_LAST_NAME || undefined,
    contactPhone: process.env.CONTACT_PHONE || undefined, contactEmail: process.env.CONTACT_EMAIL || undefined,
    demoAccountName: 'appreview@detailapp.co.zw', demoAccountPassword: process.env.CUSTOMER_PASSWORD, demoAccountRequired: true,
    notes: reviewNotes.slice(0, 3900),
  };
  let detail = null;
  try { detail = (await asc(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)).data; } catch { detail = null; }
  if (detail?.id) await asc(`/v1/appStoreReviewDetails/${detail.id}`, { method: 'PATCH', body: { data: { type: 'appStoreReviewDetails', id: detail.id, attributes } } });
  else await asc('/v1/appStoreReviewDetails', { method: 'POST', body: { data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } } });
});

// Build.
await attempt('Build attached to the version', async () => {
  const builds = (await asc(`/v1/builds?filter[app]=${app.id}&filter[preReleaseVersion.version]=${BUILD_VERSION}&filter[processingState]=VALID&sort=-uploadedDate&limit=20`)).data ?? [];
  const wanted = process.env.BUILD_NUMBER ? builds.find((b) => b.attributes.version === process.env.BUILD_NUMBER) : builds[0];
  if (!wanted) throw new Error(`build ${process.env.BUILD_NUMBER || '(newest)'} is not processed yet`);
  await asc(`/v1/appStoreVersions/${version.id}/relationships/build`, { method: 'PATCH', body: { data: { type: 'builds', id: wanted.id } } });
  report.push(`   Build ${wanted.attributes.version}`);
});

// Screenshots: report what is there; uploading needs image files.
await attempt('Screenshots present', async () => {
  const locs = (await asc(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data ?? [];
  const sets = (await asc(`/v1/appStoreVersionLocalizations/${locs[0].id}/appScreenshotSets`)).data ?? [];
  const counts = await Promise.all(sets.map(async (set) => [set.attributes.screenshotDisplayType, ((await asc(`/v1/appScreenshotSets/${set.id}/appScreenshots`)).data ?? []).length]));
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  if (!total) throw new Error('no screenshots uploaded yet');
  report.push(`   ${counts.map(([type, n]) => `${type}: ${n}`).join(', ')}`);
});

if (MODE === 'submit') {
  await attempt('Submitted for App Review', async () => {
    const submission = (await asc('/v1/reviewSubmissions', { method: 'POST', body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } } })).data;
    await asc('/v1/reviewSubmissionItems', { method: 'POST', body: { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } } });
    await asc(`/v1/reviewSubmissions/${submission.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } } });
  });
}

report.push('ℹ️ App Privacy answers cannot be set through Apple\'s API: complete them once in App Store Connect → App Privacy.');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## App Store listing (${MODE})`, '', ...report, ''].join('\n'));
if (report.some((line) => line.startsWith('⚠️') && /Submitted/.test(line))) process.exit(1);
