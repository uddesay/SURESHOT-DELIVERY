// Production runtime, foreground for a service manager or --background locally.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const cwd = path.join(root, 'backend');
const background = process.argv.includes('--background');
const env = { ...process.env, NODE_ENV: 'production', SERVE_WEB: 'true',
  INSTANCE_ID: randomUUID(),
  PORT: process.env.PORT || "5473", HOST: process.env.HOST || '127.0.0.1',
  RATE_LIMIT_STORE: process.env.RATE_LIMIT_STORE || 'postgres' };
if (!fs.existsSync(path.join(root, 'web/dist/index.html'))) throw new Error('Run npm run build first');
const runtime = path.join(root, '.runtime');
fs.mkdirSync(runtime, { recursive: true });
async function main() {
  if (background) {
    try { const response = await fetch(`http://${env.HOST}:${env.PORT}/healthz`); if (response.ok) throw new Error(`Port ${env.PORT} already serves an application. Stop it before starting another.`); }
    catch (err) { if (!err.cause) throw err; }
  }
  const log = background ? fs.openSync(path.join(runtime, 'production.log'), 'a') : null;
  const child = spawn(process.execPath, ['src/server.js'], { cwd, env, windowsHide: true,
    detached: background, stdio: background ? ['ignore', log, log] : 'inherit' });
  child.on('error', (err) => { console.error(err.message); process.exitCode = 1; });
  if (!background) { child.on('exit', (code) => { process.exitCode = code ?? 1; }); return; }
  fs.closeSync(log);
  child.unref();
  fs.writeFileSync(path.join(runtime, 'production.json'), JSON.stringify({ pid: child.pid, host: env.HOST, port: Number(env.PORT), instance: env.INSTANCE_ID, startedAt: new Date().toISOString() }, null, 2));
  for (let i = 0; i < 120; i++) {
    try { process.kill(child.pid, 0); } catch { throw new Error('Server exited. Check .runtime/production.log'); }
    try {
      const response = await fetch(`http://${env.HOST}:${env.PORT}/readyz`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) { console.log(`Production server ready: http://${env.HOST}:${env.PORT}`); return; }
    } catch { /* Wait for startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Readiness failed. Check .runtime/production.log');
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });
