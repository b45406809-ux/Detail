import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const token = process.env.EXPO_TOKEN;
const signingDir = process.env.SIGNING_DIR;
if (!token || !signingDir) throw new Error('Expo access or the runner signing directory is missing.');

const { expo } = JSON.parse(await readFile('mobile/app.json', 'utf8'));
const bundleId = expo.ios.bundleIdentifier;
const project = `@${expo.owner}/${expo.slug}`;
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

const matchingApp = result.data?.app?.byFullName?.iosAppCredentials?.find(
  app => app.appleAppIdentifier?.bundleIdentifier === bundleId,
);
const now = Date.now();
const signing = matchingApp?.iosAppBuildCredentialsList?.find(({ distributionCertificate, provisioningProfile }) =>
  distributionCertificate?.certificateP12 && distributionCertificate.certificatePassword &&
  Date.parse(distributionCertificate.validityNotAfter) > now &&
  provisioningProfile?.provisioningProfile && Date.parse(provisioningProfile.expiration) > now
);
if (!signing) throw new Error('Expo has no current App Store signing certificate and profile for this bundle.');

await mkdir(signingDir, { mode: 0o700, recursive: true });
await writeFile(join(signingDir, 'distribution.p12'), Buffer.from(signing.distributionCertificate.certificateP12, 'base64'), { mode: 0o600 });
await writeFile(join(signingDir, 'p12-password.txt'), signing.distributionCertificate.certificatePassword, { mode: 0o600 });
await writeFile(join(signingDir, 'profile.mobileprovision'), Buffer.from(signing.provisioningProfile.provisioningProfile, 'base64'), { mode: 0o600 });
console.log('Existing Expo signing credentials prepared for the GitHub Mac runner.');
