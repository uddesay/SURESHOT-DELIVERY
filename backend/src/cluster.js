/**
 * Runs the API as N worker processes (one per CPU core by default) so a traffic
 * spike uses every core and one crashed worker never takes the site down.
 *
 *   WEB_CONCURRENCY=4 node src/cluster.js     (or: npm run start:cluster)
 *
 * Each worker gets its own DB pool (DB_POOL_MAX connections) — size
 * DB_POOL_MAX x WEB_CONCURRENCY below Postgres max_connections. Socket.IO
 * rooms are shared through the Redis adapter; clients use WebSocket only.
 */
const cluster = require('node:cluster');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

if (cluster.isPrimary) {
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const wanted = Number(process.env.WEB_CONCURRENCY || Math.min(cores, 4));
  const workers = Math.max(1, Math.min(wanted, 16));
  let stopping = false;
  const crashes = [];

  const fork = () => cluster.fork({ INSTANCE_ID: `${randomUUID().slice(0, 8)}` });
  for (let i = 0; i < workers; i += 1) fork();
  // eslint-disable-next-line no-console
  console.log(`Sureshot API: ${workers} worker(s) on :${process.env.PORT || 4300}`);

  cluster.on('exit', (worker, code, signal) => {
    if (stopping) return;
    // Crash-loop guard: more than 5 deaths in a minute means something is badly wrong.
    const now = Date.now();
    crashes.push(now);
    while (crashes.length && now - crashes[0] > 60000) crashes.shift();
    // eslint-disable-next-line no-console
    console.error(`worker ${worker.process.pid} exited (${signal || code}); restarting`);
    if (crashes.length > 5) {
      // eslint-disable-next-line no-console
      console.error('workers are crash-looping — giving up so the supervisor can alert');
      process.exit(1);
    }
    setTimeout(fork, 500);
  });

  const stop = (signal) => {
    stopping = true;
    for (const id in cluster.workers) cluster.workers[id].process.kill(signal);
    setTimeout(() => process.exit(0), 16000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  cluster.on('disconnect', () => { if (stopping && !Object.keys(cluster.workers).length) process.exit(0); });
} else {
  require('./server');
}
