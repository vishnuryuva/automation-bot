const { chromium } = require('playwright');
const http = require('http');

// Health check server for Render
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

    // Wait for inputs to be present in the DOM
    console.log('Waiting for input elements to render...');
    await page.waitForSelector('input', { state: 'attached', timeout: 15000 });

    // Find the first visible input field on the page
    const inputs = page.locator('input');
    const count = await inputs.count();
    console.log(`Found ${count} total input elements on page.`);

    let targetInput = null;
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const isVisible = await input.isVisible();
      const type = await input.getAttribute('type');
      
      // Target the first non-hidden input
      if (isVisible && type !== 'hidden') {
        console.log(`Targeting input at index ${i} (type: ${type})`);
        targetInput = input;
        break;
      }
    }

    if (!targetInput) {
      // Fallback to the very first input if visibility check is strict
      console.log('Fallback: selecting first input element.');
      targetInput = inputs.first();
    }

    console.log('Filling register number...');
    await targetInput.fill('99999999', { force: true });
    console.log('Filled successfully.');

    // Locate submit button
    console.log('Locating submit button...');
    const submitBtn = page.locator('button[name="submit"], button:has-text("Submit"), input[type="submit"]').first();
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null),
      submitBtn.click({ force: true })
    ]);

    // Check results
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