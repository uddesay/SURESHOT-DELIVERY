import type { CapacitorConfig } from '@capacitor/cli';

// Local test builds talk to the dev API over plain http (emulator: 10.0.2.2),
// which the https://localhost app origin would otherwise block as mixed content.
// Release builds must point VITE_API_BASE_URL at an https API and leave this off.
const devApi = process.env.SURESHOT_DEV_API === '1';

const config: CapacitorConfig = {
  appId: 'com.sureshot.app',
  appName: 'Sureshot',
  webDir: 'dist',
  android: {
    allowMixedContent: devApi,
    backgroundColor: '#f6f8fc',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
  },
};

export default config;
