Deno.serve(async request => {
  const token = Deno.env.get('PAYNOW_PROBE_ONETIME_SECRET');
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) return new Response(null, { status: 401 });
  const results = [];
  for (const [host, method] of [['www.paynow.co.zw', 'POST'], ['paynow.co.zw', 'POST'], ['www.paynow.co.zw', 'HEAD']]) {
    const started = Date.now();
    try {
      const reply = await fetch(`https://${host}/interface/remotetransaction`, {
        method, redirect: 'manual', signal: AbortSignal.timeout(6500),
        ...(method === 'POST' ? { body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}),
      });
      const location = reply.headers.get('location');
      const providerStatus = method === 'POST' && reply.ok
        ? new URLSearchParams((await reply.text()).slice(0, 2048).toLowerCase()).get('status') : null;
      results.push({ host, method, http: reply.status, redirectHost: location ? new URL(location, reply.url).hostname : null, providerError: providerStatus === 'error', elapsedMs: Date.now() - started });
    } catch (error) {
      const causes = [];
      let current = error;
      for (let i = 0; i < 4 && current instanceof Error; i++, current = current.cause) {
        causes.push(/reset by peer|ECONNRESET|os error 104/i.test(current.message) ? 'connection_reset' : current.name);
      }
      results.push({ host, method, causes, elapsedMs: Date.now() - started });
    }
  }
  return Response.json({ region: Deno.env.get('SB_REGION') ?? null, results });
});
