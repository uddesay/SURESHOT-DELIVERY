const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../.runtime/production.json');
(async () => {
  if (!fs.existsSync(file)) { console.log('No managed production server.'); return; }
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(`http://${record.host}:${record.port}/healthz`, { signal: AbortSignal.timeout(3000) });
  const health = await res.json();
  if (!record.instance || health.application !== 'sureshot' || health.instance !== record.instance) throw new Error('Server identity mismatch; refusing to stop this process.');
  process.kill(record.pid);
  fs.unlinkSync(file);
  console.log('Production server stopped.');
})().catch((err) => { console.error(err.message); process.exitCode = 1; });
