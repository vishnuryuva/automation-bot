const { chromium } = require('playwright');
const http = require('http');

// Health check server for Render uptime maintenance
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Playwright Automation Bot is Running\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

async function runAutomation() {
  console.log('--- Starting Cloud Playwright Worker ---');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ]
  });

  const page = await browser.newPage();

  try {
    console.log('Navigating to live markview page...');
    await page.goto('https://mahavishnueducational.com/markview', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });

    // Target the first visible text input (bypasses Symfony debug bar inputs)
    const inputField = page.locator('input[type="text"]:visible, input[type="number"]:visible, input:not([type="hidden"]):visible').first();
    await inputField.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log('Visible input field located. Filling register number...');
    await inputField.fill('99999999');

    // Locate and click the visible submit button
    const submitButton = page.locator('button[type="submit"]:visible, input[type="submit"]:visible, button:has-text("Submit"):visible, button:has-text("View"):visible').first();
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null),
      submitButton.click()
    ]);

    console.log(`Submitted. Current URL: ${page.url()}`);

    // Check page content for error banner or response states
    const pageContent = await page.content();

    if (pageContent.includes('Reg No Incorrect!') || pageContent.includes('Incorrect') || pageContent.includes('Not Found')) {
      console.log('CRITICAL: Error state "Reg No Incorrect!" detected on live site!');
      
      // Perform automated action (e.g., secondary navigation test)
      console.log('Executing automated redirect check to login...');
      await page.goto('https://mahavishnueducational.com/login', { waitUntil: 'networkidle' });
      console.log(`Automated worker redirected successfully. Final Page URL: ${page.url()}`);
    } else {
      console.log('No error banner detected or page processed normally.');
    }

  } catch (err) {
    console.error('Automation worker execution error:', err.message);
  } finally {
    await browser.close();
    console.log('--- Cloud Playwright Worker Finished ---');
  }
}

// Execute the worker on startup
runAutomation();

// Schedule worker to run every 5 minutes (300,000 ms)
setInterval(runAutomation, 300000);