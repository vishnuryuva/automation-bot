const { chromium } = require('playwright');
const http = require('http');

// ---------- Config ----------
const BASE_URL = 'https://mahavishnueducational.com';
const REG_NO = process.env.REG_NO || '99999999';
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 5 * 60 * 1000;
const PORT = process.env.PORT || 10000;
const ERROR_TEXT = 'Reg No Incorrect!';

// ---------- Health-check server (for Render etc.) ----------
let lastRun = { time: null, result: 'not run yet' };

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
    log(`[diag] forms=${await page.locator('form').count()}, ` +
        `user_id inputs=${await page.locator('input[name="user_id"]').count()}, ` +
        `submit buttons=${await page.locator('button[name="submit"]').count()}`);
    const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 400);
    log(`[diag] Body starts with: ${JSON.stringify(text)}`);
    const file = `debug-${tag}-${Date.now()}.png`;
    await page.screenshot({ path: file, fullPage: true });
    log(`[diag] Screenshot saved: ${file}`);
  } catch (e) {
    log('[diag] Could not collect diagnostics:', e.message);
  }
}

// ---------- One automation run ----------
async function runOnce(browser) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    log('Navigating to markview...');
    const resp = await page.goto(`${BASE_URL}/markview`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    log(`Loaded with HTTP ${resp ? resp.status() : '??'}`);

    // Scope everything to the real form: <form id="supervisor">
    const form = page.locator('form#supervisor');
    await form.waitFor({ state: 'visible' });

    // <input type="text" id="user_id" name="user_id" placeholder="Roll No" required>
    log('Filling Roll No...');
    const input = form.locator('input[name="user_id"]');
    await input.fill(REG_NO);

    // <button class="form-control btn btn-primary" name="submit">Submit</button>
    // (NOT the "Back" button, which is also type="submit")
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

    // Check for the error banner: <div class="alert">Reg No Incorrect!</div>
    const banner = page.locator('.alert', { hasText: ERROR_TEXT });
    const hasError = (await banner.count()) > 0;

    if (hasError) {
      log(`RESULT: "${ERROR_TEXT}" detected on live site.`);
      lastRun = { time: new Date().toISOString(), result: 'reg-no-incorrect' };

      log('Navigating to login page...');
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      log(`Now at: ${page.url()}`);
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
    await context.close();
  }
}

// ---------- Main loop (sequential, no overlapping runs) ----------
async function main() {
  let browser = null;

  const shutdown = async () => {
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  while (true) {
    try {
      if (!browser || !browser.isConnected()) {
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
      if (browser) await browser.close().catch(() => {});
      browser = null;
    }
    await sleep(INTERVAL_MS);
  }
}

main();