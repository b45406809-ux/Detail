import test from 'node:test';
import assert from 'node:assert/strict';
import { assertIsolatedBackend, fixtureDefinitions } from '../scripts/qa_fixture_pool.mjs';

const production = 'https://production-project.supabase.co';

test('refuses fixture writes to the production project', () => {
  assert.throws(() => assertIsolatedBackend({ testUrl: production, realUrl: production, kind: 'staging' }), /blocked because the test backend is the production project/);
});

test('refuses the production host even if a path differs', () => {
  assert.throws(() => assertIsolatedBackend({ testUrl: `${production}/different-path`, realUrl: production, kind: 'staging' }), /production project/);
});

test('allows an explicitly selected, separate Supabase staging project', () => {
  assert.equal(assertIsolatedBackend({ testUrl: 'https://qa-project.supabase.co', realUrl: production, kind: 'staging' }), true);
});

test('allows only an explicitly enabled loopback backend for local fixtures', () => {
  assert.equal(assertIsolatedBackend({ testUrl: 'http://127.0.0.1:54321', realUrl: production, kind: 'local', allowLocal: true }), true);
  assert.throws(() => assertIsolatedBackend({ testUrl: 'http://127.0.0.1:54321', realUrl: production, kind: 'local', allowLocal: false }), /QA_ALLOW_LOCAL=true/);
});

test('fixture pool has six customers, four cleaner verification candidates, one unverified cleaner, and two distinct admins', () => {
  assert.equal(fixtureDefinitions.filter(user => user.role === 'CUSTOMER').length, 6);
  assert.equal(fixtureDefinitions.filter(user => user.role === 'CLEANER' && user.verificationScenario === 'sandbox-verification-required').length, 4);
  assert.equal(fixtureDefinitions.filter(user => user.role === 'CLEANER' && user.verificationScenario === 'unverified').length, 1);
  const admins = fixtureDefinitions.filter(user => user.role === 'ADMIN');
  assert.equal(admins.length, 2);
  assert.notDeepEqual(admins[0].permissions, admins[1].permissions);
  assert.ok(fixtureDefinitions.find(user => user.key === 'customer06').displayName.length > 50);
  assert.ok(fixtureDefinitions.filter(user => user.role === 'CLEANER').every(user => user.displayName.startsWith('QA ')));
});
