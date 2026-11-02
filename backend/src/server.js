const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./config/database');
const redis = require('./config/redis');
const { initSocket } = require('./sockets');

const server = http.createServer(app);
initSocket(server);

const start = async () => {
  try {
    await db.raw('SELECT 1');
    logger.info('PostgreSQL connected');
  } catch (err) {
    logger.fatal({ err }, 'PostgreSQL connection failed');
    process.exit(1);
  }

  // Handle listen failures here rather than letting them reach the
  // uncaughtException handler below, which reports them as a FATAL stack
  // trace and buries the one thing that actually matters: what to do next.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.fatal(
        `Port ${config.port} is already in use — another API instance is still running. `
          + 'Stop it first, or set PORT to a free port in backend/.env.',
      );
    } else if (err.code === 'EACCES') {
      logger.fatal(`Not permitted to bind port ${config.port}. Use a port above 1024 or run with elevated rights.`);
    } else {
      logger.fatal({ err }, 'HTTP server failed to start');
    }
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    logger.info(`Sureshot API listening on :${config.port} (${config.env})`);
    if (!config.isProduction) logger.info(`Swagger docs at ${config.apiBaseUrl}/api/v1/docs`);
  });
};

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    try {
      await db.destroy();
      redis.disconnect();
      logger.info('Connections closed. Bye.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });
  // Force-exit if connections refuse to drain
  setTimeout(() => process.exit(1), 15000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  process.exit(1);
});

start();
