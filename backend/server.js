require('dotenv').config();

const app = require('./app');
const { initDatabase } = require('./database/init');

const PORT = Number(process.env.PORT) || 5000;
let server;

const shutdown = (signal) => {
  console.log(`${signal} received. Starting graceful shutdown.`);

  if (!server) {
    process.exit(0);
  }

  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const startServer = async () => {
  try {
    await initDatabase();
    server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize database. Server not started.', error);
    process.exit(1);
  }
};

startServer();
