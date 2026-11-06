import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('../mobile/app.config.js', import.meta.url));
const base = {
  PATH: process.env.PATH,
  EXPO_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGci.eyJwcm9kdWN0aW9u.signature',
  EXPO_PUBLIC_APP_BUILD_PROFILE: 'staging',
  EXPO_PUBLIC_USE_STAGING_AUTH: 'true',
  EXPO_PUBLIC_STAGING_SUPABASE_URL: 'https://staging-project.supabase.co',
  EXPO_PUBLIC_STAGING_SUPABASE_ANON_KEY: 'eyJhbGci.eyJzdGFnaW5n.signature',
};

function run(overrides = {}) {
  return spawnSync(process.execPath, [configPath], {
    encoding: 'utf8',
    env: { ...base, ...overrides },
  });
}

test('staging profile accepts a distinct, explicitly configured backend', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});

test('staging profile fails closed when staging auth is not enabled', () => {
  const result = run({ EXPO_PUBLIC_USE_STAGING_AUTH: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must enable EXPO_PUBLIC_USE_STAGING_AUTH/);
});

test('staging profile fails closed when the backend is the production project', () => {
  const result = run({ EXPO_PUBLIC_STAGING_SUPABASE_URL: base.EXPO_PUBLIC_SUPABASE_URL });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /separate from the production URL/);
});

test('staging profile fails closed when public staging credentials are missing', () => {
  const result = run({ EXPO_PUBLIC_STAGING_SUPABASE_ANON_KEY: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require EXPO_PUBLIC_STAGING_SUPABASE_URL and EXPO_PUBLIC_STAGING_SUPABASE_ANON_KEY/);
});

test('production profile fails closed if staging auth is enabled', () => {
  const result = run({
    EXPO_PUBLIC_APP_BUILD_PROFILE: 'production',
    EAS_BUILD_PROFILE: 'production',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot enable staging auth/);
});
