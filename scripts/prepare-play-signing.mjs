import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

// Fetch only the existing Android signing key into the runner's temporary directory.
// The response and credential values must never be logged or stored as artifacts.
const token = process.env.EXPO_TOKEN;
const temp = process.env.RUNNER_TEMP;
if (!token || !temp) throw new Error('Expo access or runner temporary directory is missing.');
const appConfig = JSON.parse(await readFile(resolve('mobile/app.json'), 'utf8'));
const applicationIdentifier = appConfig.expo?.android?.package;
if (!applicationIdentifier) throw new Error('Android package identifier is missing from mobile/app.json.');
async function readCredentials(fields) {
  const query = `query { app { byFullName(fullName: "@detail-test/detail") { androidAppCredentials(filter: { applicationIdentifier: "${applicationIdentifier}" }) { ${fields} } } } }`;
  const response = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Expo credential request failed with HTTP ${response.status}.`);
  const result = await response.json();
  if (result.errors) throw new Error('Expo did not provide the requested Android credentials.');
  return result.data?.app?.byFullName?.androidAppCredentials ?? [];
}
const push = await readCredentials('googleServiceAccountKeyForFcmV1 { id }');
if (!push.some(item => item.googleServiceAccountKeyForFcmV1)) throw new Error('Expo FCM V1 credentials must be configured before building the push-enabled test bundle.');
const credentials = await readCredentials('androidAppBuildCredentialsList { isDefault androidKeystore { keystore keystorePassword keyAlias keyPassword } }');
const keystore = credentials.flatMap(item => item.androidAppBuildCredentialsList ?? [])
  .find(item => item.isDefault && item.androidKeystore)?.androidKeystore;
if (!keystore?.keystore || !keystore.keystorePassword || !keystore.keyAlias) throw new Error('Default Android signing credential is incomplete.');
const dir = join(temp, 'detail-play-signing');
await mkdir(dir, { mode: 0o700, recursive: true });
await writeFile(join(dir, 'upload.jks'), Buffer.from(keystore.keystore, 'base64'), { mode: 0o600 });
await writeFile(join(dir, 'signing.json'), JSON.stringify({
  storePassword: keystore.keystorePassword,
  keyAlias: keystore.keyAlias,
  keyPassword: keystore.keyPassword ?? keystore.keystorePassword,
}), { mode: 0o600 });
console.log('Existing Android signing key prepared in the runner temporary directory.');
