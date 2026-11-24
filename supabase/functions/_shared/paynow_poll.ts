/** Poll Paynow and verify the signed status response before using its fields. */
export async function pollPaynowStatus(client: any, rawUrl: string, request: typeof fetch = fetch) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !['paynow.co.zw', 'www.paynow.co.zw'].includes(url.hostname)) {
    throw new Error('Untrusted Paynow poll URL.');
  }
  const response = await request(url.toString(), { method: 'POST', signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw new Error('Paynow status service is unavailable.');
  const result = client.parseStatusUpdate(await response.text());
  const reference = String(result?.reference ?? '');
  const status = String(result?.status ?? '');
  const amount = Number(result?.amount);
  if (!reference || !status || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Paynow returned an incomplete status result.');
  }
  return { reference, status, amount };
}
