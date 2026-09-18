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
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    // Wait a brief moment for dynamic JS/CSS to finish loading
    await page.waitForTimeout(3000);

    // Locate the primary input inside the form container
    console.log('Locating form input field...');
    const input = page.locator('form input').first();
    
    // Force fill to bypass layout/visibility recalculation blocks
    await input.fill('99999999', { force: true });
    console.log('Filled register number: 99999999');

    // Click button with name="submit" or the primary submit button in the form
    console.log('Clicking submit button...');
    const submitBtn = page.locator('button[name="submit"], form button, form input[type="submit"]').first();
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null),
      submitBtn.click({ force: true })
    ]);

    // Check for the error text on the page
    const pageContent = await page.content();
    if (pageContent.includes('Reg No Incorrect!')) {
      console.log('CRITICAL: Error "Reg No Incorrect!" detected on live site!');
      
      console.log('Redirecting worker session to login page...');
      await page.goto('https://mahavishnueducational.com/login', { waitUntil: 'networkidle' });
      console.log(`Worker successfully navigated to: ${page.url()}`);
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

// Initial run on startup
runAutomation();

// Repeat execution every 5 minutes
setInterval(runAutomation, 300000);