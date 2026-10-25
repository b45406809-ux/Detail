import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL?.trim();
const publicKey = process.env.SUPABASE_PUBLIC_ANON?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !publicKey || !secretKey) {
  console.log(`SDK_SUPABASE_URL: ${url ? 'SET' : 'MISSING'}`);
  console.log(`SDK_SUPABASE_PUBLIC_KEY: ${publicKey ? 'SET' : 'MISSING'}`);
  console.log(`SDK_SUPABASE_SECRET_KEY: ${secretKey ? 'SET' : 'MISSING'}`);
  process.exit(1);
}

async function probe(label, key) {
  let status = 'NETWORK';
  const sdkFetch = async (input, init) => {
    const response = await globalThis.fetch(input, init);
    status = String(response.status);
    return response;
  };
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: sdkFetch },
  });

  // This is a read-only schema check. The zero-row limit prevents data access.
  const { error } = await client.from('configuration').select('key').limit(0);
  console.log(`SDK_${label}_HTTP: ${status}`);
  if (!error) {
    console.log(`SDK_${label}_RESULT: PASS`);
    return true;
  }

  const details = [error.code, error.message]
    .filter((value) => typeof value === 'string')
    .map((value) => value.replaceAll(key, '[redacted]').replace(/[\r\n]+/g, ' ').slice(0, 160));
  if (details.length) console.log(`SDK_${label}_ERROR: ${details.join(' | ')}`);
  // PostgREST can reject a valid public key at the table-privilege layer.
  // 401 means key/auth rejection; 403 means the API accepted auth but denied access.
  const accepted = status === '403';
  console.log(`SDK_${label}_RESULT: ${accepted ? 'AUTH_ACCEPTED_TABLE_DENIED' : 'FAIL'}`);
  return accepted;
}

const publicPassed = await probe('PUBLIC', publicKey);
const secretPassed = await probe('SECRET', secretKey);
process.exit(publicPassed && secretPassed ? 0 : 1);
