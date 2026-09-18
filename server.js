const { chromium } = require('playwright');
const http = require('http');

// Simple HTTP server so Render registers your app as active
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Playwright Automation Service is Running\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

// Automation Function
(async () => {
  console.log('--- Starting Cloud Playwright Worker ---');
  
  // Launch Playwright with Linux sandbox bypass flags required for cloud containers
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://mahavishnueducational.com/mark');
    await page.fill('input[type="text"]', '12345');
    await page.click('button[type="submit"], input[type="submit"]');

    const errorBanner = page.locator('div.alert-success:has-text("Reg No Incorrect!")');
    await errorBanner.waitFor({ state: 'visible', timeout: 5000 });

    console.log('ERROR DETECTED: Reg No Incorrect!');
    console.log('Redirecting to https://mahavishnueducational.com/login...');
    
    await page.goto('https://mahavishnueducational.com/login');
    console.log('Successfully navigated to login page on Render cloud!');

  } catch (err) {
    console.log('Error or timeout during automation execution:', err.message);
  } finally {
    await browser.close();
  }
})();