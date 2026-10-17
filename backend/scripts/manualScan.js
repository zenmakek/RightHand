#!/usr/bin/env node

const { scanUrl } = require('../scanner');

const inputUrl = process.argv[2];

if (!inputUrl) {
  console.error('Usage: npm run scan:manual -- <url>');
  process.exit(1);
}

(async () => {
  try {
    const result = await scanUrl(inputUrl);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Manual scan failed: ${error.message}`);
    process.exit(1);
  }
})();
