/** Use the configured egress relay for Paynow only. Never retry an initiation. */
export const paynowFetch: typeof fetch = (input, init) => {
  const relay = Deno.env.get('PAYNOW_RELAY_URL');
  const token = Deno.env.get('PAYNOW_RELAY_TOKEN');
  if (!relay && !token) return fetch(input, init);
  if (!relay || !token) throw new Error('Paynow relay is not fully configured.');
  const endpoint = new URL(relay);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Invalid Paynow relay URL.');
  const target = String(input);
  const initiating = target === 'https://www.paynow.co.zw/interface/remotetransaction';
  return fetch(new URL(initiating ? '/initiate' : '/poll', endpoint), {
    method: 'POST',
    body: initiating ? init?.body : target,
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: init?.signal,
  });
};
