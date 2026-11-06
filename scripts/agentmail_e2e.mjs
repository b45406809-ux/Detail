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
async function backend(path, method = 'GET', body) {
  const result = await fetch(`${supabase}${path}`, {
    method,
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      'content-type': 'application/json',
      ...(method === 'DELETE' ? { Prefer: 'return=minimal' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await result.text();
  let value = null;
  try { value = text ? JSON.parse(text) : null; } catch { /* status is sufficient for cleanup */ }
  if (!result.ok) throw new Error(`Test account cleanup failed with HTTP ${result.status}.`);
  return value;
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
if (process.argv[2] === 'cleanup') {
  let account = null;
  for (let page = 1; page <= 100; page++) {
    const data = await backend(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const users = data.users || [];
    account = users.find(user => user.email?.toLowerCase() === email) ?? account;
    if (account || users.length < 100) break;
  }
  if (!account) {
    console.log('AGENTMAIL_TEST_ACCOUNT_ALREADY_ABSENT');
    process.exit(0);
  }
  const id = encodeURIComponent(account.id);
  const [jobs, payments] = await Promise.all([
    backend(`/rest/v1/jobs?select=id&or=(customerid.eq.${id},cleanerid.eq.${id})`),
    backend(`/rest/v1/payments?select=id&or=(customerid.eq.${id},cleanerid.eq.${id})`),
  ]);
  if (jobs.length || payments.length) {
    throw new Error(`AgentMail account cleanup stopped: ${jobs.length} job and ${payments.length} payment records require review.`);
  }
  const closed = await backend('/rest/v1/rpc/close_account', 'POST', { p_user_id: account.id });
  if (closed !== true) throw new Error('AgentMail account privacy close did not confirm.');
  await backend(`/rest/v1/legaldocumentacceptances?userid=eq.${id}`, 'DELETE');
  await backend(`/auth/v1/admin/users/${id}`, 'DELETE');
  const [profile, login] = await Promise.all([
    backend(`/rest/v1/users?select=id,email,displayname,accountdeletedat&id=eq.${id}`),
    fetch(`${supabase}/auth/v1/admin/users/${id}`, { headers: { apikey: service }, signal: AbortSignal.timeout(20000) }),
  ]);
  const sanitized = profile.length === 0 || (profile[0].email === '' && profile[0].displayname === 'Deleted user' && !!profile[0].accountdeletedat);
  if (!sanitized || login.status !== 404) throw new Error('AgentMail account cleanup could not verify profile sanitization and login removal.');
  console.log('AGENTMAIL_TEST_ACCOUNT_CLEANED_AND_VERIFIED');
  process.exit(0);
}
if (process.argv[2] === 'verify') {
  let account = null;
  for (let page = 1; page <= 100; page++) {
    const data = await backend(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const users = data.users || [];
    account = users.find(user => user.email?.toLowerCase() === email) ?? account;
    if (account || users.length < 100) break;
  }
  if (!account?.email_confirmed_at) throw new Error('AgentMail signup did not persist a confirmed Auth user.');
  const id = encodeURIComponent(account.id);
  const [profiles, jobs, payments] = await Promise.all([
    backend(`/rest/v1/users?select=id,role,displayname,hascompletedprofile,hasagreedtoterms,hassetuppermissions&id=eq.${id}`),
    backend(`/rest/v1/jobs?select=id&or=(customerid.eq.${id},cleanerid.eq.${id})`),
    backend(`/rest/v1/payments?select=id&or=(customerid.eq.${id},cleanerid.eq.${id})`),
  ]);
  const profile = profiles[0];
  if (profiles.length !== 1 || profile.role !== 'CUSTOMER'
    || profile.displayname !== 'E2E AgentMail Customer'
    || profile.hascompletedprofile !== true || profile.hasagreedtoterms !== true
    || profile.hassetuppermissions !== true || jobs.length || payments.length) {
    throw new Error('AgentMail profile/agreement persistence did not match the expected synthetic customer state.');
  }
  console.log('AGENTMAIL_SIGNUP_PROFILE_AGREEMENT_AND_PERMISSION_STATE_VERIFIED');
  process.exit(0);
}
throw new Error('Use check or code.');
