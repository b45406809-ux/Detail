import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendFile } from 'node:fs/promises';

const command = process.argv[2];
if (!['create', 'cleanup'].includes(command)) throw new Error('Use create or cleanup.');

const status = spawnSync('supabase', ['status', '--output', 'env'], { encoding: 'utf8' });
if (status.status !== 0) throw new Error('Local Supabase status is unavailable.');
const local = {};
for (const line of status.stdout.split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (!match) continue;
  local[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const testUrl = local.API_URL || local.SUPABASE_URL;
const serviceKey = local.SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = local.ANON_KEY || local.SUPABASE_ANON_KEY;
if (!testUrl || !serviceKey || !anonKey) throw new Error('Local Supabase did not report its URL and API keys.');
if (process.env.GITHUB_ENV) {
  console.log(`::add-mask::${serviceKey}`);
  await appendFile(process.env.GITHUB_ENV, `SUPABASE_TEST_URL=${testUrl}\nSUPABASE_TEST_ANON_KEY=${anonKey}\nSUPABASE_TEST_SERVICE_ROLE_KEY=${serviceKey}\n`);
}

const child = spawnSync(process.execPath, [fileURLToPath(new URL('./qa_fixture_pool.mjs', import.meta.url)), command], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SUPABASE_TEST_URL: testUrl,
    SUPABASE_TEST_SERVICE_ROLE_KEY: serviceKey,
    SUPABASE_PRODUCTION_URL: process.env.SUPABASE_PRODUCTION_URL || 'https://production.invalid.example',
    SUPABASE_PRODUCTION_PROJECT_REF: process.env.SUPABASE_PRODUCTION_PROJECT_REF || 'productionprojectref',
    QA_TEST_BACKEND_KIND: 'local',
    QA_ALLOW_LOCAL: 'true',
  },
});
if (child.error) throw child.error;
if (child.status !== 0) process.exitCode = child.status ?? 1;
