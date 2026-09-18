const { chromium } = require('playwright');

(async () => {
  // Launch Chromium in visual mode
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500 
  });

  const page = await browser.newPage();

  console.log('--- Navigating to Maha Vishnu Mark Sheet Page ---');
  await page.goto('https://mahavishnueducational.com/mark');

  // Fill in the input field with an invalid registration number to trigger the error
  await page.fill('input[type="text"]', '12345'); 
  await page.click('button[type="submit"], input[type="submit"]');

  // Define locator for the target error alert banner
  const errorBanner = page.locator('div.alert-success:has-text("Reg No Incorrect!")');

  try {
    // Wait up to 5 seconds for the error banner to appear
    await errorBanner.waitFor({ state: 'visible', timeout: 5000 });
    
    console.log('ERROR DETECTED: "Reg No Incorrect!"');
    console.log('Redirecting automatically to login page...');

    // Redirect to your live destination URL
    await page.goto('https://mahavishnueducational.com/login');
    
    console.log('Successfully navigated to https://mahavishnueducational.com/login!');

  } catch (err) {
    console.log('No error banner found. Proceeding with default flow...');
  }

  // Keeps the browser open on screen so you can inspect the live result
  console.log('Script completed. Browser paused for testing.');
  await page.pause(); 
})();