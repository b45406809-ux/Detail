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
const failures = [];
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));

async function check(label, run) {
  try {
    await run();
    console.log(`PASS ${label}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'check failed';
    failures.push(`${label}: ${message}`);
    console.error(`FAIL ${label}: ${message}`);
    return false;
  }
}

try {
  await check('marketing homepage and waitlist', async () => {
    await page.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('body').filter({ hasText: 'Detail' }).waitFor({ state: 'visible', timeout: 30000 });
    if ((await page.locator('body').innerText()).length < 250) throw new Error('Homepage content is missing.');
    if (await page.locator('form.waitlist').count()) {
      await page.locator('form.waitlist').scrollIntoViewIfNeeded();
      await page.getByLabel('Full name').waitFor({ state: 'visible' });
      await page.getByRole('radio', { name: /No, I do not want to receive marketing emails/ }).waitFor({ state: 'visible' });
      if (await page.locator('form.waitlist').evaluate((form) => form.checkValidity())) {
        throw new Error('An empty waitlist form should be blocked by required-field validation.');
      }
    } else {
      await page.getByRole('status').filter({ hasText: 'waitlist is temporarily paused' }).waitFor({ state: 'visible' });
    }
  });

  await check('marketing privacy page', async () => {
    await page.goto(`${publicUrl}/privacy`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Privacy Policy', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  });
  await check('marketing terms page', async () => {
    await page.goto(`${publicUrl}/terms`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Terms of Use', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  });
  await check('public blog listing', async () => {
    await page.goto(blogUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.blog-site main h1, .blog-site main h2').first().waitFor({ state: 'visible', timeout: 30000 });
    if (await page.getByRole('heading', { name: 'We could not load that page.', exact: true }).count()) {
      throw new Error('Public articles could not load.');
    }
  });

  const loginOk = await check('admin password sign-in without MFA', async () => {
    await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByRole('heading', { name: 'Admin sign in', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ state: 'visible', timeout: 45000 });
  });

  if (loginOk) {
    const routes = [
      ['Overview', 'Overview'], ['Bookings', 'Bookings'], ['Customers', 'Customers'],
      ['Cleaners', 'Cleaners / Staff'], ['Payments / Refunds', 'Payments / Refunds'],
      ['Products', 'After-sales Products'], ['Analytics', 'Analytics'], ['Support Cases', 'Support Cases'],
      ['Waitlist & Email', 'Waitlist & Email'], ['Blog & GEO', 'Blog & GEO'],
      ['Admins & Security', 'Admins & Security'], ['Settings', 'Settings'],
    ];
    for (const [label, heading] of routes) {
      await check(`dashboard ${label}`, async () => {
        const navButton = page.locator('aside nav button').filter({ hasText: label });
        await navButton.waitFor({ state: 'visible', timeout: 20000 });
        await navButton.click();
        await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForTimeout(1000);
        const apiError = page.locator('.inline-error, .admin-state.error');
        if (await apiError.count()) throw new Error(`Admin API: ${(await apiError.first().innerText()).slice(0, 240)}`);
        if (label === 'Admins & Security') {
          if (await page.getByText(/authenticator code|multi.factor authentication/i).count()) {
            throw new Error('The admin screen still displays an authenticator requirement.');
          }
          await page.getByRole('heading', { name: 'Current administrators', exact: true }).waitFor({ state: 'visible' });
        }
        if (label === 'Bookings') {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.getByRole('heading', { name: 'Bookings', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
        }
      });
    }
  }

  if (runtimeErrors.length) failures.push(`browser runtime errors: ${runtimeErrors.slice(0, 5).join(' | ')}`);
  if (failures.length) {
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/dashboard-failure.png', fullPage: true }).catch(() => undefined);
    console.error(`LIVE_DASHBOARD_SMOKE_FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('LIVE_DASHBOARD_SMOKE_PASSED');
  }
} finally {
  await browser.close();
}
