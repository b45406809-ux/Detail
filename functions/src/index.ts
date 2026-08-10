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

/* ───────────────────────── notification helper ───────────────────────── */
/**
 * Writes an in-app notification doc and, if the recipient has registered an
 * Expo push token, fires a push through Expo's push gateway. Best-effort:
 * push failures are logged but never throw, so a bad/expired token can't
 * break the write that triggered it.
 */
async function notifyUser(
  userId: string,
  notification: { type: string; title: string; body: string; jobId?: string }
) {
  await db.collection('notifications').add({
    userId,
    ...notification,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    const userSnap = await db.collection('users').doc(userId).get();
    const token = userSnap.data()?.expoPushToken;
    if (!token || typeof token !== 'string' || !token.startsWith('ExponentPushToken')) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title: notification.title,
        body: notification.body,
        data: { jobId: notification.jobId ?? null, type: notification.type },
        sound: 'default',
      }),
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

  const { jobId, rating } = (request.data ?? {}) as { jobId?: string; rating?: number };
  if (!jobId || !rating || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'jobId and a rating between 1 and 5 are required.');
  }

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
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(cleanerRef, { ratingAverage: newAvg, ratingCount: newCount });
    tx.update(jobRef, { rating, ratedAt: FieldValue.serverTimestamp() });
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

  const { jobId, bidId } = (request.data ?? {}) as { jobId?: string; bidId?: string };
  if (!jobId || !bidId) {
    throw new HttpsError('invalid-argument', 'jobId and bidId are required.');
  }

  const jobRef = db.collection('jobs').doc(jobId);
  const bidRef = db.collection('bids').doc(bidId);
  const otherBidsQuery = db
    .collection('bids')
    .where('jobId', '==', jobId)
    .where('status', 'in', ['PENDING', 'COUNTERED']);

  let acceptedCleanerId: string | null = null;
  let rejectedCleanerIds: string[] = [];

  await db.runTransaction(async (tx) => {
    const [jobSnap, bidSnap, otherBidsSnap] = await Promise.all([
      tx.get(jobRef),
      tx.get(bidRef),
      tx.get(otherBidsQuery),
    ]);
    if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
    if (!bidSnap.exists) throw new HttpsError('not-found', 'Bid not found.');

    const job = jobSnap.data() as FirebaseFirestore.DocumentData;
    const bid = bidSnap.data() as FirebaseFirestore.DocumentData;

    if (job.customerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the job customer can accept a bid.');
    }
    if (job.status !== 'BIDDING') {
      throw new HttpsError('failed-precondition', 'This job is no longer accepting bids.');
    }
    if (bid.jobId !== jobId) {
      throw new HttpsError('invalid-argument', 'That bid does not belong to this job.');
    }

    tx.update(bidRef, { status: 'ACCEPTED' });
    tx.update(jobRef, {
      status: 'ACCEPTED',
      cleanerId: bid.cleanerId,
      cleanerName: bid.cleanerName ?? null,
      cleanerPhoto: bid.cleanerPhoto ?? null,
      cleanerRating: bid.cleanerRating ?? null,
      price: Number(bid.bidPrice), // authoritative — taken from the bid, not the client
      acceptedAt: FieldValue.serverTimestamp(),
    });

    acceptedCleanerId = bid.cleanerId;
    // Auto-decline every other outstanding bid on this job now that one is accepted.
    // Rebuilt fresh (not pushed-to) each attempt so a transaction retry can't
    // accumulate duplicate ids from a prior, aborted attempt.
    rejectedCleanerIds = otherBidsSnap.docs
      .filter((d) => d.id !== bidId)
      .map((d) => {
        tx.update(d.ref, { status: 'REJECTED' });
        return d.data().cleanerId as string;
      });
  });

  // Notifications are best-effort and happen after the transaction commits.
  if (acceptedCleanerId) {
    await notifyUser(acceptedCleanerId, {
      type: 'BID_ACCEPTED',
      title: 'Quote accepted! 🎉',
      body: 'The customer accepted your quote. Head to the job for details.',
      jobId,
    });
  }
  await Promise.all(
    rejectedCleanerIds.map((cleanerId) =>
      notifyUser(cleanerId, {
        type: 'JOB_UPDATE',
        title: 'Job filled',
        body: 'The customer went with another cleaner for this job.',
        jobId,
      })
    )
  );

  return { success: true };
});

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
  if (job.status !== 'BIDDING') {
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
  if (job.status !== 'BIDDING') {
    throw new HttpsError('failed-precondition', 'This job is no longer accepting bids.');
  }
  if (newBudget <= Number(job.budget ?? 0)) {
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

// New job posted → tell every cleaner immediately (Cleaner Agreement note:
// "Cleaner must get push notifications on new jobs"). Broadcasts to every
// non-suspended cleaner — no geo-sharding infra exists yet, so this doesn't
// scope by distance; a known scale limitation to revisit once the cleaner
// base grows past what a broadcast can reasonably serve.
export const onJobCreated = onDocumentCreated('jobs/{jobId}', async (event) => {
  const job = event.data?.data();
  if (!job || job.status !== 'BIDDING') return;

  const cleanersSnap = await db.collection('users').where('role', '==', 'CLEANER').get();
  await Promise.all(
    cleanersSnap.docs
      .filter((d) => !d.data().isSuspended && !d.data().isBanned)
      .map((d) =>
        notifyUser(d.id, {
          type: 'JOB_UPDATE',
          title: 'New job posted',
          body: `${job.serviceType ?? 'A new job'} near ${job.location?.address ?? 'you'} — $${job.budget ?? '—'}`,
          jobId: event.params.jobId,
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
    .where('status', '==', 'ACCEPTED')
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
