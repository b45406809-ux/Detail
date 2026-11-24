import { createRequire } from 'node:module';
import { initiatePaynowMobile } from '../supabase/functions/_shared/paynow_mobile.ts';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { Paynow } = require('paynow');
const id = process.env.PAYNOW_TEST_ID ?? '';
const key = process.env.PAYNOW_TEST_KEY ?? '';
const phone = (process.env.PAYNOW_TEST_PHONE ?? '').replace(/[ +().-]/g, '').replace(/^263/, '0');
const email = process.env.PAYNOW_TEST_EMAIL ?? '';
const reference = `DETAIL-NODE-DIAG-${process.env.PAYNOW_TEST_RUN ?? ''}`;
if (id !== '27890' || !key || !/^07[78][0-9]{7}$/.test(phone) || !email || !process.env.PAYNOW_TEST_RUN) throw new Error('Invalid diagnostic configuration.');
// The direct diagnostic is not attached to a Detail wallet payment row.
const client = new Paynow(id, key, 'https://example.com/paynow-diagnostic', 'https://example.com/paynow-diagnostic');
const payment = client.createPayment(reference, email);
payment.add('Detail payment diagnostic', 2);
console.log(`Reference: ${reference}; amount USD 2.00; this does not credit a Detail wallet.`);
const result = await initiatePaynowMobile(client, payment, phone);
if (result.kind !== 'accepted') {
  console.log(`Initiation: ${result.kind}; category: ${result.reason}`);
  process.exitCode = 1;
} else {
  const poll = new URL(result.pollUrl);
  if (poll.protocol !== 'https:' || !['paynow.co.zw', 'www.paynow.co.zw'].includes(poll.hostname)) throw new Error('Untrusted status URL.');
  console.log('Initiation: accepted; Paynow returned a status link.');
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    try {
      const originalLog = console.log;
      let status;
      try { console.log = () => {}; status = await client.pollTransaction(poll.toString()); }
      finally { console.log = originalLog; }
      if (String(status.reference) !== reference || Number(status.amount) !== 2) throw new Error('Unexpected status response.');
      const value = String(status.status).toLowerCase().replace(/[^a-z _-]/g, '').slice(0, 40);
      console.log(`Status check ${i + 1}: ${value}`);
      if (['paid', 'cancelled', 'canceled', 'failed', 'refunded'].includes(value)) break;
    } catch {
      console.log(`Status check ${i + 1}: could not verify response.`);
      break;
    }
  }
}
