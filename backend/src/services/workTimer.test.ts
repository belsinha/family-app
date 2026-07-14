import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeElapsedSeconds,
  elapsedSecondsToLoggedHours,
  exceedsTimerCap,
  MAX_TIMER_SECONDS,
  MIN_LOGGED_HOURS,
} from './workTimer.js';

test('computeElapsedSeconds measures wall-clock time from started_at', () => {
  const now = new Date('2026-07-14T12:00:00Z');
  assert.equal(computeElapsedSeconds('2026-07-14T10:00:00Z', now), 7200);
  assert.equal(computeElapsedSeconds('2026-07-14T11:59:58.400Z', now), 1); // floors partial seconds
  assert.equal(computeElapsedSeconds('2026-07-14T12:00:00Z', now), 0);
});

test('computeElapsedSeconds clamps a future started_at (clock skew) to 0', () => {
  const now = new Date('2026-07-14T12:00:00Z');
  assert.equal(computeElapsedSeconds('2026-07-14T13:00:00Z', now), 0);
});

test('computeElapsedSeconds treats an unparseable started_at as 0', () => {
  assert.equal(computeElapsedSeconds('not-a-date', new Date()), 0);
});

test('elapsedSecondsToLoggedHours rounds to 2 decimals with a positive floor', () => {
  assert.equal(elapsedSecondsToLoggedHours(7200), 2);
  assert.equal(elapsedSecondsToLoggedHours(5400), 1.5);
  assert.equal(elapsedSecondsToLoggedHours(3599), 1); // 0.9997h rounds to 1.00
  // A stop after a few seconds still logs the minimum so hours > 0 validation passes
  assert.equal(elapsedSecondsToLoggedHours(5), MIN_LOGGED_HOURS);
  assert.equal(elapsedSecondsToLoggedHours(0), MIN_LOGGED_HOURS);
});

test('elapsedSecondsToLoggedHours caps at 24 hours', () => {
  assert.equal(elapsedSecondsToLoggedHours(MAX_TIMER_SECONDS), 24);
  assert.equal(elapsedSecondsToLoggedHours(MAX_TIMER_SECONDS + 3600), 24);
  assert.equal(exceedsTimerCap(MAX_TIMER_SECONDS), false);
  assert.equal(exceedsTimerCap(MAX_TIMER_SECONDS + 1), true);
});
