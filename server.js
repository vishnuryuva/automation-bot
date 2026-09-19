const { chromium } = require('playwright');
const http = require('http');

// ---------- Config ----------
const BASE_URL = 'https://mahavishnueducational.com';
const REG_NO = process.env.REG_NO || '99999999';
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 5 * 60 * 1000;
const PORT = process.env.PORT || 10000;
const ERROR_TEXT = 'Reg No Incorrect!';
const FORM_PAGE = `${BASE_URL}/mark`; // GET page that shows the form (it POSTs to /markview)
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------- State ----------
let lastRun = { time: null, result: 'not run yet' };
let loginContext = null; // long-lived context that keeps the login page open
let loginPage = null;

// ---------- Health-check server (for Render etc.) ----------
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'Playwright Automation Bot Running', lastRun }));
  })
  .listen(PORT, () => console.log(`Health check server listening on port ${PORT}`));

// ---------- Helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function dumpDiagnostics(page, tag) {
  try {
    log(`[diag] URL:   ${page.url()}`);
    log(`[diag] Title: ${await page.title()}`);
    log(
      `[diag] forms=${await page.locator('form').count()}, ` +
        `user_id inputs=${await page.locator('input[name="user_id"]').count()}, ` +
        `submit buttons=${await page.locator('button[name="submit"]').count()}`
    );
    const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 400);
    log(`[diag] Body starts with: ${JSON.stringify(text)}`);
    const file = `debug-${tag}-${Date.now()}.png`;
    await page.screenshot({ path: file, fullPage: true });
    log(`[diag] Screenshot saved: ${file}`);
  } catch (e) {
    log('[diag] Could not collect diagnostics:', e.message);
  }
}

// ---------- Login page (own persistent context, stays open) ----------
async function closeLoginContext() {
  if (loginContext) await loginContext.close().catch(() => {});
  loginContext = null;
  loginPage = null;
}

async function loadLoginPage(browser) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Close the previous login session, open a fresh one
      await closeLoginContext();

      loginContext = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 800 },
      });
      loginPage = await loginContext.newPage();
      loginPage.setDefaultTimeout(20000);

      const resp = await loginPage.goto(`${BASE_URL}/login`, {
        waitUntil: 'load',
        timeout: 60000,
      });
      log(`Login page HTTP ${resp ? resp.status() : '??'} -> ${loginPage.url()}`);

      // Confirm the login form actually rendered
      await loginPage
        .locator('input[type="password"], form')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 });

      await loginPage.screenshot({ path: 'login-page.png' });
      log('Login page loaded and form is visible (screenshot: login-page.png).');
      return true;
    } catch (e) {
      log(`Login page attempt ${attempt} failed:`, e.message.split('\n')[0]);
      await sleep(2000);
    }
  }
  return false;
}

// ---------- One automation run ----------
async function runOnce(browser) {
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    log('Navigating to mark form page...');
    const resp = await page.goto(FORM_PAGE, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    log(`Loaded with HTTP ${resp ? resp.status() : '??'}`);

    // Scope everything to the real form: <form id="supervisor">
    const form = page.locator('form#supervisor');
    await form.waitFor({ state: 'visible' });

    log('Filling Roll No...');
    const input = form.locator('input[name="user_id"]');
    await input.fill(REG_NO);

    // Submit button (NOT the "Back" button, which is also type="submit")
    log('Clicking Submit...');
    const submit = form.locator('button[name="submit"]');
    await submit.waitFor({ state: 'visible' });

    const [postResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/markview'),
        { timeout: 30000 }
      ),
      submit.click(),
    ]);
    log(`POST /markview -> HTTP ${postResp.status()}`);
    await page.waitForLoadState('load');

    // Wait briefly for the error banner: <div class="alert">Reg No Incorrect!</div>
    const banner = page.locator('.alert', { hasText: ERROR_TEXT });
    const hasError = await banner
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    log(`Final URL after submit: ${page.url()}`);

    if (hasError) {
      log(`RESULT: "${ERROR_TEXT}" detected on live site.`);
      log('Loading login page...');
      const ok = await loadLoginPage(browser);
      lastRun = {
        time: new Date().toISOString(),
        result: ok ? 'reg-no-incorrect, login-page-loaded' : 'reg-no-incorrect, login-page-FAILED',
      };
    } else {
      log('RESULT: No error banner - page content changed (marks may be showing).');
      lastRun = { time: new Date().toISOString(), result: 'no-error-banner' };
      await dumpDiagnostics(page, 'no-error');
    }
  } catch (err) {
    log('Automation error:', err.message);
    lastRun = { time: new Date().toISOString(), result: `error: ${err.message.split('\n')[0]}` };
    await dumpDiagnostics(page, 'error');
  } finally {
    // Only closes the form-checking context; the login context stays open
    await context.close().catch(() => {});
  }
}

// ---------- Main loop (sequential, no overlapping runs) ----------
async function main() {
  let browser = null;

  const shutdown = async () => {
    await closeLoginContext();
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  while (true) {
    try {
      if (!browser || !browser.isConnected()) {
        // Old login context died with the old browser
        loginContext = null;
        loginPage = null;
        browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
      }
      log('--- Run start ---');
      await runOnce(browser);
      log('--- Run finished ---');
    } catch (e) {
      log('Fatal run error:', e.message);
      loginContext = null;
      loginPage = null;
      if (browser) await browser.close().catch(() => {});
      browser = null;
    }
    await sleep(INTERVAL_MS);
  }
}

main();