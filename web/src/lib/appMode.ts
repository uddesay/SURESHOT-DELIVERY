/**
 * Detects when the storefront runs as an app — inside the Capacitor Android/iOS
 * shell, or installed to the home screen — and marks <html data-app> so CSS can
 * drop website-only chrome (utility bar, footer) in favour of the tab bar.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

export const isNativeApp = Boolean(capacitor?.isNativePlatform?.());
export const isApp = isNativeApp || window.matchMedia?.('(display-mode: standalone)').matches === true;

export function initAppMode() {
  if (!isApp) return;
  const root = document.documentElement;
  root.dataset.app = isNativeApp ? capacitor?.getPlatform?.() ?? 'native' : 'pwa';
  if (isNativeApp) {
    // Green status bar to match the header band; loaded only inside the native shell.
    void import('@capacitor/status-bar').then(({ StatusBar, Style }) => Promise.all([
      StatusBar.setStyle({ style: Style.Dark }),
      StatusBar.setBackgroundColor({ color: '#0f2552' }).catch(() => undefined), // Android only
    ])).catch(() => undefined);
  }
}
