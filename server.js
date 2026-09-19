const { chromium } = require('playwright');
const http = require('http');

// ---------- Config ----------
const BASE_URL = 'https://mahavishnueducational.com';
const FORM_PAGE = `${BASE_URL}/mark`;      // shows the form (POSTs to /markview)
const LOGIN_URL = `${BASE_URL}/login`;
const ERROR_TEXT = 'Reg No Incorrect!';
const PORT = process.env.PORT || 10000;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 3; // parallel browser sessions
const MAX_QUEUE = Number(process.env.MAX_QUEUE) || 50;          // waiting users before we say "busy"
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS) || 45000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const stats = { started: new Date().toISOString(), total: 0, valid: 0, invalid: 0, errors: 0 };

// ---------- Shared browser (one browser, one fresh context per user) ----------
let browser = null;
let browserPromise = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
      .then((b) => {
        browser = b;
        b.on('disconnected', () => {
          log('Browser disconnected - will relaunch on next request');
          browser = null;
        });
        log('Browser launched');
        return b;
      })
      .finally(() => {
        browserPromise = null;
      });
  }
  return browserPromise;
}

// ---------- Concurrency limiter (queue) ----------
let active = 0;
const waiting = [];

function acquire() {
  return new Promise((resolve, reject) => {
    if (active < MAX_CONCURRENT) {
      active++;
      resolve();
    } else if (waiting.length >= MAX_QUEUE) {
      reject(new Error('BUSY'));
    } else {
      waiting.push(resolve);
    }
  });
}

function release() {
  const next = waiting.shift();
  if (next) next(); // hand the slot straight to the next user
  else active--;
}

// ---------- Automation for ONE user ----------
function injectBase(html) {
  const tag = `<base href="${BASE_URL}/">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
}

async function checkRegNo(regNo) {
  const b = await getBrowser();
  const context = await b.newContext({ userAgent: USER_AGENT, viewport: { width: 1280, height: 800 } });
  // Hard timeout: closing the context aborts any hanging step
  const killer = setTimeout(() => context.close().catch(() => {}), RUN_TIMEOUT_MS);

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    await page.goto(FORM_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const form = page.locator('form#supervisor');
    await form.waitFor({ state: 'visible' });
    await form.locator('input[name="user_id"]').fill(regNo);

    const submit = form.locator('button[name="submit"]');
    await submit.waitFor({ state: 'visible' });

    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/markview'),
        { timeout: 30000 }
      ),
      submit.click(),
    ]);
    await page.waitForLoadState('load');

    const hasError = await page
      .locator('.alert', { hasText: ERROR_TEXT })
      .first()
      .waitFor({ state: 'visible', timeout: 6000 })
      .then(() => true)
      .catch(() => false);

    if (hasError) {
      return { status: 'invalid', message: ERROR_TEXT, redirectTo: LOGIN_URL };
    }

    const html = await page.content();
    const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 20000);
    return { status: 'valid', html: injectBase(html), text };
  } finally {
    clearTimeout(killer);
    await context.close().catch(() => {});
  }
}

// One user request: validate -> queue -> run (retry once if the browser died)
async function handleCheck(rawReg) {
  const regNo = String(rawReg || '').trim();

  // No reg number => straight back to the login page
  if (!regNo) {
    return { status: 'no-reg', message: 'No Reg No entered.', redirectTo: LOGIN_URL };
  }
  if (!/^[A-Za-z0-9\-_/]{1,30}$/.test(regNo)) {
    return { status: 'invalid', message: ERROR_TEXT, redirectTo: LOGIN_URL };
  }

  stats.total++;
  try {
    await acquire();
  } catch {
    stats.errors++;
    return { status: 'busy', message: 'Server is busy, please try again in a moment.' };
  }

  try {
    let result;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await checkRegNo(regNo);
        break;
      } catch (e) {
        log(`Attempt ${attempt} failed for ${regNo}:`, e.message.split('\n')[0]);
        if (attempt === 2) throw e;
        if (!browser || !browser.isConnected()) browser = null; // force relaunch
      }
    }
    if (result.status === 'valid') stats.valid++;
    else stats.invalid++;
    log(`Reg ${regNo} -> ${result.status}`);
    return result;
  } catch (e) {
    stats.errors++;
    return { status: 'error', message: 'Could not load the marks page. Please try again.' };
  } finally {
    release();
  }
}

// ---------- Web UI ----------
const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Marks Check</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 16px}
  form{display:flex;gap:8px}
  input{flex:1;padding:10px;font-size:16px}
  button{padding:10px 18px;font-size:16px;cursor:pointer}
  #out{margin-top:20px}
  iframe{width:100%;height:80vh;border:1px solid #ccc}
  .err{color:#b00020}
</style></head>
<body>
<h2>Enter your Roll / Reg No</h2>
<form id="f">
  <input id="reg" placeholder="Roll No" autocomplete="off">
  <button id="btn" type="submit">Submit</button>
</form>
<div id="out"></div>
<script>
var LOGIN_URL = "__LOGIN_URL__";
var form = document.getElementById('f');
var btn = document.getElementById('btn');
var out = document.getElementById('out');

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  var reg = document.getElementById('reg').value.trim();
  if (!reg) { window.location.href = LOGIN_URL; return; }   // no reg no -> login page

  out.className = ''; out.textContent = 'Checking, please wait...';
  btn.disabled = true;
  try {
    var r = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regNo: reg })
    });
    var d = await r.json();
    if (d.status === 'valid') {
      out.textContent = '';
      var fr = document.createElement('iframe');
      fr.setAttribute('sandbox', '');
      fr.srcdoc = d.html;
      out.appendChild(fr);
    } else if (d.status === 'invalid' || d.status === 'no-reg') {
      out.className = 'err';
      out.textContent = d.message + ' Redirecting to login...';
      setTimeout(function () { window.location.href = d.redirectTo || LOGIN_URL; }, 1500);
    } else {
      out.className = 'err';
      out.textContent = d.message || 'Something went wrong.';
    }
  } catch (err) {
    out.className = 'err';
    out.textContent = 'Network error. Please try again.';
  } finally {
    btn.disabled = false;
  }
});
</script>
</body></html>`.replace('__LOGIN_URL__', LOGIN_URL);

// ---------- HTTP server (stays up forever, serves every visitor) ----------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const path = (req.url || '/').split('?')[0];

    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }

    if (req.method === 'GET' && (path === '/health' || path === '/status')) {
      return sendJson(res, 200, {
        status: 'Playwright Automation Bot Running',
        active,
        queued: waiting.length,
        browserConnected: !!(browser && browser.isConnected()),
        stats,
      });
    }

    if (req.method === 'POST' && path === '/api/check') {
      const body = await readJson(req).catch(() => null);
      if (!body) return sendJson(res, 400, { status: 'error', message: 'Bad request' });
      const result = await handleCheck(body.regNo);
      return sendJson(res, 200, result);
    }

    sendJson(res, 404, { status: 'error', message: 'Not found' });
  } catch (e) {
    log('Request error:', e.message);
    if (!res.headersSent) sendJson(res, 500, { status: 'error', message: 'Server error' });
  }
});

server.listen(PORT, () => log(`Server listening on port ${PORT}`));

// ---------- Keep the process alive no matter what ----------
process.on('uncaughtException', (e) => log('uncaughtException:', e.message));
process.on('unhandledRejection', (e) => log('unhandledRejection:', e && e.message ? e.message : e));

const shutdown = async () => {
  log('Shutting down...');
  server.close();
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Warm up the browser so the first user isn't slow
getBrowser().catch((e) => log('Browser warm-up failed:', e.message));

// Optional: stop Render's free tier from sleeping (Render sets RENDER_EXTERNAL_URL automatically)
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(`${process.env.RENDER_EXTERNAL_URL}/health`).catch(() => {});
  }, 10 * 60 * 1000);
}