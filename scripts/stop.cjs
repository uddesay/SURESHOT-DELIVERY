// Stops the processes started by scripts/dev.cjs.
const fs = require('node:fs');
const path = require('node:path');
const runtime = path.resolve(__dirname, '..', '.runtime');
for (const name of ['web', 'api']) {
  const file = path.join(runtime, `${name}.json`);
  if (!fs.existsSync(file)) continue;
  const { pid } = JSON.parse(fs.readFileSync(file, 'utf8'));
  try { process.kill(pid); console.log(`stopped ${name} (${pid})`); } catch { console.log(`${name} was not running`); }
  fs.rmSync(file);
}
