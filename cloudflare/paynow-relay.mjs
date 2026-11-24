// The caller signs payment messages and verifies Paynow responses in Supabase.
const target = 'https://www.paynow.co.zw/interface/remotetransaction';

function pollUrl(value) {
  const url = new URL(value);
  if (!['https://www.paynow.co.zw', 'https://paynow.co.zw'].includes(url.origin) ||
      url.username || url.password || url.hash ||
      !/^\/interface\/checkpayment\/?$/i.test(url.pathname)) throw new Error('Invalid Paynow status URL');
  const guid = url.searchParams.get('guid');
  if (url.searchParams.size !== 1 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(guid ?? '')) {
    throw new Error('Invalid Paynow status reference');
  }
  return url;
}

export default {
  async fetch(request, env) {
    const expected = env.PAYNOW_RELAY_TOKEN;
    const supplied = request.headers.get('authorization') ?? '';
    if (!expected || supplied.length !== expected.length + 7 ||
        !crypto.subtle.timingSafeEqual(new TextEncoder().encode(supplied), new TextEncoder().encode(`Bearer ${expected}`))) {
      return new Response(null, { status: 401 });
    }
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/initiate', '/poll'].includes(path)) return new Response(null, { status: 404 });
    const body = await request.text();
    if (body.length > 8192) return new Response(null, { status: 413 });
    let url;
    try { url = path === '/poll' ? pollUrl(body) : target; }
    catch { return new Response(null, { status: 400 }); }
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        ...(path === '/initiate' ? { body, headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-detail-relay': 'upstream' },
      });
    } catch {
      return new Response(null, { status: 502, headers: { 'x-detail-relay': 'connect-failed' } });
    }
  },
};
