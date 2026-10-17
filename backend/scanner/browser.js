const puppeteer = require('puppeteer');

const { isRequestAllowed } = require('../utils/urlValidator');

const DEFAULT_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS) || 60000;

const launchBrowser = () => {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  return puppeteer.launch({
    headless: 'new',
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
};

const createSafePage = async (browser) => {
  const page = await browser.newPage();

  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(
    'RightHandScanner/1.0 (Accessibility Compliance Checker; +https://github.com/zenmakek/RightHand)'
  );

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (isRequestAllowed(request.url())) {
      request.continue();
      return;
    }

    request.abort('blockedbyclient');
  });

  return page;
};

module.exports = {
  launchBrowser,
  createSafePage,
};
