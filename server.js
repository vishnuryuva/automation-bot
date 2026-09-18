const { chromium } = require('playwright');
const http = require('http');

// Health check server for Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Playwright Live Tester is Running\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

async function runRealtimeTest() {
  console.log('--- Launching Real-Time Website Test ---');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // 1. Navigate to the live markview URL
    console.log('Navigating to live URL...');
    await page.goto('https://mahavishnueducational.com/markview', { waitUntil: 'networkidle' });

    // 2. Fill in a test register number to trigger the error
    // (Adjust input selector if the field uses a specific name or ID)
    await page.fill('input[type="text"]', '99999999'); 
    await page.click('button[type="submit"], input[type="submit"]');

    // 3. Wait to see if the page redirects or shows the error banner
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`Current Page URL after submission: ${currentUrl}`);

    if (currentUrl.includes('/login')) {
      console.log('SUCCESS: Real-time website redirected to the login page!');
    } else {
      console.log('NOTICE: Page did not redirect automatically. Checking for error banner...');
      const errorText = await page.textContent('body');
      
      if (errorText.includes('Reg No Incorrect!')) {
        console.log('Error banner detected on live page!');
      }
    }

  } catch (err) {
    console.error('Test execution error:', err.message);
  } finally {
    await browser.close();
    console.log('--- Real-Time Test Complete ---');
  }
}

// Run the test on startup
runRealtimeTest();