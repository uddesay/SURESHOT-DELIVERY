// Builds the Sureshot Android app (debug APK) from the web storefront.
//   npm --prefix web run app:apk                 -> uses web/.env.app for the API URL
//   set SURESHOT_DEV_API=1 to allow a plain-http dev API (emulator: 10.0.2.2:4300)
// Output: web/android-build/sureshot-debug.apk
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const web = path.resolve(__dirname, '..', 'web');
const android = path.join(web, 'android');
const localAppData = process.env.LOCALAPPDATA || '';
const env = { ...process.env };

if (!env.JAVA_HOME) {
  const studioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
  if (fs.existsSync(studioJbr)) env.JAVA_HOME = studioJbr;
}
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const sdk = path.join(localAppData, 'Android', 'Sdk');
  if (fs.existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (!env.JAVA_HOME) throw new Error('JAVA_HOME is not set and Android Studio\'s JDK was not found.');
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) throw new Error('Android SDK not found — install it from Android Studio or set ANDROID_HOME.');
if (!fs.existsSync(path.join(web, '.env.app'))) throw new Error('web/.env.app is missing — copy web/.env.app.example and set VITE_API_BASE_URL.');

const run = (cmd, cwd) => { console.log(`\n> ${cmd}`); execSync(cmd, { cwd, env, stdio: 'inherit' }); };

run('npm run app:sync', web);
run(`"${path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}" assembleDebug`, android);

const apk = path.join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join(web, 'android-build');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'sureshot-debug.apk');
fs.copyFileSync(apk, out);
console.log(`\nAPK ready: ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
