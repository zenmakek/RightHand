const { validateUrlResolved } = require('../utils/urlValidator');
const { launchBrowser, createSafePage } = require('./browser');
const { runAxe, computeAxeScore } = require('./axeRunner');
const { runLighthouse } = require('./lighthouseRunner');
const { blendScores } = require('./scoreBlender');

const scanUrl = async (url) => {
  const startedAt = Date.now();
  const normalizedUrl = await validateUrlResolved(url);

  let browser;
  try {
    browser = await launchBrowser();
    const page = await createSafePage(browser);

    await page.goto(normalizedUrl, { waitUntil: 'networkidle2' });

    const axeResult = await runAxe(page);
    const axeScore = computeAxeScore(axeResult.violations, axeResult.passesCount);

    let lighthouseScore = null;
    try {
      const lighthouseResult = await runLighthouse(normalizedUrl, browser);
      lighthouseScore = lighthouseResult.score;
    } catch (error) {
      console.warn(`Lighthouse failed for ${normalizedUrl}: ${error.message}`);
    }

    const accessibilityScore = blendScores({ axeScore, lighthouseScore });

    return {
      url: normalizedUrl,
      accessibilityScore,
      axeScore,
      lighthouseScore,
      violations: axeResult.violations,
      scanDurationMs: Date.now() - startedAt,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

module.exports = {
  scanUrl,
};
