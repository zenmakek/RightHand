const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }

  const statusCode = Number.isInteger(err?.statusCode)
    ? err.statusCode
    : Number.isInteger(err?.status)
      ? err.status
      : 500;

  const isProduction = process.env.NODE_ENV === 'production';
  const fallbackMessage = statusCode >= 500 && isProduction ? 'Internal server error' : 'Server error';
  const errorMessage = typeof err?.message === 'string' ? err.message : fallbackMessage;

  return res.status(statusCode).json({ error: errorMessage });
});

module.exports = app;
