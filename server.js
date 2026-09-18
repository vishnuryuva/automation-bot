const { chromium } = require('playwright');
const http = require('http');

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

    // 1. Locate the visible text box (bypassing the 31 hidden debug inputs)
    console.log('Locating Roll No text field...');
    const input = page.locator('input[type="text"]').filter({ hasNotClass: 'sf-dump-search-input' }).first();
    await input.fill('99999999', { force: true });
    console.log('Filled register number successfully.');

    // 2. Target the submit button directly using exact attributes from DevTools
    console.log('Locating submit button...');
    const submitBtn = page.locator('button[name="submit"], button.btn-primary, button:has-text("Submit")').first();
    await submitBtn.waitFor({ state: 'attached', timeout: 10000 });
    
    // Perform press action to submit form directly
    await submitBtn.focus();
    await submitBtn.press('Enter');
    console.log('Submit action triggered via enter keypress.');

    await page.waitForTimeout(4000); // Wait for page DOM update

    // 3. Detect the error banner on the page
    const pageContent = await page.content();
    if (pageContent.includes('Reg No Incorrect!')) {
      console.log('CRITICAL: Error "Reg No Incorrect!" detected on live site!');
      
      console.log('Navigating worker to login page...');
      await page.goto('https://mahavishnueducational.com/login', { waitUntil: 'networkidle' });
      console.log(`Worker navigated successfully. Current URL: ${page.url()}`);
    } else {
      console.log('No error banner detected on submission.');
    }

  } catch (err) {
    console.error('Automation error:', err.message);
  } finally {
    await browser.close();
    console.log('--- Cloud Playwright Worker Finished ---');
  }
}

runAutomation();

// Repeat execution every 5 minutes
setInterval(runAutomation, 300000);