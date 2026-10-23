import { createClient } from 'npm:@supabase/supabase-js@2.80.0';
import { Paynow } from 'npm:paynow@2.2.2';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const integrationId = Deno.env.get('PAYNOW_INTEGRATION_ID') ?? '';
const integrationKey = Deno.env.get('PAYNOW_INTEGRATION_KEY') ?? '';
const schedulerSecret = Deno.env.get('CRON_SECRET') ?? '';
if (!url || !serviceKey || !integrationId || !integrationKey || !schedulerSecret) {
  throw new Error('Paynow reconciliation environment is incomplete.');
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const paynow = new Paynow(integrationId, integrationKey);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function notificationId(userId: string, reference: string, status: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${reference}:${status}`)));
  const bytes = Array.from(digest.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function notifyOnce(userId: string, reference: string, status: string, payload: { title: string; body: string; type: string; jobId?: string | null }) {
  const { error } = await admin.rpc('create_notification_outbox_with_id', {
    p_notification_id: await notificationId(userId, reference, status),
    p_user_id: userId,
    p_title: payload.title,
    p_body: payload.body,
    p_type: payload.type,
    p_job_id: payload.jobId ?? null,
    p_data: { paymentStatus: status },
  });
  if (error) throw error;
}

function trustedPollUrl(raw: string) {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' || !['paynow.co.zw', 'www.paynow.co.zw'].includes(parsed.hostname)) {
    throw new Error('Paynow returned an untrusted poll URL.');
  }
  return parsed.toString();
}

async function reconcileRefund(payment: Record<string, any>) {
  const updatedAt = new Date().toISOString();
  const { error: ledgerError } = await admin.from('paynowrefundtransactions')
    .update({ status: 'RECONCILIATION_REQUIRED', updatedat: updatedAt, data: { providerStatus: 'REFUNDED', providerStatusAt: updatedAt } })
    .eq('paymentid', payment.id).in('status', ['REQUESTED', 'SUBMITTED']);
  if (ledgerError) throw ledgerError;

  const refundRequest = payment.data?.refundRequest;
  const nextData = {
    ...(payment.data ?? {}),
    ...(refundRequest ? { refundRequest: { ...refundRequest, status: 'RECONCILIATION_REQUIRED', providerStatusAt: updatedAt } } : {}),
    refundSummary: { ...(payment.data?.refundSummary ?? {}), latestStatus: 'RECONCILIATION_REQUIRED', providerStatus: 'REFUNDED', updatedAt },
  };
  const { error: paymentError } = await admin.from('payments').update({ data: nextData }).eq('id', payment.id);
  if (paymentError) throw paymentError;
  if (payment.jobid) {
    const { error } = await admin.from('supportcases').upsert({
      id: `paynow_refund_reconcile_${payment.id}`,
      jobid: payment.jobid,
      customerid: payment.customerid,
      cleanerid: payment.cleanerid,
      reason: 'Paynow reported REFUNDED without refund-specific amount/reference evidence. Reconcile the provider transaction before confirming the refund ledger.',
      status: 'URGENT',
      data: { type: 'PAYNOW_REFUND_RECONCILIATION', paymentId: payment.id, providerStatus: 'REFUNDED' },
    }, { onConflict: 'id' });
    if (error) throw error;
  }
}

async function processPayment(payment: Record<string, any>) {
  const pollUrl = trustedPollUrl(String(payment.pollurl));
  const result = await paynow.pollTransaction(pollUrl);
  const reference = String(result.reference ?? '');
  const status = String(result.status ?? '');
  const amount = Number(result.amount);
  if (!reference || !status || !Number.isFinite(amount) || amount <= 0) throw new Error('Paynow returned an incomplete status result.');

  const payload = JSON.stringify({ reference, status, amount });
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)));
  const eventId = Array.from(digest).map(value => value.toString(16).padStart(2, '0')).join('');
  const { data, error } = await admin.rpc('apply_paynow_provider_poll', {
    p_event_id: eventId,
    p_reference: reference,
    p_status: status,
    p_amount: amount,
  });
  if (error) throw error;
  if (data?.status === 'FAILED') {
    throw new Error('Paynow status was retained for reconciliation but could not be applied.');
  }
  if (data?.status === 'IGNORED') {
    const { error: eventError } = await admin.from('paynowproviderevents')
      .update({ processingstatus: 'FAILED', lasterror: 'Paynow returned an unsupported payment status.' })
      .eq('eventid', eventId);
    if (eventError) console.error('Could not retain unsupported Paynow status', String(eventError));
    throw new Error('Paynow returned an unsupported payment status.');
  }
  if (data?.replayed) return { status: data.status, replayed: true };

  try {
  if (data?.status === 'REFUNDED') await reconcileRefund(payment);
  const messages: Record<string, { title: string; body: string; type: string }> = {
    ESCROWED: { title: 'Payment protected with BuySafe', body: 'Paynow is holding the booking payment. Open Detail to follow the service.', type: 'PAYMENT_ESCROWED' },
    DELIVERED: { title: 'Delivery confirmed in Paynow', body: 'The 24-hour dispute period has started.', type: 'PAYMENT_DELIVERED' },
    PAID: { title: payment.jobid ? 'Paynow released the payment' : 'Wallet top-up completed', body: payment.jobid ? 'Paynow has released the payment to Detail.' : 'Your Detail wallet balance has been updated.', type: 'PAYMENT_PAID' },
    DISPUTED: { title: 'Paynow dispute opened', body: 'Paynow reported a dispute. Detail support will review the booking.', type: 'PAYMENT_DISPUTED' },
    REFUNDED: { title: 'Paynow refund reported', body: 'Paynow reported a refunded payment. Detail support is reconciling the amount and transaction reference.', type: 'PAYMENT_REFUNDED' },
  };
  const message = messages[data?.status];
  if (message) {
    const recipients = new Set([payment.customerid, payment.cleanerid].filter(Boolean).map(String));
    for (const recipient of recipients) await notifyOnce(recipient, reference, String(data.status), { ...message, jobId: payment.jobid });
    if (data.status === 'DISPUTED') {
      const { data: admins, error: adminError } = await admin.from('adminroles').select('userid');
      if (adminError) throw adminError;
      for (const row of admins ?? []) await notifyOnce(row.userid, reference, 'DISPUTED', {
        title: 'Paynow dispute needs review',
        body: 'A Paynow BuySafe dispute was opened. Review the support queue.',
        type: 'PAYMENT_DISPUTED',
        jobId: payment.jobid,
      });
    }
  }
  } catch (failure) {
    const message = String(failure).slice(0, 1000);
    const { error: eventError } = await admin.from('paynowproviderevents')
      .update({ processingstatus: 'FAILED', lasterror: message }).eq('eventid', eventId);
    if (eventError) console.error('Could not mark Paynow poll event for retry', String(eventError));
    throw failure;
  }
  return { status: data?.status, replayed: false };
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'POST required.' }, 405);
  if (request.headers.get('x-scheduler-secret') !== schedulerSecret) return json({ error: 'Unauthorized.' }, 401);

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: payments, error } = await admin.from('payments')
    .select('id,reference,customerid,cleanerid,jobid,amount,status,pollurl,data,updatedat')
    .eq('provider', 'PAYNOW')
    .in('status', ['INITIATING', 'PENDING', 'ESCROWED', 'DELIVERED', 'DISPUTED'])
    .not('pollurl', 'is', null)
    .lt('updatedat', cutoff)
    .order('updatedat', { ascending: true })
    .limit(20);
  if (error) return json({ error: 'Could not load pending Paynow payments.' }, 503);

  let applied = 0;
  let failed = 0;
  for (const payment of payments ?? []) {
    try {
      const result = await processPayment(payment);
      if (!result.replayed) applied++;
    } catch (failure) {
      failed++;
      const safeMessage = String(failure).replace(/(?:integration|merchant)[-_ ]?(?:id|key)\s*[:=]?\s*\S+/gi, '[redacted]').slice(0, 1000);
      console.error('Paynow reconciliation failed', payment.id, safeMessage);
      const { error: retryError } = await admin.from('payments').update({ updatedat: new Date().toISOString() }).eq('id', payment.id);
      if (retryError) console.error('Could not defer failed Paynow poll', String(retryError));
    }
  }
  return json({ polled: payments?.length ?? 0, applied, failed });
});
