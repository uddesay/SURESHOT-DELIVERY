// Starts the Sureshot API (4300) and web app (5473) in the background.
// Logs and PIDs go to sureshot-App/.runtime. Existing listeners are reused.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const runtime = path.join(root, '.runtime');
fs.mkdirSync(runtime, { recursive: true });

const listening = (port) => new Promise((resolve) => {
  const s = net.createConnection({ host: '127.0.0.1', port });
  s.setTimeout(1000);
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
  s.once('timeout', () => { s.destroy(); resolve(false); });
});

async function start(name, cwd, args, port) {
  if (await listening(port)) { console.log(`${name} already listening on ${port}`); return; }
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) throw new Error(`${name}: run "npm ci" in ${path.relative(root, cwd)} first`);
  const logPath = path.join(runtime, `${name}.log`);
  const log = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, args, { cwd, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, LOG_LEVEL: 'warn' } });
  child.unref();
  fs.closeSync(log);
  fs.writeFileSync(path.join(runtime, `${name}.json`), JSON.stringify({ pid: child.pid, port, startedAt: new Date().toISOString() }, null, 2));
  for (let i = 0; i < 100; i++) {
    if (await listening(port)) { console.log(`${name} ready on http://localhost:${port}`); return; }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${name} did not start. See ${logPath}`);
}

(async () => {
  if (!fs.existsSync(path.join(root, 'backend', '.env'))) {
    throw new Error('backend/.env is missing — run first-time setup:\n'
      + '  $env:PG_ADMIN_USER = "postgres"\n'
      + '  $env:PG_ADMIN_PASSWORD = "<your PostgreSQL superuser password>"\n'
      + '  npm run setup');
  }
  await start('api', path.join(root, 'backend'), ['src/server.js'], 4300);
  await start('web', path.join(root, 'web'), ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], 5473);
  console.log('\nStorefront  http://localhost:5473\nAdmin       http://localhost:5473/login\nAPI health  http://localhost:4300/healthz');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
