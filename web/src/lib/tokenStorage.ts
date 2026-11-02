/**
 * Tokens live in localStorage rather than an httpOnly cookie because the
 * backend is a pure bearer-token API (no cookie-session support) shared
 * with the mobile apps. That's an accepted XSS-exposure tradeoff for an
 * internal admin tool — see README for the production mitigation (VPN /
 * IP allowlist in front of this app, short 15-minute access token TTL).
 */
const ACCESS_TOKEN_KEY = 'sureshot_admin_access_token';
const REFRESH_TOKEN_KEY = 'sureshot_admin_refresh_token';

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  saveTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
