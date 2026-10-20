import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'detail-rules-test';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/customer-1'), { uid: 'customer-1', role: 'CUSTOMER', balance: 0 });
    await setDoc(doc(db, 'users/cleaner-1'), { uid: 'cleaner-1', role: 'CLEANER', verificationStatus: 'VERIFIED', cleanerAgreementAccepted: true });
    await setDoc(doc(db, 'users/cleaner-2'), { uid: 'cleaner-2', role: 'CLEANER', verificationStatus: 'PENDING' });
    await setDoc(doc(db, 'jobs/job-1'), { customerId: 'customer-1', cleanerId: null, status: 'PENDING', customerUnread: 0, cleanerUnread: 0 });
    await setDoc(doc(db, 'jobs/job-2'), { customerId: 'customer-1', cleanerId: 'cleaner-1', status: 'ASSIGNED', customerUnread: 0, cleanerUnread: 0 });
    await setDoc(doc(db, 'openJobs/job-1'), { status: 'PENDING', serviceType: 'House clean' });
    await setDoc(doc(db, 'bids/bid-1'), { jobId: 'job-1', cleanerId: 'cleaner-1' });
  });
});

after(async () => { await env?.cleanup(); });

test('users can read their private profile but cannot access another profile or change trust and money fields', async () => {
  const customer = env.authenticatedContext('customer-1').firestore();
  const stranger = env.authenticatedContext('cleaner-2').firestore();
  await assertSucceeds(getDoc(doc(customer, 'users/customer-1')));
  await assertFails(getDoc(doc(stranger, 'users/customer-1')));
  await assertFails(updateDoc(doc(customer, 'users/customer-1'), { balance: 100 }));
  await assertFails(updateDoc(doc(customer, 'users/customer-1'), { role: 'ADMIN' }));
  await assertSucceeds(updateDoc(doc(customer, 'users/customer-1'), { displayName: 'A Customer' }));
});

test('only the customer and assigned cleaner can read private bookings; approved cleaners only read the sanitized feed', async () => {
  const cleaner = env.authenticatedContext('cleaner-1').firestore();
  const unverified = env.authenticatedContext('cleaner-2').firestore();
  const customer = env.authenticatedContext('customer-1').firestore();
  await assertSucceeds(getDoc(doc(customer, 'jobs/job-1')));
  await assertFails(getDoc(doc(cleaner, 'jobs/job-1')));
  await assertSucceeds(getDoc(doc(cleaner, 'jobs/job-2')));
  await assertSucceeds(getDoc(doc(cleaner, 'openJobs/job-1')));
  await assertFails(getDoc(doc(unverified, 'openJobs/job-1')));
});

test('bids are visible only to the bidder and the customer who owns the booking', async () => {
  const cleaner = env.authenticatedContext('cleaner-1').firestore();
  const customer = env.authenticatedContext('customer-1').firestore();
  const stranger = env.authenticatedContext('cleaner-2').firestore();
  await assertSucceeds(getDoc(doc(cleaner, 'bids/bid-1')));
  await assertSucceeds(getDoc(doc(customer, 'bids/bid-1')));
  await assertFails(getDoc(doc(stranger, 'bids/bid-1')));
});
