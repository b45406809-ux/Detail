const allowedOrigin = Deno.env.get('APP_RETURN_URL') ?? 'detail://payment-return';
Deno.serve(request => {
  if (request.method !== 'GET') return new Response('GET required', { status: 405 });
  const incoming = new URL(request.url);
  const destination = new URL(allowedOrigin);
  // Carry only the merchant reference as a display hint. The app must refresh
  // its own server state; a browser return never marks a payment as paid.
  const reference = incoming.searchParams.get('reference');
  if (reference && /^[A-Za-z0-9_-]{1,160}$/.test(reference)) destination.searchParams.set('reference', reference);
  return Response.redirect(destination.toString(), 303);
});
