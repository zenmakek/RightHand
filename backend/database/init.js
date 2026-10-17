const fs = require('fs/promises');
const path = require('path');

const { query } = require('./pool');

const schemaPath = path.resolve(__dirname, '../../database/init.sql');
const maxAttempts = 5;
const baseBackoffMs = 1000;

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const initDatabase = async () => {
  const sql = await fs.readFile(schemaPath, 'utf8');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await query(sql);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`Database initialization failed after ${maxAttempts} attempts: ${error.message}`);
      }

      const delayMs = baseBackoffMs * attempt;
      console.warn(
        `Database init attempt ${attempt} failed (${error.message}). Retrying in ${delayMs}ms.`
      );
      await wait(delayMs);
    }
  }
};

module.exports = {
  initDatabase,
};
