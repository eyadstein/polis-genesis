const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Serve static site using Vite preview (assumes built already)
  // Navigate to the deployed GitHub Pages URL for a stable screenshot
  const url = 'https://eyadstein.github.io/polis-genesis/world.html';
  await page.goto(url, { waitUntil: 'networkidle' });
  // Wait a bit for the scene to finish loading
  await page.waitForTimeout(5000);
  // Capture screenshot of the canvas element
  const canvas = await page.$('canvas');
  if (canvas) {
    await canvas.screenshot({ path: 'viewer/public/screenshot.png' });
  } else {
    await page.screenshot({ path: 'viewer/public/screenshot.png', fullPage: true });
  }
  await browser.close();
})();
