import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedOrigins, isOriginAllowed, createCorsOriginChecker } from './corsOrigins.js';

test('parseAllowedOrigins splits, trims, dedupes, and strips trailing slashes', () => {
  assert.deepEqual(
    parseAllowedOrigins(' https://app.example.com/ ,https://app.example.com,https://other.example.com '),
    ['https://app.example.com', 'https://other.example.com']
  );
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(''), []);
});

test('isOriginAllowed allows requests with no Origin header (curl, health checks)', () => {
  assert.equal(isOriginAllowed(undefined, [], false), true);
});

test('isOriginAllowed allows an exact allowlist match, rejects everything else', () => {
  const allowed = ['https://app.example.com'];
  assert.equal(isOriginAllowed('https://app.example.com', allowed, false), true);
  assert.equal(isOriginAllowed('https://app.example.com/', allowed, false), true);
  assert.equal(isOriginAllowed('https://evil.example.com', allowed, false), false);
  assert.equal(isOriginAllowed('http://app.example.com', allowed, false), false);
});

test('isOriginAllowed allows any localhost/127.0.0.1 port only when allowLocalhost is true', () => {
  assert.equal(isOriginAllowed('http://localhost:5173', [], true), true);
  assert.equal(isOriginAllowed('http://127.0.0.1:3000', [], true), true);
  assert.equal(isOriginAllowed('http://[::1]:5173', [], true), true);
  assert.equal(isOriginAllowed('http://localhost:5173', [], false), false);
});

test('isOriginAllowed rejects a look-alike host that merely contains "localhost"', () => {
  assert.equal(isOriginAllowed('http://localhost.evil.com', [], true), false);
  assert.equal(isOriginAllowed('http://evil-localhost.com', [], true), false);
});

test('createCorsOriginChecker calls back with allow=true for an allowed origin', () => {
  const check = createCorsOriginChecker(['https://app.example.com'], false);
  check('https://app.example.com', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
  });
});

test('createCorsOriginChecker calls back with an error for a rejected origin', () => {
  const check = createCorsOriginChecker(['https://app.example.com'], false);
  check('https://evil.example.com', (err, allow) => {
    assert.ok(err instanceof Error);
    assert.equal(allow, undefined);
  });
});

test('createCorsOriginChecker respects allowLocalhost for dev origins', () => {
  const check = createCorsOriginChecker([], true);
  check('http://localhost:5173', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
  });
});
