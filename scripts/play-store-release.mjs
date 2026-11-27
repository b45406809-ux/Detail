#!/usr/bin/env node
// Google Play: updates the store listing (text, contact details, icon, feature graphic,
// phone screenshots) and, when PROMOTE_VERSION_CODE is set, releases that version to the
// Production track. Policy declarations (Data safety, content rating, target audience,
// location permission video) are not available through the API and are reported.
import { createSign } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { appendFileSync, existsSync } from 'node:fs';

const credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '{}');
if (!credentials.client_email || !credentials.private_key) throw new Error('Play service account JSON is missing or invalid.');
const packageName = 'zw.co.detailapp.mobile';
const listing = JSON.parse(await readFile('play-store/listing.json', 'utf8'));
const report = [];
const note = (ok, text) => { report.push(`${ok ? '✅' : '⚠️'} ${text}`); console.log(`${ok ? 'OK' : 'TODO'}: ${text}`); };

const b64 = (value) => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}` }) });
if (!tokenResponse.ok) throw new Error(`Google service account authentication failed (HTTP ${tokenResponse.status}).`);
const { access_token: token } = await tokenResponse.json();

const root = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;
const uploadRoot = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${packageName}`;
async function request(url, method, body, contentType = 'application/json') {
  const response = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': contentType } : {}) }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]} → HTTP ${response.status}: ${data.error?.message || 'unknown error'}`);
  return data;
}
async function attempt(label, fn) { try { await fn(); note(true, label); return true; } catch (error) { note(false, `${label} — ${error.message}`); return false; } }

const edit = await request(`${root}/edits`, 'POST', '{}');
const e = `${root}/edits/${encodeURIComponent(edit.id)}`;
const u = `${uploadRoot}/edits/${encodeURIComponent(edit.id)}`;
const lang = listing.language;

await attempt('Store listing text (title, short and full description)', () => request(`${e}/listings/${lang}`, 'PUT', JSON.stringify(listing)));
await attempt('Contact details (email, website, phone)', () => request(`${e}/details`, 'PATCH', JSON.stringify({ contactEmail: 'support@detailapp.co.zw', contactWebsite: 'https://detailapp.co.zw', contactPhone: '+263714885936', defaultLanguage: lang })));
await attempt('App icon', async () => request(`${u}/listings/${lang}/icon?uploadType=media`, 'POST', await readFile('play-store/icon.png'), 'image/png'));
if (existsSync('play-store/feature-graphic.png')) await attempt('Feature graphic (1024×500)', async () => request(`${u}/listings/${lang}/featureGraphic?uploadType=media`, 'POST', await readFile('play-store/feature-graphic.png'), 'image/png'));

const shotDir = 'play-store/screenshots';
const shots = existsSync(shotDir) ? (await readdir(shotDir)).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort() : [];
if (shots.length) {
  await attempt(`Phone screenshots (${shots.length})`, async () => {
    await request(`${e}/listings/${lang}/phoneScreenshots`, 'DELETE');
    for (const file of shots) {
      const type = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
      await request(`${u}/listings/${lang}/phoneScreenshots?uploadType=media`, 'POST', await readFile(`${shotDir}/${file}`), type);
    }
  });
} else note(false, 'Phone screenshots — none found in play-store/screenshots');

const versionCode = process.env.PROMOTE_VERSION_CODE;
if (versionCode) {
  await attempt(`Production release of version ${versionCode}`, () => request(`${e}/tracks/production`, 'PUT', JSON.stringify({
    track: 'production',
    releases: [{ versionCodes: [versionCode], status: 'completed', releaseNotes: [{ language: lang, text: 'First release of Detail: book home and car cleaners near you, compare quotes, chat and follow every job.' }] }],
  })));
}

await attempt('Changes sent to Google Play (review starts for anything that needs it)', () => request(`${e}:commit`, 'POST', '{}'));
report.push('ℹ️ Do once in Play Console (no API): App content → Data safety, Content rating, Target audience, Ads, App access, and the background-location / foreground-service declarations with a short video.');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Google Play listing and release', '', ...report, ''].join('\n'));
