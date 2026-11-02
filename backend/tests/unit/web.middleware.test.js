const express = require('express');
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mountWeb = require('../../src/middlewares/web.middleware');
let directory;
let app;
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sureshot-web-'));
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<html>Application</html>');
  fs.writeFileSync(path.join(directory, 'assets', 'bundle.js'), 'window.app = true;');
  app = express();
  mountWeb(app, directory);
});
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));
test('deep links return the application without stale HTML caching', async () => {
  const res = await request(app).get('/orders/example').accept('html');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Application');
  expect(res.headers['cache-control']).toBe('no-store');
});
test.each(['/api/v1/unknown', '/assets/missing.js', '/missing.png', '/.env'])('does not rewrite %s into HTML', async (url) => {
  expect((await request(app).get(url).accept('html')).status).toBe(404);
});
test('hashed assets have immutable cache headers', async () => {
  const res = await request(app).get('/assets/bundle.js');
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toContain('immutable');
});
test('explicit index.html is never cached', async () => {
  const res = await request(app).get('/index.html');
  expect(res.headers['cache-control']).toBe('no-store');
});
