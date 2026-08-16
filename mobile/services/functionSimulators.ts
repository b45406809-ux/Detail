/**
 * TEMPORARY — SIMULATE MODE.
 *
 * Client-side stand-ins for the Cloud Functions in functions/src/index.ts,
 * used only while EXPO_PUBLIC_SIMULATE_FUNCTIONS is 'true' (i.e. Cloud
 * Functions can't be deployed yet — needs Firebase Blaze billing, not
 * enabled). Each function here replicates the *exact* validation and
 * Firestore writes of its real counterpart, just run from the client SDK
 * instead of the Admin SDK — which only works because firestore.rules has a
 * matching "SIMULATE MODE" section temporarily allowing these specific
 * writes. See that file for the full list of loosened rules.
 *
 * Two things these can NOT replicate, both fine to live without for now:
 *   - Auto-decline notifications / push notifications (those are separate
 *     Firestore-triggered functions — onBidCreated, onJobUpdated,
 *     onMessageCreated, onJobCreated — not part of the callFunction surface,
 *     so nothing here calls them; the /notifications collection simply
 *     won't populate until real Functions are deployed).
 *   - Server-side authority: a modified client build could bypass the
 *     validation below. Acceptable for pre-launch testing, NOT once real
 *     users/money are involved — that's exactly why this whole file (and
 *     its matching rules) needs to be deleted once Blaze unlocks the real
 *     Functions.
 */
import {
  auth,
  db,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp,
} from './firebase';

const PLATFORM_COMMISSION = 0.1;
const round2 = (n: number) => Math.round(n * 100) / 100;

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  return uid;
}

async function simulateSubmitBid(data: {
  jobId: string;
  bidPrice: number;
  estimatedArrival: number;
  message?: string;
}) {
  const uid = requireUid();
  const { jobId, bidPrice, estimatedArrival, message } = data;
  if (!jobId || !bidPrice || bidPrice <= 0) throw new Error('jobId and a positive bidPrice are required.');
  if (!estimatedArrival || estimatedArrival < 1 || estimatedArrival > 120) {
    throw new Error('estimatedArrival must be between 1 and 120 minutes.');
  }

  const [jobSnap, cleanerSnap] = await Promise.all([
    getDoc(doc(db, 'jobs', jobId)),
    getDoc(doc(db, 'users', uid)),
  ]);
  if (!jobSnap.exists()) throw new Error('Job not found.');
  const job = jobSnap.data();
  if (job.status !== 'BIDDING') throw new Error('This job is no longer accepting bids.');

  const cleaner = cleanerSnap.data() ?? {};
  if (cleaner.role !== 'CLEANER') throw new Error('Only cleaners can submit bids.');
  // Soft, non-authoritative in simulate mode (no server to enforce it) —
  // still useful to surface the same UX as the real balance gate.
  if (Number(cleaner.balance ?? 0) < 0) {
    throw new Error('Settle your outstanding commission balance before bidding on new jobs.');
  }
  if (cleaner.isSuspended || cleaner.isBanned) throw new Error('Your account cannot submit bids right now.');

  const bidRef = await addDoc(collection(db, 'bids'), {
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
    history: [{ by: 'CLEANER', price: round2(bidPrice), message: message?.trim() || null, createdAt: serverTimestamp() }],
    createdAt: serverTimestamp(),
  });

  return { success: true, bidId: bidRef.id };
}

async function simulateAcceptBid(data: { jobId: string; bidId: string }) {
  const uid = requireUid();
  const { jobId, bidId } = data;
  if (!jobId || !bidId) throw new Error('jobId and bidId are required.');

  const jobRef = doc(db, 'jobs', jobId);
  const bidRef = doc(db, 'bids', bidId);

  // Firestore's client SDK doesn't support arbitrary queries inside a
  // transaction — gather the other open bids first, then blindly update
  // them (no read needed) inside the transaction below.
  const otherBidsSnap = await getDocs(
    query(collection(db, 'bids'), where('jobId', '==', jobId), where('status', 'in', ['PENDING', 'COUNTERED']))
  );
  const otherBidRefs = otherBidsSnap.docs.filter((d) => d.id !== bidId).map((d) => d.ref);

  await runTransaction(db, async (tx) => {
    const jobSnap = await tx.get(jobRef);
    const bidSnap = await tx.get(bidRef);
    if (!jobSnap.exists()) throw new Error('Job not found.');
    if (!bidSnap.exists()) throw new Error('Bid not found.');
    const job = jobSnap.data();
    const bid = bidSnap.data();

    if (job.customerId !== uid) throw new Error('Only the job customer can accept a bid.');
    if (job.status !== 'BIDDING') throw new Error('This job is no longer accepting bids.');
    if (bid.jobId !== jobId) throw new Error('That bid does not belong to this job.');

    tx.update(bidRef, { status: 'ACCEPTED' });
    tx.update(jobRef, {
      status: 'ACCEPTED',
      cleanerId: bid.cleanerId,
      cleanerName: bid.cleanerName ?? null,
      cleanerPhoto: bid.cleanerPhoto ?? null,
      cleanerRating: bid.cleanerRating ?? null,
      price: Number(bid.bidPrice),
      acceptedAt: serverTimestamp(),
    });
    otherBidRefs.forEach((ref) => tx.update(ref, { status: 'REJECTED' }));
  });

  return { success: true };
}

async function simulateIncreaseJobBudget(data: { jobId: string; newBudget: number }) {
  const uid = requireUid();
  const { jobId, newBudget } = data;
  if (!jobId || !newBudget || newBudget <= 0) throw new Error('jobId and a positive newBudget are required.');

  const jobRef = doc(db, 'jobs', jobId);
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) throw new Error('Job not found.');
  const job = jobSnap.data();

  if (job.customerId !== uid) throw new Error('Only the job customer can change the budget.');
  if (job.status !== 'BIDDING') throw new Error('This job is no longer accepting bids.');
  if (newBudget <= Number(job.budget ?? 0)) throw new Error('The new budget must be higher than the current one.');

  await updateDoc(jobRef, {
    budget: round2(newBudget),
    biddingExpiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
  });

  return { success: true };
}

async function simulateSubmitRating(data: { jobId: string; rating: number }) {
  const uid = requireUid();
  const { jobId, rating } = data;
  if (!jobId || !rating || rating < 1 || rating > 5) throw new Error('jobId and a rating between 1 and 5 are required.');

  const jobRef = doc(db, 'jobs', jobId);

  await runTransaction(db, async (tx) => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists()) throw new Error('Job not found.');
    const job = jobSnap.data();

    if (job.customerId !== uid) throw new Error('Only the job customer can rate.');
    if (job.ratedAt) throw new Error('This job is already rated.');
    if (!job.cleanerId) throw new Error('No cleaner to rate.');

    const cleanerRef = doc(db, 'users', job.cleanerId);
    const cleanerSnap = await tx.get(cleanerRef);
    const avg = Number(cleanerSnap.data()?.ratingAverage ?? 0);
    const count = Number(cleanerSnap.data()?.ratingCount ?? 0);
    const newCount = count + 1;
    const newAvg = round2((avg * count + rating) / newCount);

    tx.set(doc(collection(db, 'reviews')), {
      jobId,
      cleanerId: job.cleanerId,
      customerId: uid,
      customerName: job.customerName ?? 'Customer',
      rating,
      createdAt: serverTimestamp(),
    });
    tx.update(cleanerRef, { ratingAverage: newAvg, ratingCount: newCount });
    tx.update(jobRef, { rating, ratedAt: serverTimestamp() });
  });

  return { success: true };
}

async function simulateSettleJobPayment(data: { jobId: string; paymentMethod: 'WALLET' | 'CASH' }) {
  const uid = requireUid();
  const { jobId, paymentMethod } = data;
  if (!jobId || (paymentMethod !== 'WALLET' && paymentMethod !== 'CASH')) {
    throw new Error('jobId and a valid paymentMethod are required.');
  }

  const jobRef = doc(db, 'jobs', jobId);

  await runTransaction(db, async (tx) => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists()) throw new Error('Job not found.');
    const job = jobSnap.data();

    if (job.customerId !== uid) throw new Error('Only the job customer can pay.');
    if (job.paidAt) throw new Error('This job is already paid.');
    if (!job.cleanerId) throw new Error('No cleaner is assigned.');

    const price = Number(job.price);
    if (!price || price <= 0) throw new Error('This job has no valid price.');

    const customerRef = doc(db, 'users', uid);
    const cleanerRef = doc(db, 'users', job.cleanerId);
    const cleanerAmount = round2(price * (1 - PLATFORM_COMMISSION));

    if (paymentMethod === 'WALLET') {
      const customerSnap = await tx.get(customerRef);
      const balance = Number(customerSnap.data()?.balance ?? 0);
      if (balance < price) {
        throw new Error(`Insufficient balance. You have $${balance.toFixed(2)} but need $${price.toFixed(2)}.`);
      }

      tx.update(customerRef, { balance: increment(-price) });
      tx.update(cleanerRef, { balance: increment(cleanerAmount), jobsCompleted: increment(1) });

      tx.set(doc(collection(db, 'transactions')), {
        userId: uid,
        type: 'DEBIT',
        amount: price,
        description: `Payment for ${job.serviceType}`,
        jobId,
        status: 'COMPLETED',
        createdAt: serverTimestamp(),
      });
      tx.set(doc(collection(db, 'transactions')), {
        userId: job.cleanerId,
        type: 'CREDIT',
        amount: cleanerAmount,
        description: `Earnings from ${job.serviceType}`,
        jobId,
        status: 'COMPLETED',
        createdAt: serverTimestamp(),
      });
    } else {
      const commission = round2(price * PLATFORM_COMMISSION);
      tx.update(cleanerRef, { balance: increment(-commission), jobsCompleted: increment(1) });
      tx.set(doc(collection(db, 'transactions')), {
        userId: job.cleanerId,
        type: 'DEBIT',
        amount: commission,
        description: `Commission on cash job — ${job.serviceType}`,
        jobId,
        status: 'COMPLETED',
        createdAt: serverTimestamp(),
      });
    }

    tx.update(jobRef, { paidAt: serverTimestamp(), paymentMethod });
  });

  return { success: true };
}

async function simulateReportJobIssue(data: { jobId: string; reason: string; evidencePhotos?: string[] }) {
  const uid = requireUid();
  const { jobId, reason, evidencePhotos } = data;
  if (!jobId || !reason?.trim()) throw new Error('jobId and a reason are required.');

  const jobSnap = await getDoc(doc(db, 'jobs', jobId));
  if (!jobSnap.exists()) throw new Error('Job not found.');
  const job = jobSnap.data();

  if (job.customerId !== uid) throw new Error('Only the job customer can report an issue.');
  if (job.status !== 'COMPLETED') throw new Error('Only completed jobs can be reported.');

  const disputeRef = await addDoc(collection(db, 'disputes'), {
    jobId,
    customerId: uid,
    cleanerId: job.cleanerId ?? null,
    reason: reason.trim(),
    evidencePhotos: evidencePhotos ?? [],
    status: 'PENDING',
    createdAt: serverTimestamp(),
  });

  return { success: true, disputeId: disputeRef.id };
}

async function simulateDevCreditWallet(data: { amount: number }) {
  const uid = requireUid();
  const { amount } = data;
  if (!amount || amount <= 0) throw new Error('A positive amount is required.');

  const userRef = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    tx.update(userRef, { balance: increment(amount) });
    tx.set(doc(collection(db, 'transactions')), {
      userId: uid,
      type: 'CREDIT',
      amount,
      description: 'Wallet top-up [SIMULATED]',
      status: 'COMPLETED',
      createdAt: serverTimestamp(),
    });
  });

  return { success: true };
}

export const FUNCTION_SIMULATORS: Record<string, (data: any) => Promise<any>> = {
  submitBid: simulateSubmitBid,
  acceptBid: simulateAcceptBid,
  increaseJobBudget: simulateIncreaseJobBudget,
  submitRating: simulateSubmitRating,
  settleJobPayment: simulateSettleJobPayment,
  reportJobIssue: simulateReportJobIssue,
  devCreditWallet: simulateDevCreditWallet,
};
