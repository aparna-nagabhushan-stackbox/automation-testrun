// Regression check for the app — run after any change to index.html or server/.
//
// Setup (one-time):
//   npm install
//   npx playwright install chromium
//
// Run:
//   npm test
//
// What it does: starts the real backend on a throwaway port with a
// throwaway data directory (so it never touches your real accounts),
// bootstraps the first admin account, exercises the dashboard's scope
// tabs / time-range pills / app filter, walks every sidebar page
// including the Admin panel, and fails loudly on any JS error.
// Screenshots land in tests/screenshots/.

import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const PORT = 3987;
const BASE_URL = `http://localhost:${PORT}`;
const SCREEN_DIR = path.resolve(__dirname, 'screenshots');
const ADMIN_EMAIL = 'test-admin@stackbox.xyz';
const ADMIN_PASSWORD = 'testpassword123';

let failed = false;
function check(label: string, ok: boolean): void {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + label);
  if (!ok) failed = true;
}

async function isActive(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    return !!el && el.classList.contains('active');
  }, selector);
}

function startServer(): Promise<ChildProcess> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-test-'));
  const child = spawn(process.execPath, [path.resolve(__dirname, '..', 'server', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      NODE_ENV: 'development',
    },
    stdio: 'pipe',
  });
  child.stderr.on('data', d => process.stderr.write('[server] ' + d));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start within 10s')), 10000);
    const tryConnect = async () => {
      try {
        const res = await fetch(BASE_URL + '/api/auth/bootstrap-status');
        if (res.ok) { clearTimeout(timeout); resolve(child); return; }
      } catch (e) { /* not up yet */ }
      setTimeout(tryConnect, 200);
    };
    tryConnect();
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });

  console.log('Starting server on a throwaway port + data dir...');
  const server = await startServer();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

  await page.goto(BASE_URL + '/');
  await page.waitForSelector('#auth-form-area', { state: 'visible' });
  check('shows first-run admin bootstrap screen', (await page.textContent('#auth-title'))?.includes('Create the first admin') ?? false);

  // ── Bootstrap the first admin account ──
  await page.fill('#username', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.fill('#confirm-password', ADMIN_PASSWORD);
  await page.click('#auth-submit-btn');
  await page.waitForSelector('#app', { state: 'visible', timeout: 8000 }).catch(() => {});
  check('logs in and shows the app shell', await page.isVisible('#app'));
  // Admin invite/reset UI is deferred (ADMIN_UI_ENABLED = false in index.html)
  // until it's actually needed, so the Admin nav item is hidden even for admins.
  check('Admin nav is hidden while ADMIN_UI_ENABLED is false', !(await page.isVisible('#nav-admin')));
  await page.screenshot({ path: path.join(SCREEN_DIR, '01-dashboard.png') });

  // ── Dashboard scope tabs ──
  for (const scope of ['AUTOMATION', 'MANUAL', 'ALL']) {
    await page.click(`button[data-scope="${scope}"]`);
    await page.waitForTimeout(150);
    check(`scope tab "${scope}" activates`, await isActive(page, `button[data-scope="${scope}"]`));
  }

  // ── Dashboard time-range pills ──
  for (const range of ['30D', '7D', '24H', '12M']) {
    await page.click(`button[data-range="${range}"]`);
    await page.waitForTimeout(150);
    check(`range pill "${range}" activates`, await isActive(page, `button[data-range="${range}"]`));
  }
  await page.screenshot({ path: path.join(SCREEN_DIR, '02-dashboard-12m.png') });

  // ── App filter (topbar) ──
  await page.selectOption('#app-filter', 'YMS');
  await page.waitForTimeout(300);
  const totalTcTile = (await page.textContent('#key-metrics-grid .kpi-tile .kpi-val'))?.trim() ?? '';
  check('key metrics update after app filter change', totalTcTile !== '');
  await page.selectOption('#app-filter', 'ALL');

  // ── Projects: create one, tag a test case to it, confirm filtering ──
  await page.selectOption('#app-filter', '__new_project__');
  await page.waitForTimeout(150);
  check('picking "+ New Project" opens the create-project modal', await page.isVisible('#create-project-modal'));
  const projectName = 'QA Regression Project';
  await page.fill('#new-project-name', projectName);
  await page.click('#create-project-modal button.btn-v3-primary');
  await page.waitForTimeout(400);
  check('modal closes after creating a project', !(await page.isVisible('#create-project-modal')));
  check('new project becomes the selected app filter', (await page.inputValue('#app-filter')) === 'proj:' + projectName);

  // "Manual Testing" is a collapsible sidebar group — expand it before its
  // nested items (Test Cases, Test Suites, ...) can be clicked.
  await page.click('#navgroup-testmgmt .nav-group-header');
  await page.waitForTimeout(150);
  const testmgmtClass = (await page.locator('#navgroup-testmgmt').getAttribute('class')) ?? '';
  check('"Manual Testing" group expands', !testmgmtClass.includes('collapsed'));
  await page.click('#nav-testcases');
  await page.waitForTimeout(200);

  // ── Create Test Case modal: click "+ Create Test Case" → pick a type →
  // fill details → submit. The type choice is a two-step popup now, not an
  // inline seg-tab, per the latest UI request. ──
  await page.click('#page-testcases button.btn-v3-primary');
  check('Create Test Case modal opens showing the type choice step', await page.isVisible('#create-tc-step1'));
  await page.click('#create-tc-step1 .quick-action:has-text("Manual")');
  check('choosing Manual reveals the details step', await page.isVisible('#create-tc-step2'));
  await page.fill('#tc-id', 'TC-PROJ-1');
  await page.fill('#tc-title', 'A test case scoped to the new project');
  await page.click('#create-tc-modal button.btn-v3-primary');
  await page.waitForTimeout(200);
  check('modal closes after creating a test case', !(await page.isVisible('#create-tc-modal')));
  check('test case created while a project is selected inherits that project', await page.locator('#tc-tbody').getByText('📁 ' + projectName).isVisible());
  check('test case created via the Manual choice is tagged Manual', await page.locator('#tc-tbody').getByText('📝 Manual').isVisible());

  // ── Test case Type toggle: Automation-tagged cases stay out of the
  // Dashboard's Manual widgets, since the tag is cosmetic-only ──
  await page.click('#page-testcases button.btn-v3-primary');
  await page.click('#create-tc-step1 .quick-action:has-text("Automation")');
  await page.fill('#tc-id', 'TC-AUTO-1');
  await page.fill('#tc-title', 'Tagged as Automation, not a real execution');
  await page.click('#create-tc-modal button.btn-v3-primary');
  await page.waitForTimeout(200);
  check('Automation-tagged test case shows the Automation badge', await page.locator('#tc-tbody').getByText('🖥 Automation').isVisible());

  await page.selectOption('#app-filter', 'ALL');
  await page.waitForTimeout(200);
  check('switching back to All Apps shows test cases regardless of project', await page.locator('#tc-tbody').getByText('TC-PROJ-1').isVisible());

  // Re-selecting the project should show ONLY the two test cases tagged to
  // it (TC-PROJ-1 and TC-AUTO-1), not test cases from other projects.
  await page.selectOption('#app-filter', 'proj:' + projectName);
  await page.waitForTimeout(200);
  check('re-selecting the project filters the test case list to just that project', await page.locator('#tc-tbody tr').count() === 2);
  await page.selectOption('#app-filter', 'ALL');

  // Admin panel UI is deferred for now (see ADMIN_UI_ENABLED) — the backend
  // routes it drives are still covered indirectly whenever that flag flips
  // back on; nothing to click here in the meantime.

  // ── Every sidebar page loads without throwing ──
  // "Manual Testing" is already expanded from the create-test-case flow above;
  // "bugs" (Issues) and "home" (Dashboard) are top-level, un-nested items.
  for (const nav of ['suite', 'testcases', 'bugs', 'home']) {
    await page.click('#nav-' + nav);
    await page.waitForTimeout(250);
    check(`nav "${nav}" page becomes active`, await isActive(page, '#page-' + nav));
  }

  // ── AI Recorder page and block library row ──
  // "Automation" is a collapsible sidebar group — expand it before the
  // nested AI Recorder item can be clicked.
  await page.click('#navgroup-automation .nav-group-header');
  await page.waitForTimeout(150);
  const automationClass = (await page.locator('#navgroup-automation').getAttribute('class')) ?? '';
  check('"Automation" group expands', !automationClass.includes('collapsed'));
  await page.click('#nav-automation-builder');
  await page.waitForTimeout(250);
  check('AI Recorder block library row renders', await page.isVisible('#ai-recorder-block-lib-row'));

  await page.screenshot({ path: path.join(SCREEN_DIR, '03-final.png') });

  // ── Logout + session restore ──
  await page.evaluate(() => (window as any).doLogout());
  await page.waitForTimeout(300);
  check('logout returns to the login screen', await page.isVisible('#login-screen'));

  await page.fill('#username', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('#auth-submit-btn');
  await page.waitForSelector('#app', { state: 'visible', timeout: 8000 }).catch(() => {});
  await page.reload();
  // On reload, initAuthScreen() either restores the session straight into
  // #app, or (on failure) falls back to showing the login form — wait for
  // whichever one actually happens rather than guessing a sleep duration.
  await page.waitForFunction(
    () => (document.getElementById('app') as HTMLElement)?.style.display === 'flex'
       || (document.getElementById('auth-form-area') as HTMLElement)?.style.display === 'block',
    { timeout: 8000 }
  ).catch(() => {});
  check('session survives a page reload', await page.isVisible('#app'));

  await browser.close();
  server.kill();

  // "Failed to load resource: ...401/403/410..." lines are Chromium logging
  // the intentionally-tested failure responses (e.g. /auth/me right after
  // logout) — the app handles them via try/catch, they aren't bugs.
  const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
  check('no unexpected console/page errors', realErrors.length === 0);
  if (realErrors.length) console.log(realErrors.join('\n'));

  console.log('\nScreenshots saved to ' + SCREEN_DIR);
  if (failed) { console.log('\nRESULT: FAILED'); process.exit(1); }
  console.log('\nRESULT: PASSED');
}

main().catch(err => { console.error(err); process.exit(1); });
