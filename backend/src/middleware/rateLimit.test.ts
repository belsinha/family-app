import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';
import {
  createRateLimiter,
  loginNameKeyGenerator,
  loginIpRateLimiter,
  loginNameRateLimiter,
  uploadRateLimiter,
  writeRateLimiter,
} from './rateLimit.js';

function startApp(build: (app: express.Express) => void) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  build(app);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function fire(baseUrl: string, path: string, body?: Record<string, unknown>) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

test('createRateLimiter: blocks once the limit is exceeded with a clear 429 JSON error', async (t) => {
  const limiter = createRateLimiter('slow down', { windowMs: 60_000, limit: 2 });
  const { server, baseUrl } = startApp((app) => app.post('/x', limiter, (_req, res) => res.json({ ok: true })));
  t.after(() => server.close());

  const first = await fire(baseUrl, '/x');
  const second = await fire(baseUrl, '/x');
  const third = await fire(baseUrl, '/x');

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.deepEqual(await third.json(), { error: 'slow down' });
  assert.ok(third.headers.has('retry-after'), 'expected a Retry-After header on the 429');
  assert.ok(third.headers.has('ratelimit-limit'), 'expected standard RateLimit-* headers');
});

test('createRateLimiter: skip option exempts matching requests from the counter entirely', async (t) => {
  const limiter = createRateLimiter('slow down', {
    windowMs: 60_000,
    limit: 1,
    skip: (req) => req.method === 'GET',
  });
  const { server, baseUrl } = startApp((app) => {
    const handler = (_req: express.Request, res: express.Response) => res.json({ ok: true });
    app.get('/x', limiter, handler);
    app.post('/x', limiter, handler);
  });
  t.after(() => server.close());

  // Skipped method: never counts against the limit, however many times it's called.
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/x`);
    assert.equal(res.status, 200);
  }

  // Counted method: first call consumes the only slot, second is blocked.
  const firstPost = await fire(baseUrl, '/x');
  const secondPost = await fire(baseUrl, '/x');
  assert.equal(firstPost.status, 200);
  assert.equal(secondPost.status, 429);
});

test('loginNameKeyGenerator: throttles per login name, independent of other names sharing the IP', async (t) => {
  const limiter = createRateLimiter('too many for this account', {
    windowMs: 60_000,
    limit: 2,
    keyGenerator: loginNameKeyGenerator,
  });
  const { server, baseUrl } = startApp((app) => app.post('/login', limiter, (_req, res) => res.json({ ok: true })));
  t.after(() => server.close());

  const alice1 = await fire(baseUrl, '/login', { name: 'Alice', password: 'x' });
  const alice2 = await fire(baseUrl, '/login', { name: 'Alice', password: 'x' });
  const alice3 = await fire(baseUrl, '/login', { name: 'Alice', password: 'x' });
  assert.equal(alice1.status, 200);
  assert.equal(alice2.status, 200);
  assert.equal(alice3.status, 429, 'third attempt against the same name should be throttled');

  // A different targeted name, same source IP, gets its own independent quota.
  const bob1 = await fire(baseUrl, '/login', { name: 'Bob', password: 'x' });
  assert.equal(bob1.status, 200);

  // Case/whitespace variants of an already-throttled name still hit the same bucket.
  const aliceVariant = await fire(baseUrl, '/login', { name: '  ALICE  ', password: 'x' });
  assert.equal(aliceVariant.status, 429);
});

test('loginNameKeyGenerator: falls back to per-IP keying when no usable name is present', async (t) => {
  const limiter = createRateLimiter('too many for this account', {
    windowMs: 60_000,
    limit: 1,
    keyGenerator: loginNameKeyGenerator,
  });
  const { server, baseUrl } = startApp((app) => app.post('/login', limiter, (_req, res) => res.json({ ok: true })));
  t.after(() => server.close());

  const missingName1 = await fire(baseUrl, '/login', { password: 'x' });
  const missingName2 = await fire(baseUrl, '/login', { password: 'x' });
  assert.equal(missingName1.status, 200);
  assert.equal(missingName2.status, 429, 'requests with no name should still share a fallback IP bucket');
});

test('the real login-IP limiter trips at its configured threshold', async (t) => {
  const { server, baseUrl } = startApp((app) =>
    app.post('/login', loginIpRateLimiter, (_req, res) => res.json({ ok: true }))
  );
  t.after(() => server.close());

  const responses: number[] = [];
  for (let i = 0; i < 16; i++) {
    const res = await fire(baseUrl, '/login', { name: `user-${i}`, password: 'x' });
    responses.push(res.status);
  }
  assert.equal(responses.slice(0, 15).every((s) => s === 200), true, 'first 15 attempts from one IP should pass');
  assert.equal(responses[15], 429, 'the 16th attempt from the same IP should be throttled');
});

test('the real login-name limiter trips at its configured threshold', async (t) => {
  const { server, baseUrl } = startApp((app) =>
    app.post('/login', loginNameRateLimiter, (_req, res) => res.json({ ok: true }))
  );
  t.after(() => server.close());

  const responses: number[] = [];
  for (let i = 0; i < 7; i++) {
    const res = await fire(baseUrl, '/login', { name: 'targeted-account', password: 'x' });
    responses.push(res.status);
  }
  assert.equal(responses.slice(0, 6).every((s) => s === 200), true, 'first 6 attempts against one name should pass');
  assert.equal(responses[6], 429, 'the 7th attempt against the same name should be throttled');
});

test('the real upload rate limiter trips at its configured threshold', async (t) => {
  const { server, baseUrl } = startApp((app) =>
    app.post('/import-parse', uploadRateLimiter, (_req, res) => res.json({ ok: true }))
  );
  t.after(() => server.close());

  const responses: number[] = [];
  for (let i = 0; i < 11; i++) {
    const res = await fire(baseUrl, '/import-parse');
    responses.push(res.status);
  }
  assert.equal(responses.slice(0, 10).every((s) => s === 200), true, 'first 10 uploads should pass');
  assert.equal(responses[10], 429, 'the 11th upload should be throttled');
});

test('the real write rate limiter skips reads and throttles writes at its configured threshold', async (t) => {
  const { server, baseUrl } = startApp((app) => {
    app.use(writeRateLimiter);
    app.get('/thing', (_req, res) => res.json({ ok: true }));
    app.post('/thing', (_req, res) => res.json({ ok: true }));
  });
  t.after(() => server.close());

  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/thing`);
    assert.equal(res.status, 200, 'GET requests should never be throttled by the write limiter');
  }

  const responses: number[] = [];
  for (let i = 0; i < 61; i++) {
    const res = await fire(baseUrl, '/thing');
    responses.push(res.status);
  }
  assert.equal(responses.slice(0, 60).every((s) => s === 200), true, 'first 60 writes should pass');
  assert.equal(responses[60], 429, 'the 61st write should be throttled');
});
