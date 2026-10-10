import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';
import { applySecurityMiddleware } from './securityMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';

function startTestServer() {
  const app = express();
  applySecurityMiddleware(app, {
    allowedOrigins: ['https://app.example.com'],
    allowLocalhost: true,
    jsonLimit: '1kb',
  });
  app.post('/echo', (req, res) => res.json({ received: req.body }));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('helmet, CORS allowlist, and body-size cap smoke checks', async (t) => {
  const { server, baseUrl } = startTestServer();
  t.after(() => server.close());

  await t.test('sets helmet security headers', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-dns-prefetch-control'), 'off');
    assert.equal(res.headers.has('x-powered-by'), false);
  });

  await t.test('allows an allowlisted origin and echoes it back', async () => {
    const res = await fetch(`${baseUrl}/ping`, {
      headers: { Origin: 'https://app.example.com' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example.com');
  });

  await t.test('allows localhost dev origins', async () => {
    const res = await fetch(`${baseUrl}/ping`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });

  await t.test('rejects a non-allowlisted origin (no CORS header granted)', async () => {
    const res = await fetch(`${baseUrl}/ping`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(res.headers.has('access-control-allow-origin'), false);
  });

  await t.test('accepts a JSON body under the size cap', async () => {
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.example.com' },
      body: JSON.stringify({ hello: 'world' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { received: { hello: string } };
    assert.equal(body.received.hello, 'world');
  });

  await t.test('rejects a JSON body over the size cap', async () => {
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.example.com' },
      body: JSON.stringify({ big: 'x'.repeat(2000) }),
    });
    // body-parser rejects the oversized body before the route runs; the app's generic
    // error handler maps that to 500, so assert rejection rather than a specific status.
    assert.notEqual(res.status, 200);
    const body = (await res.json()) as { message?: string };
    assert.match(body.message ?? '', /entity too large/i);
  });
});
