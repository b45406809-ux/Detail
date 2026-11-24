// The Paynow SDK swallows transport and response parsing errors. Use its
// request builder and signature verification while keeping ambiguous outcomes
// distinct from an explicit provider rejection.
export async function initiatePaynowMobile(
  client: any, payment: any, phone: string,
  request: typeof fetch = fetch,
): Promise<{ kind: 'accepted'; pollUrl: string } | { kind: 'rejected'; reason: string } | { kind: 'unknown'; reason: string }> {
  client.validate(payment);
  if (typeof payment.authEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payment.authEmail)) {
    return { kind: 'rejected', reason: 'Invalid payment email address.' };
  }
  const built = client.buildMobile(payment, phone, 'ecocash');
  if (!built || built instanceof Error) return { kind: 'unknown', reason: 'request_build' };
  // SDK fields are URI encoded before hashing. Decode them before form
  // serialization so Paynow receives the original values, then sign those
  // exact values in their original order as specified by Paynow.
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(built)) {
    if (key !== 'hash') fields[key] = decodeURIComponent(String(value));
  }
  fields.amount = Number(payment.total()).toFixed(2);
  fields.hash = client.generateHash(fields, client.integrationKey);
  let response: Response;
  try {
    response = await request('https://www.paynow.co.zw/interface/remotetransaction', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(), signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { kind: 'unknown', reason: 'network_or_timeout' };
  }
  if (!response.ok) return { kind: 'unknown', reason: `http_${response.status}` };
  let result: any;
  try { result = client.parse(await response.text()); }
  catch { return { kind: 'unknown', reason: 'invalid_or_unverified_response' }; }
  if (result?.success === false) {
    const error = String(result.error ?? '').toLowerCase();
    const reason = error.includes('insufficient') ? 'EcoCash reported insufficient balance.'
      : error.includes('phone') || error.includes('mobile number') ? 'Paynow rejected the EcoCash mobile number.'
      : error.includes('integration') || error.includes('merchant') ? 'Paynow rejected the merchant integration. Contact Detail support.'
      : 'Paynow rejected the payment request. Contact Detail support with the payment reference.';
    return { kind: 'rejected', reason };
  }
  if (result?.success === true && result.pollUrl) return { kind: 'accepted', pollUrl: String(result.pollUrl) };
  return { kind: 'unknown', reason: 'missing_status_link' };
}
