const { Client } = require('@elastic/elasticsearch');
const config = require('./index');
const logger = require('../utils/logger');

/**
 * Elasticsearch is a soft dependency: search falls back to a Postgres trigram
 * query when it's down (see search.service.js). The retry/timeout budget is
 * kept small and paired with an availability circuit breaker because the
 * fallback is only useful if it kicks in *fast* — on the default budget a dead
 * ES added ~4s to every search before the fallback ran, which reads as a
 * broken search box rather than a degraded one.
 */
const esClient = new Client({
  node: config.elasticsearch.node,
  requestTimeout: 2000,
  pingTimeout: 1000,
  maxRetries: 0,
});

let available = true;
let outageLogged = false;
let nextProbeAt = 0;

/** How long to skip ES entirely after a failure before probing it again. */
const COOLDOWN_MS = 30000;

/**
 * False while ES is in its post-failure cooldown, so callers can go straight
 * to the fallback instead of paying the connect cost on every request. One
 * request is let through once the cooldown elapses, to re-test the connection.
 */
esClient.isAvailable = () => {
  if (available) return true;
  if (Date.now() >= nextProbeAt) {
    available = true;
    return true;
  }
  return false;
};

esClient.markUnavailable = (err) => {
  available = false;
  nextProbeAt = Date.now() + COOLDOWN_MS;
  if (!outageLogged) {
    outageLogged = true;
    logger.warn(
      { err: err?.message },
      'Elasticsearch unavailable — search is using the Postgres trigram fallback. Retrying periodically.',
    );
  }
};

esClient.markAvailable = () => {
  if (outageLogged) {
    outageLogged = false;
    logger.info('Elasticsearch recovered — search is back on the ES index');
  }
  available = true;
};

module.exports = esClient;
