import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMediaInBackground } from '../mobile/services/deferredMedia.ts';

test('slow image signing does not block account data and stale results are discarded', async () => {
  const profile = { role: 'CUSTOMER', photoURL: 'detail-media/profile-photos/user/avatar.jpg' };
  let finishSigning;
  const pending = new Promise(resolve => { finishSigning = resolve; });
  let current = true;
  const applied = [];
  const work = resolveMediaInBackground(profile, () => pending, () => current, result => applied.push(result), () => assert.fail('unexpected error'));
  assert.equal(profile.role, 'CUSTOMER');
  assert.deepEqual(applied, []);
  current = false; // The user signed out or a newer profile arrived.
  finishSigning({ ...profile, photoURL: 'https://example.test/signed' });
  await work;
  assert.deepEqual(applied, []);
});

test('image signing failures leave account data usable', async () => {
  let failed = false;
  await resolveMediaInBackground({ photoURL: 'detail-media/profile-photos/user/avatar.jpg' },
    async () => { throw new Error('storage unavailable'); }, () => true,
    () => assert.fail('failed signing must not apply'), () => { failed = true; });
  assert.equal(failed, true);
});

test('a current profile receives its signed image after loading', async () => {
  const profile = { photoURL: 'detail-media/profile-photos/user/avatar.jpg' };
  const signed = { photoURL: 'https://example.test/signed' };
  let applied;
  await resolveMediaInBackground(profile, async () => signed, () => true,
    (result, original) => { applied = { result, original }; }, () => assert.fail('unexpected error'));
  assert.equal(applied.original, profile);
  assert.equal(applied.result, signed);
});
