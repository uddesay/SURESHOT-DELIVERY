/**
 * Lets browsers, the app's WebView and any CDN reuse identical public GETs for a
 * few seconds. Only attach this to responses that are the same for everyone
 * (never to anything that reads req.user). The API default is `no-store`.
 */
const publicCache = (seconds, staleSeconds = seconds * 3) => (req, res, next) => {
  if (req.method === 'GET' && !req.headers.authorization) {
    res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${staleSeconds}`);
    res.set('Vary', 'Accept-Encoding, Origin');
  }
  next();
};

module.exports = { publicCache };
