const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = 'https://eyadstein.github.io/polis-genesis/world.html';
  await page.goto(url, { waitUntil: 'networkidle' });
  // Wait for canvas to load
  await page.waitForTimeout(5000);
  const canvas = await page.$('canvas');
  if (canvas) {
    await canvas.screenshot({ path: 'docs/screenshot.png' });
  } else {
    await page.screenshot({ path: 'docs/screenshot.png', fullPage: true });
  }
  await browser.close();
})();
