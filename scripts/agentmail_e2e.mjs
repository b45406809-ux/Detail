import { writeFile } from 'node:fs/promises';
const email = 'pixel-studio-f7f3df@agentmail.to';
const key = process.env.AGENTMAIL_API_KEY;
const supabase = process.env.SUPABASE_URL?.replace(/\/$/, '');
const service = process.env.SUPABASE_SECRET_KEY;
if (!key || !supabase || !service) throw new Error('Missing AgentMail or Supabase credentials.');
async function request(url, headers) {
  const result = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!result.ok) throw new Error(`Provider request failed with HTTP ${result.status}.`);
  return result.json();
}
if (process.argv[2] === 'check') {
  for (let page = 1; page <= 100; page++) {
    const data = await request(`${supabase}/auth/v1/admin/users?page=${page}&per_page=100`, { apikey: service });
    const users = data.users || [];
    if (users.some(user => user.email?.toLowerCase() === email)) throw new Error('The test inbox already has a Supabase account; stopping to avoid changing it.');
    if (users.length < 100) { console.log('INBOX_ACCOUNT_AVAILABLE'); process.exit(0); }
  }
  throw new Error('Could not rule out an existing account within the pagination limit.');
}
if (process.argv[2] === 'code') {
  const started = Number(process.env.TEST_STARTED_MS);
  if (!started) throw new Error('Missing test start time.');
  const base = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(email)}/messages`;
  for (let attempt = 0; attempt < 24; attempt++) {
    const list = await request(`${base}?limit=20&labels=received`, { authorization: `Bearer ${key}` });
    for (const item of list.messages || []) {
      if (Date.parse(item.timestamp || item.created_at || '') < started - 5000) continue;
      if (!/confirm|verif|detail/i.test(item.subject || '')) continue;
      const msg = await request(`${base}/${encodeURIComponent(item.message_id)}`, { authorization: `Bearer ${key}` });
      const body = msg.extracted_text || msg.text || String(msg.html || '').replace(/<[^>]*>/g, ' ');
      const match = body.match(/\b\d{6}\b/);
      if (match) {
        console.log(`::add-mask::${match[0]}`);
        await writeFile(`${process.env.RUNNER_TEMP}/detail-email-code`, match[0], { mode: 0o600 });
        console.log('EMAIL_VERIFICATION_CODE_RECEIVED');
        process.exit(0);
      }
      throw new Error('Confirmation email arrived but did not contain a six-digit code.');
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('No new verification email arrived within two minutes.');
}
throw new Error('Use check or code.');
