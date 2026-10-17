const DEFAULT_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS) || 60000;

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const getBrowserPort = (browser) => {
  const wsEndpoint = browser.wsEndpoint();
  const parsed = new URL(wsEndpoint);
  return Number(parsed.port);
};

const runLighthouse = async (url, browser) => {
  const lighthouseModule = await import('lighthouse');
  const lighthouse = lighthouseModule.default || lighthouseModule;

  const runPromise = lighthouse(
    url,
    {
      port: getBrowserPort(browser),
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['accessibility'],
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        disabled: false,
      },
    },
    null
  );

  const result = await withTimeout(runPromise, DEFAULT_TIMEOUT_MS, 'Lighthouse scan timed out.');
  const rawScore = result?.lhr?.categories?.accessibility?.score;

  if (typeof rawScore !== 'number' || Number.isNaN(rawScore)) {
    throw new Error('Lighthouse did not return an accessibility score.');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(rawScore * 100))),
  };
};

module.exports = {
  runLighthouse,
};
