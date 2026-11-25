import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const token = process.env.EXPO_TOKEN;
const signingDir = process.env.SIGNING_DIR;
const ascKeyId = process.env.EXPO_ASC_KEY_ID;
const ascIssuerId = process.env.EXPO_ASC_ISSUER_ID;
const ascPrivateKey = process.env.ASC_API_KEY_P8;
if (!token || !signingDir || !ascKeyId || !ascIssuerId || !ascPrivateKey) {
  throw new Error('Expo access, Apple API access, or the runner signing directory is missing.');
}

const { expo } = JSON.parse(await readFile('mobile/app.json', 'utf8'));
const bundleId = expo.ios.bundleIdentifier;
const project = `@${expo.owner}/${expo.slug}`;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function appleToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: ascKeyId, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: ascIssuerId, iat: now, exp: now + 5 * 60, aud: 'appstoreconnect-v1' }));
  const unsigned = `${header}.${payload}`;
  const signature = cryptoSign('sha256', Buffer.from(unsigned), {
    key: createPrivateKey(ascPrivateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return `${unsigned}.${base64url(signature)}`;
}

const appleResponse = await fetch('https://api.appstoreconnect.apple.com/v1/certificates?filter%5BcertificateType%5D=IOS_DISTRIBUTION', {
  headers: { authorization: `Bearer ${appleToken()}`, accept: 'application/json' },
  signal: AbortSignal.timeout(20000),
});
if (!appleResponse.ok) throw new Error(`Apple certificate inventory lookup failed (HTTP ${appleResponse.status}).`);
const appleData = await appleResponse.json();
const activeSerials = new Set((appleData.data ?? []).map(cert =>
  String(cert.attributes?.serialNumber ?? '').toUpperCase().replace(/^0+/, ''),
));

const query = `query ReleaseSigning($project: String!) {
  app {
    byFullName(fullName: $project) {
      iosAppCredentials {
        appleAppIdentifier { bundleIdentifier }
        iosAppBuildCredentialsList(filter: { iosDistributionType: APP_STORE }) {
          distributionCertificate { certificateP12 certificatePassword validityNotAfter }
          provisioningProfile { provisioningProfile expiration }
        }
      }
    }
  }
}`;
const response = await fetch('https://api.expo.dev/graphql', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query, variables: { project } }),
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) throw new Error(`Expo app signing lookup failed (HTTP ${response.status}).`);
const result = await response.json();
if (result.errors) throw new Error('Expo did not provide the requested iOS signing credentials.');

const matchingApps = result.data?.app?.byFullName?.iosAppCredentials?.filter(
  app => app.appleAppIdentifier?.bundleIdentifier === bundleId,
) ?? [];
const now = Date.now();
const validCandidates = matchingApps.flatMap(app => app.iosAppBuildCredentialsList ?? []).filter(
  ({ distributionCertificate, provisioningProfile }) =>
    distributionCertificate?.certificateP12 && distributionCertificate.certificatePassword &&
    Date.parse(distributionCertificate.validityNotAfter) > now &&
    provisioningProfile?.provisioningProfile && Date.parse(provisioningProfile.expiration) > now,
);

await mkdir(signingDir, { mode: 0o700, recursive: true });
let selected;
const observedSerials = [];
for (let index = 0; index < validCandidates.length; index += 1) {
  const candidate = validCandidates[index];
  const candidateDir = join(signingDir, `candidate-${index}`);
  await mkdir(candidateDir, { mode: 0o700, recursive: true });
  const p12Path = join(candidateDir, 'candidate.p12');
  const certPath = join(candidateDir, 'candidate.pem');
  const profilePath = join(candidateDir, 'candidate.mobileprovision');
  const profilePlistPath = join(candidateDir, 'profile.plist');
  await writeFile(p12Path, Buffer.from(candidate.distributionCertificate.certificateP12, 'base64'), { mode: 0o600 });
  await writeFile(profilePath, Buffer.from(candidate.provisioningProfile.provisioningProfile, 'base64'), { mode: 0o600 });
  try {
    execFileSync('openssl', [
      'pkcs12', '-provider', 'default', '-provider', 'legacy', '-in', p12Path,
      '-passin', `pass:${candidate.distributionCertificate.certificatePassword}`,
      '-clcerts', '-nokeys', '-out', certPath,
    ], { stdio: 'ignore' });
    const serialOutput = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-serial'], { encoding: 'utf8' });
    const serial = serialOutput.trim().split('=').at(-1).toUpperCase().replace(/^0+/, '');
    observedSerials.push(serial);
    execFileSync('security', ['cms', '-D', '-i', profilePath, '-o', profilePlistPath], { stdio: 'ignore' });
    const profileCertificates = JSON.parse(execFileSync('python3', ['-c', [
      'import json, plistlib, subprocess, sys, tempfile, pathlib',
      'p=plistlib.loads(pathlib.Path(sys.argv[1]).read_bytes())',
      'out=[]',
      'for cert in p.get("DeveloperCertificates", []):',
      ' f=tempfile.NamedTemporaryFile(delete=False); f.write(cert); f.close()',
      ' s=subprocess.check_output(["openssl","x509","-inform","DER","-in",f.name,"-noout","-serial"],text=True).strip().split("=")[-1].upper().lstrip("0")',
      ' out.append(s)',
      'print(json.dumps(out))',
    ].join('\n'), profilePlistPath], { encoding: 'utf8' }));
    if (activeSerials.has(serial) && profileCertificates.includes(serial)) {
      selected = { candidate, p12Path, profilePath };
      break;
    }
  } catch {
    // Keep scanning saved credentials; never print certificate or profile contents.
  }
}

if (!selected) {
  const available = [...new Set(observedSerials)];
  throw new Error(available.length
    ? `Expo has no current signing profile whose certificate is still active with Apple (saved serials: ${available.join(', ')}). A fresh active certificate and profile must be imported into Expo.`
    : 'Expo has no readable current App Store signing certificate and profile for this bundle.');
}

await writeFile(join(signingDir, 'distribution.p12'), await readFile(selected.p12Path), { mode: 0o600 });
await writeFile(join(signingDir, 'p12-password.txt'), selected.candidate.distributionCertificate.certificatePassword, { mode: 0o600 });
await writeFile(join(signingDir, 'profile.mobileprovision'), await readFile(selected.profilePath), { mode: 0o600 });
const selectedCertPath = join(signingDir, 'selected-cert.pem');
execFileSync('openssl', [
  'pkcs12', '-provider', 'default', '-provider', 'legacy', '-in', join(signingDir, 'distribution.p12'),
  '-passin', `file:${join(signingDir, 'p12-password.txt')}`, '-clcerts', '-nokeys', '-out', selectedCertPath,
], { stdio: 'ignore' });
const selectedSerial = execFileSync('openssl', ['x509', '-in', selectedCertPath, '-noout', '-serial'], { encoding: 'utf8' }).trim();
console.log(`Selected an Expo App Store profile matched to an active Apple certificate (${selectedSerial}).`);
