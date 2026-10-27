import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const dashboardUrl = process.env.DASHBOARD_URL || 'https://dashboard.detailapp.co.zw/admin';
const publicUrl = process.env.PUBLIC_SITE_URL || 'https://detailapp.co.zw';
const blogUrl = process.env.BLOG_URL || 'https://blog.detailapp.co.zw';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
if (!email || !password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in the workflow secrets.');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));

try {
  await page.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('body').filter({ hasText: 'Detail' }).waitFor({ state: 'visible', timeout: 30000 });
  if ((await page.locator('body').innerText()).length < 250) throw new Error('The marketing homepage rendered without its content.');
  if (await page.locator('form.waitlist').count()) {
    await page.locator('form.waitlist').scrollIntoViewIfNeeded();
    await page.getByLabel('Full name').waitFor({ state: 'visible' });
    await page.getByRole('radio', { name: /No, I do not want to receive marketing emails/ }).waitFor({ state: 'visible' });
    const valid = await page.locator('form.waitlist').evaluate((form) => form.checkValidity());
    if (valid) throw new Error('The empty waitlist form should be blocked by required-field validation.');
    console.log('PASS waitlist form and consent controls (no submission)');
  } else {
    await page.getByRole('status').filter({ hasText: 'waitlist is temporarily paused' }).waitFor({ state: 'visible' });
    console.log('PASS waitlist paused state');
  }
  console.log('PASS marketing homepage');
  await page.goto(`${publicUrl}/privacy`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Privacy Policy', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  console.log('PASS marketing privacy page');
  await page.goto(`${publicUrl}/terms`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Terms of Use', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  console.log('PASS marketing terms page');

  await page.goto(blogUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.blog-site main h1, .blog-site main h2').first().waitFor({ state: 'visible', timeout: 30000 });
  const blogError = await page.getByRole('heading', { name: 'We could not load that page.', exact: true }).count();
  if (blogError) throw new Error('The blog screen reported that public articles could not load.');
  console.log('PASS public blog listing');

  await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('heading', { name: 'Admin sign in', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ state: 'visible', timeout: 45000 });

  const routes = [
    ['Overview', 'Overview'], ['Bookings', 'Bookings'], ['Customers', 'Customers'],
    ['Cleaners', 'Cleaners / Staff'], ['Payments / Refunds', 'Payments / Refunds'],
    ['Products', 'After-sales Products'], ['Analytics', 'Analytics'], ['Support Cases', 'Support Cases'],
    ['Waitlist & Email', 'Waitlist & Email'], ['Blog & GEO', 'Blog & GEO'],
    ['Admins & Security', 'Admins & Security'], ['Settings', 'Settings'],
  ];
  for (const [label, heading] of routes) {
    const navButton = page.locator('aside nav button').filter({ hasText: label });
    await navButton.waitFor({ state: 'visible', timeout: 20000 });
    await navButton.click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(400);
    if (await page.locator('.inline-error, .admin-state.error').count()) {
      const message = (await page.locator('.inline-error, .admin-state.error').first().innerText()).slice(0, 240);
      throw new Error(`${label} loaded with an admin API error: ${message}`);
    }
    console.log(`PASS dashboard ${label}`);
    if (label === 'Admins & Security') {
      const mfaPrompt = await page.getByText(/authenticator code|multi.factor authentication/i).count();
      if (mfaPrompt) throw new Error('The admin screen still requires an authenticator code.');
      await page.getByRole('heading', { name: 'Current administrators', exact: true }).waitFor({ state: 'visible' });
    }
    if (label === 'Bookings') {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Bookings', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      console.log('PASS dashboard routed reload');
    }
  }
  if (runtimeErrors.length) throw new Error(`Browser runtime errors: ${runtimeErrors.slice(0, 3).join(' | ')}`);
  console.log('LIVE_DASHBOARD_SMOKE_PASSED');
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/dashboard-failure.png', fullPage: true }).catch(() => undefined);
  console.error(error instanceof Error ? error.message : 'Dashboard smoke test failed.');
  process.exitCode = 1;
} finally {
  await browser.close();
}
