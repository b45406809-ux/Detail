import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const required = ['ASC_KEY_PATH', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID', 'BUNDLE_ID', 'SIGNING_DIR'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const apiBase = 'https://api.appstoreconnect.apple.com/v1';
const signingDir = process.env.SIGNING_DIR;
const importDir = path.join(signingDir, 'import');
await mkdir(importDir, { recursive: true, mode: 0o700 });

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function createAppleJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: process.env.ASC_ISSUER_ID,
    iat: now,
    exp: now + 15 * 60,
    aud: 'appstoreconnect-v1',
  }));
  const unsigned = `${header}.${payload}`;
  let privateKey;
  try {
    let pem = readFileSync(process.env.ASC_KEY_PATH, 'utf8').replace(/^\uFEFF/, '').trim();
    if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
      pem = pem.slice(1, -1);
    }
    pem = pem.replace(/\\r?\\n/g, '\n');
    privateKey = createPrivateKey(pem);
  } catch {
    throw new Error('EXPO_ASC_API_KEY_P8 is not a readable App Store Connect API private key. Upload the downloaded AuthKey_*.p8 contents (the PEM private key), not an APNs push key, certificate, or key ID.');
  }
  const signature = cryptoSign('sha256', Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${unsigned}.${base64url(signature)}`;
}

const jwt = createAppleJwt();

async function appleRequest(endpoint, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Apple API returned HTTP ${response.status} with a non-JSON response.`);
  }
  if (!response.ok) {
    const messages = (result.errors ?? []).map(error => error.detail ?? error.title ?? 'Apple API error');
    throw new Error(`Apple API request failed with HTTP ${response.status}: ${messages.join('; ') || 'No error details provided.'}`);
  }
  return result;
}

const bundleQuery = new URLSearchParams({ 'filter[identifier]': process.env.BUNDLE_ID });
const bundles = await appleRequest(`/bundleIds?${bundleQuery}`);
const bundleMatches = bundles.data ?? [];
if (bundleMatches.length !== 1) {
  throw new Error(`Expected exactly one Apple Bundle ID for ${process.env.BUNDLE_ID}; found ${bundleMatches.length}. Create/confirm the explicit App ID first.`);
}
const bundleId = bundleMatches[0].id;

const certQuery = new URLSearchParams({ 'filter[certificateType]': 'IOS_DISTRIBUTION' });
const listCertificates = async () => {
  const response = await appleRequest(`/certificates?${certQuery}`);
  return response.data ?? [];
};
let certificates = await listCertificates();
if (process.env.AUDIT_CERTIFICATE_SERIAL) {
  const auditSerial = process.env.AUDIT_CERTIFICATE_SERIAL.trim().toUpperCase();
  if (!/^[0-9A-F]{8,64}$/.test(auditSerial)) throw new Error('Enter a valid certificate serial number.');
  const serial = auditSerial.replace(/^0+/, '');
  const match = certificates.find(cert =>
    String(cert.attributes?.serialNumber ?? '').toUpperCase().replace(/^0+/, '') === serial);
  console.log(`Apple lists ${certificates.length} iOS distribution certificates for this team.`);
  console.log(match
    ? `The specified certificate is listed. Name: ${match.attributes?.name ?? 'unnamed'}; expiration: ${match.attributes?.expirationDate}.`
    : 'Apple does not list the specified certificate for this team.');
  for (const cert of certificates) {
    console.log(`Certificate: ${cert.attributes?.name ?? 'unnamed'}; expires ${cert.attributes?.expirationDate}; serial ${cert.attributes?.serialNumber ?? 'unavailable'}; id ${cert.id}.`);
  }
  const profilesQuery = new URLSearchParams({
    include: 'bundleId,certificates',
    limit: '200',
  });
  const profilesResponse = await appleRequest(`/profiles?${profilesQuery}`);
  const certificateNames = new Map(certificates.map(cert => [cert.id, cert.attributes?.name ?? 'unnamed']));
  const certificateSerials = new Map(certificates.map(cert => [cert.id, cert.attributes?.serialNumber ?? 'unavailable']));
  const profileIncludes = new Map((profilesResponse.included ?? []).map(resource => [resource.id, resource]));
  for (const profile of profilesResponse.data ?? []) {
    const linkedCerts = profile.relationships?.certificates?.data ?? [];
    if (!linkedCerts.length) continue;
    const appId = profile.relationships?.bundleId?.data?.id;
    const appName = profileIncludes.get(appId)?.attributes?.identifier ?? 'unknown app';
    const linked = linkedCerts.map(cert => {
      const included = profileIncludes.get(cert.id);
      const name = included?.attributes?.name ?? certificateNames.get(cert.id) ?? cert.id;
      const serial = included?.attributes?.serialNumber ?? certificateSerials.get(cert.id) ?? 'unavailable';
      return `${name} (serial ${serial})`;
    }).join(', ');
    console.log(`Provisioning profile: ${profile.attributes?.name ?? 'unnamed'}; type ${profile.attributes?.profileType ?? 'unknown'}; app ${appName}; expires ${profile.attributes?.expirationDate}; certificates ${linked}.`);
  }
  process.exit(0);
}
if (process.env.REVOKE_ALL_DISTRIBUTION_CERTIFICATES === 'true') {
  if (process.env.REVOKE_CERTIFICATE_SERIAL) throw new Error('Choose either one serial or revoke-all, not both.');
  console.log(`Owner approved revoking all ${certificates.length} iOS distribution certificates.`);
  for (const cert of certificates) {
    console.log(`Revoking ${cert.attributes?.name ?? 'unnamed'} (serial ${cert.attributes?.serialNumber ?? 'unavailable'}, expires ${cert.attributes?.expirationDate}).`);
    await appleRequest(`/certificates/${encodeURIComponent(cert.id)}`, { method: 'DELETE' });
  }
  certificates = await listCertificates();
  if (certificates.length) throw new Error(`Apple still lists ${certificates.length} distribution certificate(s) after revocation; no replacement was created.`);
  console.log('Apple confirmed all distribution certificates are revoked; creating one fresh certificate.');
}
if (process.env.REVOKE_CERTIFICATE_SERIAL) {
  const approvedSerial = process.env.REVOKE_CERTIFICATE_SERIAL.trim().toUpperCase();
  if (!/^[0-9A-F]{8,64}$/.test(approvedSerial)) throw new Error('Enter a valid certificate serial number to revoke.');
  const normalized = approvedSerial.replace(/^0+/, '');
  const target = certificates.find(cert =>
    String(cert.attributes?.serialNumber ?? '').toUpperCase().replace(/^0+/, '') === normalized);
  if (!target) throw new Error('The approved certificate serial is not present in Apple\'s current inventory; nothing was revoked.');
  console.log(`Revoking the specifically approved certificate serial ${approvedSerial}.`);
  await appleRequest(`/certificates/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
  certificates = await listCertificates();
  if (certificates.some(cert => String(cert.attributes?.serialNumber ?? '').toUpperCase().replace(/^0+/, '') === normalized)) {
    throw new Error('Apple still lists the approved certificate after revocation; no replacement was created.');
  }
  if (certificates.length >= 3) {
    throw new Error('The approved certificate was revoked, but Apple still reports three distribution certificates. A replacement was not created.');
  }
  console.log(`Apple confirmed revocation. ${certificates.length} iOS distribution certificates remain; proceeding to create the replacement.`);
}
const certificateName = `Detail GitHub App Store Signing ${process.env.GITHUB_RUN_ID ?? 'GHA'}`;
if (certificates.some(cert => JSON.stringify(cert.attributes ?? {}).includes(certificateName))) {
  throw new Error(`The signing certificate for run ${process.env.GITHUB_RUN_ID ?? 'GHA'} already exists. Do not create another for this run.`);
}
if (certificates.length >= 3) {
  throw new Error('Apple reports three iOS distribution certificates already exist. No new certificate was created; an authorized Apple user must identify a reusable certificate or revoke one that is confirmed unused.');
}

const privateKeyPath = path.join(signingDir, 'distribution-private-key.pem');
const csrPath = path.join(signingDir, 'distribution.csr');
execFileSync('openssl', ['genrsa', '-out', privateKeyPath, '2048'], { stdio: 'ignore' });
execFileSync('openssl', ['req', '-new', '-key', privateKeyPath, '-out', csrPath, '-subj', `/CN=${certificateName}`], { stdio: 'ignore' });
const csrContent = await readFile(csrPath, 'utf8');

const certResponse = await appleRequest('/certificates', {
  method: 'POST',
  body: {
    data: {
      type: 'certificates',
      attributes: { certificateType: 'IOS_DISTRIBUTION', csrContent },
    },
  },
});
const certificate = certResponse.data;
const certContent = certificate?.attributes?.certificateContent;
if (!certificate?.id || !certContent) {
  throw new Error('Apple created no downloadable iOS distribution certificate.');
}
const certificateDerPath = path.join(signingDir, 'distribution.cer');
const certificatePemPath = path.join(signingDir, 'distribution.pem');
await writeFile(certificateDerPath, Buffer.from(certContent, 'base64'), { mode: 0o600 });
execFileSync('openssl', ['x509', '-inform', 'DER', '-in', certificateDerPath, '-out', certificatePemPath], { stdio: 'ignore' });
const certificateSubject = execFileSync('openssl', ['x509', '-in', certificatePemPath, '-noout', '-subject'], { encoding: 'utf8' });
if (!certificateSubject.includes(process.env.APPLE_TEAM_ID)) {
  throw new Error('The Apple API key created a certificate for a different team than EXPO_APPLE_TEAM_ID. No profile or build was created.');
}

const p12Path = path.join(signingDir, 'distribution.p12');
const p12Password = execFileSync('openssl', ['rand', '-hex', '32'], { encoding: 'utf8' }).trim();
execFileSync('openssl', [
  'pkcs12', '-export', '-inkey', privateKeyPath, '-in', certificatePemPath,
  '-out', p12Path, '-passout', `pass:${p12Password}`,
], { stdio: 'ignore' });

const profileName = `Detail App Store ${new Date().toISOString().slice(0, 10)} ${process.env.GITHUB_RUN_ID ?? 'GHA'}`;
const profileResponse = await appleRequest('/profiles', {
  method: 'POST',
  body: {
    data: {
      type: 'profiles',
      attributes: { name: profileName, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundleId } },
        certificates: { data: [{ type: 'certificates', id: certificate.id }] },
      },
    },
  },
});
const profileContent = profileResponse.data?.attributes?.profileContent;
if (!profileResponse.data?.id || !profileContent) {
  throw new Error('Apple created no downloadable App Store provisioning profile.');
}
const profilePath = path.join(signingDir, 'profile.mobileprovision');
await writeFile(profilePath, Buffer.from(profileContent, 'base64'), { mode: 0o600 });

await writeFile(path.join(importDir, 'distribution.p12'), await readFile(p12Path), { mode: 0o600 });
await writeFile(path.join(importDir, 'profile.mobileprovision'), await readFile(profilePath), { mode: 0o600 });
await writeFile(path.join(importDir, 'p12-password.txt'), `${p12Password}\n`, { mode: 0o600 });
await writeFile(path.join(importDir, 'IMPORT-TO-EXPO.txt'), [
  'Detail iOS signing credentials',
  `Bundle ID: ${process.env.BUNDLE_ID}`,
  `Certificate: ${certificateName}`,
  `Provisioning profile: ${profileName}`,
  'The .p12 has a generated export password. Use the value in p12-password.txt when importing it.',
  'These files are signing secrets. Import them into Expo promptly, then delete the downloaded artifact.',
].join('\n') + '\n', { mode: 0o600 });

console.log('Apple created the App Store distribution certificate and matching profile.');
console.log(`Bundle ID verified: ${process.env.BUNDLE_ID}`);
console.log('Short-lived import artifact prepared; no private key, CSR, or API key was included in it.');
