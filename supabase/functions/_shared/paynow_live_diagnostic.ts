import { Paynow } from 'npm:paynow@2.2.2';
import { initiatePaynowMobile } from './paynow_mobile.ts';

const id = Deno.env.get('PAYNOW_TEST_ID') ?? '';
const key = Deno.env.get('PAYNOW_TEST_KEY') ?? '';
const phone = (Deno.env.get('PAYNOW_TEST_PHONE') ?? '').replace(/[ +().-]/g, '').replace(/^263/, '0');
const email = Deno.env.get('PAYNOW_TEST_EMAIL') ?? '';
const reference = `DETAIL-DIAG-${Deno.env.get('PAYNOW_TEST_RUN') ?? ''}`;
if (id !== '27890' || !key || !/^07[78][0-9]{7}$/.test(phone) || !email || !Deno.env.get('PAYNOW_TEST_RUN')) {
  throw new Error('Invalid diagnostic configuration.');
}
// This standalone diagnostic has no Detail payment row; avoid sending its
// callbacks to the production wallet webhook.
const client = new Paynow(id, key, 'https://example.com/paynow-diagnostic', 'https://example.com/paynow-diagnostic');
const payment = client.createPayment(reference, email);
payment.add('Detail payment diagnostic', 2);
console.log(`Diagnostic reference: ${reference}; amount: USD 2.00; this payment does not fund a Detail wallet.`);
const result = await initiatePaynowMobile(client, payment, phone);
if (result.kind !== 'accepted') {
  console.log(`Initiation: ${result.kind}; category: ${result.reason}`);
  Deno.exit(1);
}
const poll = new URL(result.pollUrl);
if (poll.protocol !== 'https:' || !['paynow.co.zw', 'www.paynow.co.zw'].includes(poll.hostname)) throw new Error('Untrusted poll URL.');
console.log('Initiation: accepted; Paynow returned a status link.');
for (let i = 0; i < 6; i++) {
  await new Promise(resolve => setTimeout(resolve, 10000));
  try {
    const originalLog = console.log;
    let status;
    try {
      console.log = () => {};
      status = await client.pollTransaction(poll.toString());
    } finally { console.log = originalLog; }
    if (String(status.reference) !== reference || Number(status.amount) !== 2) throw new Error('Status reference or amount did not match.');
    const value = String(status.status).toLowerCase();
    console.log(`Status check ${i + 1}: ${value.replace(/[^a-z _-]/g, '').slice(0, 40)}`);
    if (['paid', 'cancelled', 'canceled', 'failed', 'refunded'].includes(value)) break;
  } catch {
    console.log(`Status check ${i + 1}: could not verify response.`);
    break;
  }
}
