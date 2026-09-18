const { chromium } = require('playwright');
const http = require('http');

// Health check server for Render uptime maintenance
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Playwright Automation Bot Running\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

async function runAutomation() {
  console.log('--- Starting Cloud Playwright Worker ---');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    console.log('Navigating to markview...');
    await page.goto('https://mahavishnueducational.com/markview', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });

    // 1. Target input box directly by placeholder
    console.log('Locating Roll No field...');
    const input = page.locator('input[placeholder="Roll No"]');
    await input.waitFor({ state: 'attached', timeout: 10000 });
    await input.fill('99999999');
    console.log('Filled Roll No: 99999999');

    // 2. Target submit button directly by name attribute
    console.log('Clicking submit button...');
    const submitBtn = page.locator('button[name="submit"]');
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null),
      submitBtn.click()
    ]);

    // 3. Detect the error message banner
    const errorBanner = page.locator('div.spacer2');
    if (await errorBanner.isVisible()) {
      const errorText = await errorBanner.textContent();
      console.log(`DETECTED ERROR ON SITE: "${errorText.trim()}"`);

      // Trigger redirect action test
      console.log('Redirecting worker session to login page...');
      await page.goto('https://mahavishnueducational.com/login', { waitUntil: 'networkidle' });
      console.log(`Worker successfully navigated to: ${page.url()}`);
    } else {
      console.log('No error banner detected.');
    }

  } catch (err) {
    console.error('Automation error:', err.message);
  } finally {
    await browser.close();
    console.log('--- Cloud Playwright Worker Finished ---');
  }
}

// Initial run on startup
runAutomation();

// Repeat execution every 5 minutes
setInterval(runAutomation, 300000);