const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = function mountWeb(app, directory = path.resolve(__dirname, '../../../web/dist')) {
  const index = path.join(directory, 'index.html');
  if (!fs.existsSync(index)) throw new Error('Web build missing. Run npm run build before starting.');
  app.use('/assets', express.static(path.join(directory, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.use(express.static(directory, { index: false, maxAge: '1h', dotfiles: 'deny',
    setHeaders: (res, file) => { if (path.basename(file) === 'index.html') res.setHeader('Cache-Control', 'no-store'); },
  }));
  app.get('*', (req, res, next) => {
    if (/^\/(api|assets|socket\.io|metrics)(\/|$)/.test(req.path) || /(^|\/)\./.test(req.path) || path.extname(req.path) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-store');
    return res.sendFile(index);
  });
};
