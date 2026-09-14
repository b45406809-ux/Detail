/**
 * Detail — Cloud Functions
 *
 * These functions move every privileged / cross-user write off the client and
 * onto the server, where the Admin SDK bypasses Firestore security rules. This
 * lets us lock the rules down to "users can only write their own document" while
 * still allowing money to move between a customer and a cleaner.
 *
 *   settleJobPayment   — atomically debit customer, credit cleaner, write ledger
 *   submitRating       — write a review + recompute the cleaner's rating average
 *   createPesePayPayment — start a PesePay hosted checkout for a wallet top-up
 *   pesepayWebhook     — PesePay calls this when a payment completes; credits wallet
 *
 * Deploy:  firebase deploy --only functions
 * Secrets: firebase functions:secrets:set PESEPAY_INTEGRATION_KEY
 *          firebase functions:secrets:set PESEPAY_ENCRYPTION_KEY
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// Platform keeps this share of every job; the cleaner receives the rest.
// Per the Cleaner Agreement §10: standard commission is 10%, and Detail
// reserves the right to change it — this constant is the single source of
// truth for that rate across settlement, cash-commission debits, and bids.
const PLATFORM_COMMISSION = 0.1;

const PESEPAY_INTEGRATION_KEY = defineSecret('PESEPAY_INTEGRATION_KEY');
const PESEPAY_ENCRYPTION_KEY = defineSecret('PESEPAY_ENCRYPTION_KEY');

const round2 = (n: number) => Math.round(n * 100) / 100;

type BookingState = 'PENDING' | 'CONFIRMED' | 'ASSIGNED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
const BOOKING_TRANSITIONS: Readonly<Record<BookingState, readonly BookingState[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], CANCELLED: [],
};
function assertTransition(previous: BookingState, next: BookingState) {
  if (!BOOKING_TRANSITIONS[previous]?.includes(next)) {
    throw new HttpsError('failed-precondition', `Invalid booking transition: ${previous} → ${next}.`);
  }
}
function eventRef(jobId: string, idempotencyKey: string) {
  return db.collection('jobs').doc(jobId).collection('events').doc(idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_'));
}
function writeEvent(tx: FirebaseFirestore.Transaction, jobId: string, input: {
  type: string; actorId: string; actorRole: string; previousState: BookingState | null;
  newState: BookingState; idempotencyKey: string; metadata?: Record<string, unknown>;
}) {
  tx.create(eventRef(jobId, input.idempotencyKey), { ...input, timestamp: FieldValue.serverTimestamp() });
}
function requireIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 128) {
    throw new HttpsError('invalid-argument', 'A unique idempotencyKey (8-128 characters) is required.');
  }
  return value.trim();
}


export const deleteAccount = onCall(async request => {
  const uid=request.auth?.uid; if(!uid)throw new HttpsError('unauthenticated','Sign in required.');
  const authTime=Number(request.auth?.token.auth_time??0)*1000;
  if(Date.now()-authTime>5*60*1000)throw new HttpsError('failed-precondition','RECENT_LOGIN_REQUIRED');
  if(request.data?.confirmation!=='DELETE')throw new HttpsError('invalid-argument','Type DELETE to confirm.');
  const [customerJobs,cleanerJobs]=await Promise.all([db.collection('jobs').where('customerId','==',uid).get(),db.collection('jobs').where('cleanerId','==',uid).get()]);
  const all=new Map([...customerJobs.docs,...cleanerJobs.docs].map(d=>[d.id,d]));
  const unresolved=[...all.values()].filter(d=>!['COMPLETED','CANCELLED'].includes(d.data().status)||['PENDING','FAILED'].includes(d.data().paymentStatus));
  if(unresolved.length)throw new HttpsError('failed-precondition','ACTIVE_BOOKINGS_OR_PAYMENTS',{jobIds:unresolved.map(d=>d.id)});
  const batch=db.batch(); const deletedLabel='Deleted user';
  for(const snap of all.values()){const job=snap.data();batch.update(snap.ref,uid===job.customerId?{customerId:`deleted_${uid.slice(0,8)}`,customerName:deletedLabel,customerPhoto:FieldValue.delete(),description:FieldValue.delete()}:{cleanerId:`deleted_${uid.slice(0,8)}`,cleanerName:deletedLabel,cleanerPhoto:FieldValue.delete()});}
  for(const collectionName of ['favorites','notifications']){const docs=await db.collection(collectionName).where(collectionName==='favorites'?'customerId':'userId','==',uid).get();docs.forEach(d=>batch.delete(d.ref));}
  batch.delete(db.collection('users').doc(uid)); await batch.commit();
  await admin.auth().revokeRefreshTokens(uid); await admin.auth().deleteUser(uid);
  return {success:true};
});

/* ───────────────────────── notification helper ───────────────────────── */
/**
 * Writes an in-app notification doc and, if the recipient has registered an
 * Expo push token, fires a push through Expo's push gateway. Best-effort:
 * push failures are logged but never throw, so a bad/expired token can't
 * break the write that triggered it.
 */
async function notifyUser(
  userId: string,
  notification: { type: string; title: string; body: string; jobId?: string; imageUrl?: string }
) {
  await db.collection('notifications').add({
    userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    jobId: notification.jobId,
    imageUrl: notification.imageUrl,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    const userSnap = await db.collection('users').doc(userId).get();
    const token = userSnap.data()?.expoPushToken;
    if (!token || typeof token !== 'string' || !token.startsWith('ExponentPushToken')) return;

    const payload: Record<string, unknown> = {
      to: token,
      title: notification.title,
      body: notification.body,
      data: {
        jobId: notification.jobId ?? null,
        type: notification.type,
        imageUrl: notification.imageUrl ?? null,
      },
      sound: 'default',
      channelId: ['PAYMENT_FAILURE', 'REFUND'].includes(notification.type) ? 'urgent' : 'bookings',
    };

    // Rich push: attach the first job photo so cleaners can see the work at a glance
    if (notification.imageUrl) {
      // iOS notification extension — shows image thumbnail in the lock-screen preview
      payload.attachments = [{ url: notification.imageUrl }];
      // Android (FCM via Expo gateway) — image in the expanded notification
      payload.imageUrl = notification.imageUrl;
    }

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.warn('Expo push send failed', err);
  }
}

/* ───────────────────────── settleJobPayment ───────────────────────── */
/**
 * Called by the customer when a completed job is paid for.
 * Input:  { jobId: string, paymentMethod: 'WALLET' | 'CASH' }
 * Output: { success: true }
 *
 * WALLET: balance must cover the price; we debit the customer, credit the
 *         cleaner (price minus commission), and write two ledger entries.
 * CASH:   the customer hands cash to the cleaner; we only mark the job paid
 *         and bump the cleaner's completed-jobs count (no wallet movement).
 */
export const settleJobPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const { jobId, paymentMethod } = (request.data ?? {}) as {
    jobId?: string;
    paymentMethod?: 'WALLET' | 'CASH';
  };
  if (!jobId || (paymentMethod !== 'WALLET' && paymentMethod !== 'CASH')) {
    throw new HttpsError('invalid-argument', 'jobId and a valid paymentMethod are required.');
  }

  const jobRef = db.collection('jobs').doc(jobId);

  await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
    const job = jobSnap.data() as FirebaseFirestore.DocumentData;

    if (job.customerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the job customer can pay.');
    }
    if (job.paidAt) throw new HttpsError('failed-precondition', 'This job is already paid.');
    if (!job.cleanerId) throw new HttpsError('failed-precondition', 'No cleaner is assigned.');

    const price = Number(job.price);
    if (!price || price <= 0) {
      throw new HttpsError('failed-precondition', 'This job has no valid price.');
    }

    const customerRef = db.collection('users').doc(uid);
    const cleanerRef = db.collection('users').doc(job.cleanerId);
    const cleanerAmount = round2(price * (1 - PLATFORM_COMMISSION));

    if (paymentMethod === 'WALLET') {
      const customerSnap = await tx.get(customerRef);
      const balance = Number(customerSnap.data()?.balance ?? 0);
      if (balance < price) {
        throw new HttpsError(
          'failed-precondition',
          `Insufficient balance. You have $${balance.toFixed(2)} but need $${price.toFixed(2)}.`
        );
      }

      tx.update(customerRef, { balance: FieldValue.increment(-price) });
      tx.update(cleanerRef, {
        balance: FieldValue.increment(cleanerAmount),
        jobsCompleted: FieldValue.increment(1),
      });

      tx.set(db.collection('transactions').doc(), {
        userId: uid,
        type: 'DEBIT',
        amount: price,
        description: `Payment for ${job.serviceType}`,
        jobId,
        status: 'COMPLETED',
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.collection('transactions').doc(), {
        userId: job.cleanerId,
        type: 'CREDIT',
        amount: cleanerAmount,
        description: `Earnings from ${job.serviceType}`,
        jobId,
        status: 'COMPLETED',
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      // CASH — the cleaner keeps the full amount from the customer directly,
      // but Detail's commission is still owed (Cleaner Agreement §11: "A cash
      // payment does not remove your obligation to pay the applicable Detail
      // commission"). Debited from the cleaner's wallet balance immediately,
      // same day as the job — not batched into a weekly invoice — so it can
      // go negative; submitBid's balance gate then blocks new bids until
      // they top up, which is what actually prevents the "take cash all
      // week and vanish" risk described in the commission model.
      const commission = round2(price * PLATFORM_COMMISSION);
      tx.update(cleanerRef, {
        balance: FieldValue.increment(-commission),
        jobsCompleted: FieldValue.increment(1),
      });
      tx.set(db.collection('transactions').doc(), {
        userId: job.cleanerId,
        type: 'DEBIT',
        amount: commission,
        description: `Commission on cash job — ${job.serviceType}`,
        jobId,
        status: 'COMPLETED',
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    tx.update(jobRef, { paidAt: FieldValue.serverTimestamp(), paymentMethod });
  });

  return { success: true };
});

/* ───────────────────────── submitRating ───────────────────────── */
/**
 * Called by the customer to rate a completed job.
 * Input:  { jobId: string, rating: number (1-5) }
 * Output: { success: true }
 *
 * Writes a review document and recomputes the cleaner's running rating average
 * and count in a single transaction.
 */
export const submitRating = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const { jobId, rating, problemDescription, evidence = [] } = (request.data ?? {}) as { jobId?: string; rating?: number; problemDescription?: string; evidence?: string[] };
  if (!jobId || !rating || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'jobId and a rating between 1 and 5 are required.');
  }
  if (rating < 3 && !problemDescription?.trim()) throw new HttpsError('invalid-argument', 'A problem description is required below three stars.');

  const jobRef = db.collection('jobs').doc(jobId);

  await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
    const job = jobSnap.data() as FirebaseFirestore.DocumentData;

    if (job.customerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the job customer can rate.');
    }
    if (job.ratedAt) throw new HttpsError('failed-precondition', 'This job is already rated.');
    if (!job.cleanerId) throw new HttpsError('failed-precondition', 'No cleaner to rate.');

    const cleanerRef = db.collection('users').doc(job.cleanerId);
    const cleanerSnap = await tx.get(cleanerRef);
    const avg = Number(cleanerSnap.data()?.ratingAverage ?? 0);
    const count = Number(cleanerSnap.data()?.ratingCount ?? 0);
    const newCount = count + 1;
    const newAvg = round2((avg * count + rating) / newCount);

    tx.set(db.collection('reviews').doc(), {
      jobId,
      cleanerId: job.cleanerId,
      customerId: uid,
      customerName: job.customerName ?? 'Customer',
      rating,
      problemDescription: problemDescription?.trim() ?? null,
      evidence: Array.isArray(evidence) ? evidence.slice(0, 5) : [],
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(cleanerRef, { ratingAverage: newAvg, ratingCount: newCount });
    tx.update(jobRef, { rating, ratedAt: FieldValue.serverTimestamp() });
    if (rating < 3) tx.set(db.collection('reviewCases').doc(`rating_${jobId}`), { jobId, customerId: uid, cleanerId: job.cleanerId, rating, problemDescription: problemDescription!.trim(), evidence: Array.isArray(evidence) ? evidence.slice(0, 5) : [], status: 'ADMIN_REVIEW', createdAt: FieldValue.serverTimestamp() });
  });

  return { success: true };
});

/* ───────────────────────── reportJobIssue ───────────────────────── */
/**
 * Customer reports a completed job as poorly done (Customer/Cleaner
 * Agreement §12-15: a refund may be due; if the cleaner already took cash,
 * it's recovered from their balance). Just files the dispute for review —
 * resolveDispute is what actually applies a refund, since deciding whether
 * a report is legitimate needs a human look, not an automatic one.
 * Input:  { jobId: string, reason: string, evidencePhotos?: string[] }
 */
export const reportJobIssue = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const { jobId, reason, evidencePhotos } = (request.data ?? {}) as {
    jobId?: string;
    reason?: string;
    evidencePhotos?: string[];
  };
  if (!jobId || !reason?.trim()) {
    throw new HttpsError('invalid-argument', 'jobId and a reason are required.');
  }

  const jobSnap = await db.collection('jobs').doc(jobId).get();
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
  const job = jobSnap.data() as FirebaseFirestore.DocumentData;

  if (job.customerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the job customer can report an issue.');
  }
  if (job.status !== 'COMPLETED') {
    throw new HttpsError('failed-precondition', 'Only completed jobs can be reported.');
  }

  const disputeRef = await db.collection('disputes').add({
    jobId,
    customerId: uid,
    cleanerId: job.cleanerId ?? null,
    reason: reason.trim(),
    evidencePhotos: evidencePhotos ?? [],
    status: 'PENDING',
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, disputeId: disputeRef.id };
});

/* ───────────────────────── resolveDispute ───────────────────────── */
/**
 * Staff-invoked resolution for a reported job (no admin UI exists in this
 * codebase yet — called via the Firebase console or a future admin tool).
 * Applies a refund by crediting the customer and debiting the cleaner's
 * balance (can go negative, same recovery mechanism as the cash-commission
 * debit in settleJobPayment) per Cleaner Agreement §15.
 * Input:  { disputeId: string, refundAmount: number, resolution: string }
 */
export const resolveDispute = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const callerSnap = await db.collection('users').doc(uid).get();
  if (callerSnap.data()?.role !== 'ADMIN') {
    throw new HttpsError('permission-denied', 'Only Detail staff can resolve disputes.');
  }

  const { disputeId, refundAmount, resolution } = (request.data ?? {}) as {
    disputeId?: string;
    refundAmount?: number;
    resolution?: string;
  };
  if (!disputeId || refundAmount == null || refundAmount < 0) {
    throw new HttpsError('invalid-argument', 'disputeId and a non-negative refundAmount are required.');
  }

  const disputeRef = db.collection('disputes').doc(disputeId);

  await db.runTransaction(async (tx) => {
    const disputeSnap = await tx.get(disputeRef);
    if (!disputeSnap.exists) throw new HttpsError('not-found', 'Dispute not found.');
    const dispute = disputeSnap.data() as FirebaseFirestore.DocumentData;
    if (dispute.status !== 'PENDING') {
      throw new HttpsError('failed-precondition', 'This dispute has already been resolved.');
    }

    if (refundAmount > 0) {
      const amount = round2(refundAmount);
      tx.update(db.collection('users').doc(dispute.customerId), { balance: FieldValue.increment(amount) });
      tx.set(db.collection('transactions').doc(), {
        userId: dispute.customerId,
        type: 'CREDIT',
        amount,
        description: 'Refund for reported job',
        jobId: dispute.jobId,
        status: 'COMPLETED',
        createdAt: FieldValue.serverTimestamp(),
      });

      if (dispute.cleanerId) {
        tx.update(db.collection('users').doc(dispute.cleanerId), { balance: FieldValue.increment(-amount) });
        tx.set(db.collection('transactions').doc(), {
          userId: dispute.cleanerId,
          type: 'DEBIT',
          amount,
          description: 'Refund recovered — reported job',
          jobId: dispute.jobId,
          status: 'COMPLETED',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    tx.update(disputeRef, {
      status: 'RESOLVED',
      refundAmount: round2(refundAmount),
      resolution: resolution ?? null,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: uid,
    });
  });

  return { success: true };
});

/* ───────────────────────── acceptBid ───────────────────────── */
/**
 * Called by the customer to accept a cleaner's bid.
 * Input:  { jobId: string, bidId: string }
 * Output: { success: true }
 *
 * The server sets the job price authoritatively from the bid, so the customer
 * cannot tamper with the agreed amount. Verifies ownership and that the job is
 * still open for bidding.
 */
export const acceptBid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const { jobId, bidId, paymentMethod } = request.data ?? {};
  const idempotencyKey = requireIdempotencyKey(request.data?.idempotencyKey);
  if (!jobId || !bidId || !['WALLET', 'CASH'].includes(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'jobId, bidId, and a paymentMethod are required.');
  }
  const betaConfig = (await db.collection('configuration').doc('beta').get()).data() ?? {};
  if (betaConfig.maintenanceMode || betaConfig.disablePayments) throw new HttpsError('unavailable', 'PAYMENTS_DISABLED');
  const jobRef = db.collection('jobs').doc(jobId);
  const bidRef = db.collection('bids').doc(bidId);
  const bidsQuery = db.collection('bids').where('jobId', '==', jobId).where('status', 'in', ['PENDING', 'COUNTERED']);
  let cleanerId = ''; let cleanerName = ''; let amount = 0;
  await db.runTransaction(async tx => {
    const replay = await tx.get(eventRef(jobId, idempotencyKey));
    if (replay.exists) return;
    const [jobSnap, bidSnap, bids] = await Promise.all([tx.get(jobRef), tx.get(bidRef), tx.get(bidsQuery)]);
    if (!jobSnap.exists || !bidSnap.exists) throw new HttpsError('not-found', 'Job or bid not found.');
    const job = jobSnap.data()!; const bid = bidSnap.data()!;
    if (job.customerId !== uid) throw new HttpsError('permission-denied', 'Only the customer can accept a bid.');
    if (!['PENDING', 'CONFIRMED'].includes(job.status) || job.cleanerId) throw new HttpsError('failed-precondition', 'JOB_UNAVAILABLE');
    if (bid.jobId !== jobId || !['PENDING', 'COUNTERED'].includes(bid.status)) throw new HttpsError('failed-precondition', 'BID_UNAVAILABLE');
    amount = round2(Number(bid.bidPrice)); cleanerId = bid.cleanerId; cleanerName = bid.cleanerName ?? 'Cleaner';
    if (!(amount > 0)) throw new HttpsError('failed-precondition', 'INVALID_BID_AMOUNT');
    const customerRef = db.collection('users').doc(uid);
    const customer = await tx.get(customerRef);
    if (!customer.exists || (paymentMethod === 'WALLET' && Number(customer.data()?.balance ?? 0) < amount)) {
      tx.set(db.collection('paymentFailures').doc(idempotencyKey), { jobId, customerId: uid, amount, code: 'INSUFFICIENT_FUNDS', createdAt: FieldValue.serverTimestamp() });
      throw new HttpsError('failed-precondition', 'INSUFFICIENT_FUNDS', { code: 'INSUFFICIENT_FUNDS', amount, available: Number(customer.data()?.balance ?? 0) });
    }
    // Immediate wallet capture. Cash is recorded as a verified pay-on-completion method.
    if (paymentMethod === 'WALLET') tx.update(customerRef, { balance: FieldValue.increment(-amount) });
    const paymentRef = db.collection('payments').doc(`${jobId}_booking`);
    tx.create(paymentRef, { jobId, customerId: uid, cleanerId, amount, method: paymentMethod,
      status: paymentMethod === 'WALLET' ? 'CAPTURED' : 'AUTHORIZED', originalSource: paymentMethod,
      idempotencyKey, createdAt: FieldValue.serverTimestamp() });
    bids.docs.forEach(d => tx.update(d.ref, { status: d.id === bidId ? 'ACCEPTED' : 'REJECTED' }));
    const previous = job.status as BookingState;
    // Acceptance confirms and assigns atomically; event log retains both canonical steps.
    tx.update(jobRef, { status: 'ASSIGNED', cleanerId, cleanerName: bid.cleanerName ?? null,
      cleanerPhoto: bid.cleanerPhoto ?? null, cleanerRating: bid.cleanerRating ?? null, price: amount,
      paymentMethod, paymentStatus: paymentMethod === 'WALLET' ? 'CAPTURED' : 'AUTHORIZED', acceptedAt: FieldValue.serverTimestamp() });
    if (previous === 'PENDING') writeEvent(tx, jobId, { type: 'PAYMENT_CONFIRMED', actorId: uid, actorRole: 'CUSTOMER', previousState: 'PENDING', newState: 'CONFIRMED', idempotencyKey: `${idempotencyKey}_confirmed`, metadata: { paymentMethod, amount } });
    writeEvent(tx, jobId, { type: 'BID_ACCEPTED', actorId: uid, actorRole: 'CUSTOMER', previousState: 'CONFIRMED',
      newState: 'ASSIGNED', idempotencyKey, metadata: { bidId, paymentMethod, amount } });
  });
  if (cleanerId) await Promise.all([
    notifyUser(cleanerId, { type: 'BID_ACCEPTED', title: 'Quote accepted! 🎉', body: 'The customer accepted your quote.', jobId }),
    notifyUser(uid, { type: 'BID_ACCEPTED', title: 'Cleaner assigned', body: `${cleanerName} is assigned to your booking.`, jobId }),
  ]);
  return { success: true, state: 'ASSIGNED', payment: { status: paymentMethod === 'WALLET' ? 'CAPTURED' : 'AUTHORIZED', amount } };
});



export const getBetaConfig = onCall(async () => {
  const snap = await db.collection('configuration').doc('beta').get();
  return { maintenanceMode: false, disableNewBookings: false, disablePayments: false, contactUrl: 'https://wa.me/', ...(snap.data() ?? {}) };
});

export const createBooking = onCall(async request => {
  const uid=request.auth?.uid; if(!uid)throw new HttpsError('unauthenticated','Sign in required.');
  const config=(await db.collection('configuration').doc('beta').get()).data()??{};
  if(config.maintenanceMode||config.disableNewBookings) throw new HttpsError('unavailable','BOOKINGS_DISABLED',{contactUrl:config.contactUrl??'https://wa.me/'});
  const key=requireIdempotencyKey(request.data?.idempotencyKey); const ref=db.collection('jobs').doc(key.replace(/[^a-zA-Z0-9_-]/g,'_'));
  const allowed=request.data?.booking??{}; if(!allowed.serviceType||!allowed.location)throw new HttpsError('invalid-argument','Service and location are required.');
  await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(existing.exists)return;tx.create(ref,{...allowed,customerId:uid,status:'PENDING',createdAt:FieldValue.serverTimestamp()});writeEvent(tx,ref.id,{type:'CREATION',actorId:uid,actorRole:'CUSTOMER',previousState:null,newState:'PENDING',idempotencyKey:`created_${key}`});});
  return {success:true,jobId:ref.id};
});

/** The sole API for lifecycle changes; clients cannot write job.status. */
export const transitionBooking = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const { jobId, newState } = request.data ?? {};
  const key = requireIdempotencyKey(request.data?.idempotencyKey);
  if (!jobId || !BOOKING_TRANSITIONS[newState as BookingState]) throw new HttpsError('invalid-argument', 'Valid jobId and newState required.');
  let recipient = '';
  await db.runTransaction(async tx => {
    const ref = db.collection('jobs').doc(jobId); const [snap, replay] = await Promise.all([tx.get(ref), tx.get(eventRef(jobId, key))]);
    if (replay.exists) return;
    if (!snap.exists) throw new HttpsError('not-found', 'Job not found.');
    const job = snap.data()!; const previous = job.status as BookingState;
    assertTransition(previous, newState);
    const cleanerDriven = ['EN_ROUTE', 'IN_PROGRESS'].includes(newState);
    if ((cleanerDriven && job.cleanerId !== uid) || (!cleanerDriven && job.customerId !== uid)) throw new HttpsError('permission-denied', 'You cannot perform this transition.');
    tx.update(ref, { status: newState, [`${String(newState).toLowerCase()}At`]: FieldValue.serverTimestamp() });
    writeEvent(tx, jobId, { type: 'STATUS_TRANSITION', actorId: uid, actorRole: cleanerDriven ? 'CLEANER' : 'CUSTOMER', previousState: previous, newState, idempotencyKey: key });
    recipient = cleanerDriven ? job.customerId : job.cleanerId;
  });
  if (recipient) await notifyUser(recipient, { type: String(newState), title: `Booking ${String(newState).toLowerCase().replace('_', ' ')}`, body: 'Your booking has a new update.', jobId });
  return { success: true, state: newState };
});

export const cancelBooking = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const { jobId, reason } = request.data ?? {}; const key = requireIdempotencyKey(request.data?.idempotencyKey);
  if (!jobId || typeof reason !== 'string' || !reason.trim()) throw new HttpsError('invalid-argument', 'A cancellation reason is required.');
  let recipients: string[] = []; let refundStatus = 'NOT_REQUIRED'; let refundAmount = 0;
  await db.runTransaction(async tx => {
    const ref = db.collection('jobs').doc(jobId); const [snap, replay] = await Promise.all([tx.get(ref), tx.get(eventRef(jobId, key))]);
    if (replay.exists) return; if (!snap.exists) throw new HttpsError('not-found', 'Job not found.');
    const job = snap.data()!; if (![job.customerId, job.cleanerId].includes(uid)) throw new HttpsError('permission-denied', 'Not a booking participant.');
    assertTransition(job.status, 'CANCELLED');
    const late = ['EN_ROUTE', 'IN_PROGRESS'].includes(job.status); const captured = Number(job.payment?.capturedAmount ?? (job.paymentMethod === 'WALLET' ? job.price : 0));
    refundAmount = round2(captured * (late ? 0.5 : 1)); refundStatus = refundAmount ? 'REFUNDED' : 'NOT_REQUIRED';
    if (refundAmount) {
      tx.update(db.collection('users').doc(job.customerId), { balance: FieldValue.increment(refundAmount) });
      tx.set(db.collection('transactions').doc(`refund_${key}`), { userId: job.customerId, jobId, type: 'CREDIT', amount: refundAmount, status: 'COMPLETED', originalSource: job.paymentMethod, idempotencyKey: key, createdAt: FieldValue.serverTimestamp() });
    }
    tx.update(ref, { status: 'CANCELLED', cancellation: { reason: reason.trim(), actorId: uid, refundAmount, refundStatus }, payment: { ...(job.payment ?? {}), refundStatus, refundedAmount: refundAmount }, cancelledAt: FieldValue.serverTimestamp() });
    writeEvent(tx, jobId, { type: refundAmount ? 'REFUND' : 'CANCELLATION', actorId: uid, actorRole: uid === job.customerId ? 'CUSTOMER' : 'CLEANER', previousState: job.status, newState: 'CANCELLED', idempotencyKey: key, metadata: { refundAmount } });
    recipients = [job.customerId, job.cleanerId].filter(Boolean);
  });
  await Promise.all(recipients.filter(x => x !== uid).map(userId => notifyUser(userId, { type: refundAmount ? 'REFUND' : 'CANCELLED', title: refundAmount ? 'Booking cancelled — refund issued' : 'Booking cancelled', body: reason.trim(), jobId })));
  return { success: true, refund: { status: refundStatus, amount: refundAmount } };
});

export const reportNoShow = onCall(async request => {
  const uid = request.auth?.uid; if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { jobId, notes, evidence = [] } = request.data ?? {}; const key = requireIdempotencyKey(request.data?.idempotencyKey);
  if (!jobId || typeof notes !== 'string' || !notes.trim()) throw new HttpsError('invalid-argument', 'Notes are required.');
  await db.runTransaction(async tx => {
    const ref = db.collection('jobs').doc(jobId); const [snap, replay] = await Promise.all([tx.get(ref), tx.get(eventRef(jobId,key))]); if (replay.exists) return;
    if (!snap.exists) throw new HttpsError('not-found','Job not found.'); const job=snap.data()!;
    if (![job.customerId,job.cleanerId].includes(uid)) throw new HttpsError('permission-denied','Not a participant.');
    tx.set(db.collection('reviewCases').doc(key), { jobId, reporterId: uid, reportedRole: uid===job.customerId?'CLEANER':'CUSTOMER', notes: notes.trim(), evidence: Array.isArray(evidence)?evidence.slice(0,5):[], status:'ADMIN_REVIEW', createdAt:FieldValue.serverTimestamp() });
    tx.update(ref,{reviewState:'ADMIN_REVIEW'}); writeEvent(tx,jobId,{type:'NO_SHOW',actorId:uid,actorRole:uid===job.customerId?'CUSTOMER':'CLEANER',previousState:job.status,newState:job.status,idempotencyKey:key});
  }); return {success:true,reviewState:'ADMIN_REVIEW'};
});

export const completeBooking = onCall(async request => {
  const uid=request.auth?.uid; if(!uid) throw new HttpsError('unauthenticated','Sign in required.');
  const {jobId}=request.data??{}; const key=requireIdempotencyKey(request.data?.idempotencyKey);
  let customerId='';
  await db.runTransaction(async tx=>{ const ref=db.collection('jobs').doc(jobId); const [snap,replay]=await Promise.all([tx.get(ref),tx.get(eventRef(jobId,key))]); if(replay.exists)return;
    if(!snap.exists) throw new HttpsError('not-found','Job not found.'); const job=snap.data()!; if(job.cleanerId!==uid)throw new HttpsError('permission-denied','Only the assigned cleaner can complete.'); assertTransition(job.status,'COMPLETED');
    const amount=round2(Number(job.price??0)); const earnings=round2(amount*(1-PLATFORM_COMMISSION));
    if(job.paymentMethod==='WALLET') tx.update(db.collection('users').doc(uid),{balance:FieldValue.increment(earnings),jobsCompleted:FieldValue.increment(1)}); else tx.update(db.collection('users').doc(uid),{balance:FieldValue.increment(-round2(amount*PLATFORM_COMMISSION)),jobsCompleted:FieldValue.increment(1)});
    tx.update(ref,{status:'COMPLETED',completedAt:FieldValue.serverTimestamp(),earnings:{gross:amount,commission:round2(amount*PLATFORM_COMMISSION),net:earnings,finalized:true}});
    writeEvent(tx,jobId,{type:'COMPLETION',actorId:uid,actorRole:'CLEANER',previousState:job.status,newState:'COMPLETED',idempotencyKey:key,metadata:{repeatBooking:!!job.isFavoriteRebook}}); customerId=job.customerId;
  }); if(customerId)await notifyUser(customerId,{type:'COMPLETED',title:'Booking completed',body:'Your cleaning is complete. Please leave a rating.',jobId}); return {success:true};
});

export const rejectBid = onCall(async request => { const uid=request.auth?.uid; const {jobId,bidId}=request.data??{}; if(!uid)throw new HttpsError('unauthenticated','Sign in required.');
 await db.runTransaction(async tx=>{const j=await tx.get(db.collection('jobs').doc(jobId));const b=await tx.get(db.collection('bids').doc(bidId));if(!j.exists||!b.exists)throw new HttpsError('not-found','Not found.');if(j.data()!.customerId!==uid||b.data()!.jobId!==jobId)throw new HttpsError('permission-denied','Not allowed.');if(!['PENDING','COUNTERED'].includes(b.data()!.status))throw new HttpsError('failed-precondition','Bid unavailable.');tx.update(b.ref,{status:'REJECTED'});});return{success:true}; });

/* ───────────────────────── submitBid ───────────────────────── */
/**
 * A cleaner placing a bid on an open job. Moved server-side (client used to
 * `addDoc` this directly) so the cash-commission balance gate below can be
 * enforced authoritatively — a tampered client can't just skip it.
 * Input:  { jobId, bidPrice, estimatedArrival, message? }
 */
export const submitBid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const { jobId, bidPrice, estimatedArrival, message } = (request.data ?? {}) as {
    jobId?: string;
    bidPrice?: number;
    estimatedArrival?: number;
    message?: string;
  };
  if (!jobId || !bidPrice || bidPrice <= 0) {
    throw new HttpsError('invalid-argument', 'jobId and a positive bidPrice are required.');
  }
  if (!estimatedArrival || estimatedArrival < 1 || estimatedArrival > 120) {
    throw new HttpsError('invalid-argument', 'estimatedArrival must be between 1 and 120 minutes.');
  }

  const [jobSnap, cleanerSnap] = await Promise.all([
    db.collection('jobs').doc(jobId).get(),
    db.collection('users').doc(uid).get(),
  ]);
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
  const job = jobSnap.data() as FirebaseFirestore.DocumentData;
  if (job.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', 'This job is no longer accepting bids.');
  }

  const cleaner = cleanerSnap.data() ?? {};
  if (cleaner.role !== 'CLEANER') {
    throw new HttpsError('permission-denied', 'Only cleaners can submit bids.');
  }
  // Cash-commission balance gate (Cleaner Agreement §11-15 / §12): commission
  // on cash jobs is debited immediately on completion (see settleJobPayment),
  // so a negative balance means unpaid commission — block new bids until
  // it's settled, same as the "auto-suspend from bidding" behavior.
  if (Number(cleaner.balance ?? 0) < 0) {
    throw new HttpsError(
      'failed-precondition',
      'Settle your outstanding commission balance before bidding on new jobs.'
    );
  }
  if (cleaner.isSuspended || cleaner.isBanned) {
    throw new HttpsError('permission-denied', 'Your account cannot submit bids right now.');
  }

  const bidRef = await db.collection('bids').add({
    jobId,
    cleanerId: uid,
    cleanerName: cleaner.displayName ?? '',
    cleanerPhoto: cleaner.photoURL ?? '',
    cleanerRating: cleaner.ratingAverage ?? null,
    cleanerJobsCompleted: cleaner.jobsCompleted ?? 0,
    cleanerEliteVerified: (cleaner.verificationLevel ?? 0) >= 3,
    bidPrice: round2(bidPrice),
    estimatedArrival,
    message: message?.trim() || null,
    status: 'PENDING',
    history: [{ by: 'CLEANER', price: round2(bidPrice), message: message?.trim() || null, createdAt: FieldValue.serverTimestamp() }],
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, bidId: bidRef.id };
});

/* ───────────────────────── increaseJobBudget ───────────────────────── */
/**
 * Customer raises their job's asking budget while it's still BIDDING (per
 * the ask: "allow the client to increase budget... while the timer is on").
 * Extends biddingExpiresAt by another 30 minutes so cleaners get a fresh
 * window to respond to the raised offer.
 * Input:  { jobId: string, newBudget: number }
 */
export const increaseJobBudget = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const { jobId, newBudget } = (request.data ?? {}) as { jobId?: string; newBudget?: number };
  if (!jobId || !newBudget || newBudget <= 0) {
    throw new HttpsError('invalid-argument', 'jobId and a positive newBudget are required.');
  }

  const jobRef = db.collection('jobs').doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
  const job = jobSnap.data() as FirebaseFirestore.DocumentData;

  if (job.customerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the job customer can change the budget.');
  }
  if (job.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', 'This job is no longer accepting bids.');
  }
  const currentBudget = Number(job.budget ?? 0);
  if (currentBudget > 0 && newBudget <= currentBudget) {
    throw new HttpsError('invalid-argument', 'The new budget must be higher than the current one.');
  }

  await jobRef.update({
    budget: round2(newBudget),
    biddingExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
  });

  return { success: true };
});

/* ───────────────────────── devCreditWallet ───────────────────────── */
/**
 * DEV-ONLY wallet top-up used for local testing against the Functions emulator.
 * Hard-refuses to run anywhere except the emulator, so it is safe even if it
 * gets deployed by accident. Lets developers exercise the wallet without a live
 * PesePay account.
 */
export const devCreditWallet = onCall(async (request) => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'devCreditWallet only runs in the local emulator.');
  }
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const { amount } = (request.data ?? {}) as { amount?: number };
  if (!amount || amount <= 0) throw new HttpsError('invalid-argument', 'A positive amount is required.');

  await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    tx.update(userRef, { balance: FieldValue.increment(amount) });
    tx.set(db.collection('transactions').doc(), {
      userId: uid,
      type: 'CREDIT',
      amount,
      description: 'Wallet top-up [DEV emulator]',
      status: 'COMPLETED',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { success: true };
});

/* ───────────────────────── createPesePayPayment ───────────────────────── */
/**
 * Starts a PesePay hosted checkout so the user can top up their wallet.
 * Input:  { amount: number, currency?: 'USD' }
 * Output: { redirectUrl: string, referenceNumber: string }
 *
 * Writes a PENDING transaction; pesepayWebhook settles it once PesePay confirms.
 */
export const createPesePayPayment = onCall(
  { secrets: [PESEPAY_INTEGRATION_KEY, PESEPAY_ENCRYPTION_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

    const { amount, currency } = (request.data ?? {}) as { amount?: number; currency?: string };
    if (!amount || amount <= 0) {
      throw new HttpsError('invalid-argument', 'A positive amount is required.');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pesepay } = require('pesepay');
    const pesepay = new Pesepay(
      PESEPAY_INTEGRATION_KEY.value(),
      PESEPAY_ENCRYPTION_KEY.value()
    );

    const project = process.env.GCLOUD_PROJECT;
    pesepay.resultUrl = `https://us-central1-${project}.cloudfunctions.net/pesepayWebhook`;
    pesepay.returnUrl = 'detail://wallet'; // deep-links back into the app

    const transaction = pesepay.createTransaction(
      amount,
      currency || 'USD',
      'Detail wallet top-up'
    );
    const response = await pesepay.initiateTransaction(transaction);
    if (!response?.success) {
      logger.error('PesePay initiate failed', response);
      throw new HttpsError('internal', response?.message || 'PesePay could not start the payment.');
    }

    const referenceNumber: string = response.referenceNumber;
    await db.collection('transactions').add({
      userId: uid,
      type: 'CREDIT',
      amount,
      description: 'Wallet top-up',
      status: 'PENDING',
      referenceNumber,
      pollUrl: response.pollUrl ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { redirectUrl: response.redirectUrl, referenceNumber };
  }
);

/* ───────────────────────── pesepayWebhook ───────────────────────── */
/**
 * PesePay calls this (resultUrl) when a payment finishes. We verify the
 * payment with PesePay, then mark the PENDING transaction COMPLETED and credit
 * the user's wallet — exactly once (idempotent on the COMPLETED status).
 */
export const pesepayWebhook = onRequest(
  { secrets: [PESEPAY_INTEGRATION_KEY, PESEPAY_ENCRYPTION_KEY] },
  async (req, res) => {
    try {
      const referenceNumber =
        req.body?.referenceNumber || (req.query?.referenceNumber as string | undefined);
      if (!referenceNumber) {
        res.status(400).send('Missing referenceNumber');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pesepay } = require('pesepay');
      const pesepay = new Pesepay(
        PESEPAY_INTEGRATION_KEY.value(),
        PESEPAY_ENCRYPTION_KEY.value()
      );
      const result = await pesepay.checkPayment(referenceNumber);

      const txQuery = await db
        .collection('transactions')
        .where('referenceNumber', '==', referenceNumber)
        .limit(1)
        .get();
      if (txQuery.empty) {
        res.status(404).send('Transaction not found');
        return;
      }

      const txDoc = txQuery.docs[0];
      const tx = txDoc.data();
      if (tx.status === 'COMPLETED') {
        res.status(200).send('Already processed');
        return;
      }

      if (result?.success && result?.paid) {
        await db.runTransaction(async (t) => {
          t.update(txDoc.ref, { status: 'COMPLETED', settledAt: FieldValue.serverTimestamp() });
          t.update(db.collection('users').doc(tx.userId), {
            balance: FieldValue.increment(Number(tx.amount)),
          });
        });
        res.status(200).send('OK');
      } else {
        await txDoc.ref.update({ status: 'FAILED' });
        res.status(200).send('Payment not completed');
      }
    } catch (err) {
      logger.error('pesepayWebhook error', err);
      res.status(500).send('Internal error');
    }
  }
);

/* ───────────────────────── notification triggers ───────────────────────── */
/**
 * These triggers are what actually populate the /notifications collection
 * and fire push notifications — everything above only writes the
 * jobs/bids/messages documents the app already needed. Because they run on
 * the Admin SDK, they can write into a collection the client is forbidden
 * from writing to directly (see firestore.rules).
 */

// Haversine distance in km — server-side twin of mobile/services/matching.ts's
// helper (Cloud Functions can't import the client app's module directly).
function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLon = (b.lng - a.lng) * (Math.PI / 180);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * (Math.PI / 180)) * Math.cos(b.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const DEFAULT_SERVICE_RADIUS_KM = 15;

// New job posted → tell cleaners immediately, nearest first (Cleaner
// Agreement note: "Cleaner must get push notifications on new jobs";
// "match nearby first" like Uber matches nearby drivers). Cleaners with a
// stored location (set on Home-screen mount, see mobile/app/(tabs)/home.tsx)
// only get notified if the job falls within their own registered
// serviceRadiusKm; cleaners with no stored location yet are notified
// regardless, as a fallback, so nobody is silently excluded just because
// this data hasn't been populated for them yet.
export const onJobCreated = onDocumentCreated('jobs/{jobId}', async (event) => {
  const job = event.data?.data();
  if (!job || job.status !== 'BIDDING') return;

  // A job with no usable coordinates (customer typed an address instead of
  // using "current location") can't be distance-filtered — fall back to the
  // old broadcast-everyone behavior rather than silently notifying no one.
  const jobHasLocation = typeof job.location?.lat === 'number' && (job.location.lat !== 0 || job.location.lng !== 0);

  const cleanersSnap = await db.collection('users').where('role', '==', 'CLEANER').get();
  const targetCleanerIds = cleanersSnap.docs
    .filter((d) => !d.data().isSuspended && !d.data().isBanned)
    .filter((d) => {
      if (!jobHasLocation) return true;
      const cleaner = d.data();
      if (!cleaner.location?.lat || !cleaner.location?.lng) return true; // no location yet — fallback, always notify
      const distance = haversineDistanceKm(job.location, cleaner.location);
      return distance <= (cleaner.serviceRadiusKm ?? DEFAULT_SERVICE_RADIUS_KM);
    })
    .map((d) => d.id);

  const firstPhoto: string | undefined = Array.isArray(job.photos) && job.photos.length > 0
    ? job.photos[0]
    : undefined;
  const photoNote = Array.isArray(job.photos) && job.photos.length > 0
    ? ` · ${job.photos.length} photo${job.photos.length > 1 ? 's' : ''}`
    : '';
  const regNote = job.checklist?.registrationNumber ? ` · Reg: ${job.checklist.registrationNumber}` : '';

  await Promise.all(
    targetCleanerIds.map((cleanerId) =>
      notifyUser(cleanerId, {
        type: 'JOB_UPDATE',
        title: 'New job posted 🧹',
        body: `${job.serviceType ?? 'A new job'} near ${job.location?.address ?? 'you'} — $${job.budget ?? '—'}${photoNote}${regNote}`,
        jobId: event.params.jobId,
        imageUrl: firstPhoto,
      })
    )
  );
});

// Every 15 minutes: remind the assigned cleaner about jobs scheduled within
// the next hour, once (reminderSent guards against re-notifying on the next run).
export const sendJobReminders = onSchedule('every 15 minutes', async () => {
  const now = admin.firestore.Timestamp.now();
  const soon = admin.firestore.Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000);

  const upcomingSnap = await db
    .collection('jobs')
    .where('status', '==', 'ASSIGNED')
    .where('scheduledDateTime', '>=', now)
    .where('scheduledDateTime', '<=', soon)
    .get();

  await Promise.all(
    upcomingSnap.docs
      .filter((d) => !d.data().reminderSent && d.data().cleanerId)
      .map(async (d) => {
        const job = d.data();
        const when = job.scheduledDateTime?.toDate?.();
        await notifyUser(job.cleanerId, {
          type: 'JOB_UPDATE',
          title: 'Upcoming job reminder',
          body: `Your job at ${job.location?.address ?? 'the scheduled address'} is coming up${
            when ? ` at ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
          }.`,
          jobId: d.id,
        });
        await d.ref.update({ reminderSent: true });
      })
  );
});

// New quote submitted → tell the customer.
export const onBidCreated = onDocumentCreated('bids/{bidId}', async (event) => {
  const bid = event.data?.data();
  if (!bid) return;

  const jobSnap = await db.collection('jobs').doc(bid.jobId).get();
  const job = jobSnap.data();
  if (!job) return;

  await notifyUser(job.customerId, {
    type: 'NEW_BID',
    title: 'New quote received',
    body: `${bid.cleanerName ?? 'A cleaner'} quoted $${Number(bid.bidPrice).toFixed(2)} for your job.`,
    jobId: bid.jobId,
  });
});

// Job status changed (en route, arrived, in progress, completed, cancelled) →
// tell whichever party didn't make the change.
const NOTIFIABLE_STATUS: Record<string, string> = {
  EN_ROUTE: 'Your cleaner is on the way',
  ARRIVED: 'Your cleaner has arrived',
  IN_PROGRESS: 'Cleaning has started',
  COMPLETED: 'Job marked complete',
  CANCELLED: 'Job was cancelled',
};

export const onJobUpdated = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === after.status) return;

  const title = NOTIFIABLE_STATUS[after.status];
  if (!title) return; // ACCEPTED/BIDDING already handled by acceptBid directly

  // Notify whichever side is not the assumed actor of that transition —
  // customer for cleaner-driven updates, cleaner for customer-driven ones.
  const recipients =
    after.status === 'CANCELLED'
      ? [after.customerId, after.cleanerId].filter(Boolean)
      : [after.customerId].filter(Boolean);

  await Promise.all(
    recipients.map((userId: string) =>
      notifyUser(userId, {
        type: 'JOB_UPDATE',
        title,
        body: `${after.serviceType ?? 'Your job'} — ${after.location?.address ?? ''}`.trim(),
        jobId: event.params.jobId,
      })
    )
  );
});

// New chat message → tell the other participant (not the sender).
export const onMessageCreated = onDocumentCreated('messages/{messageId}', async (event) => {
  const message = event.data?.data();
  if (!message) return;

  const jobSnap = await db.collection('jobs').doc(message.jobId).get();
  const job = jobSnap.data();
  if (!job) return;

  const recipientId = message.senderId === job.customerId ? job.cleanerId : job.customerId;
  if (!recipientId) return;

  await notifyUser(recipientId, {
    type: 'MESSAGE',
    title: message.senderName ?? 'New message',
    body: message.text ? String(message.text).slice(0, 120) : 'Sent a photo',
    jobId: message.jobId,
  });
});
