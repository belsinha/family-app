import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidYearMonth,
  getCalendarMonthBounds,
  DEFAULT_BASE_ALLOWANCE_CENTS,
} from './allowance.js';

test('getCalendarMonthBounds April', () => {
  assert.deepEqual(getCalendarMonthBounds('2026-04'), {
    start: '2026-04-01',
    end: '2026-04-30',
  });
});

test('getCalendarMonthBounds February leap year', () => {
  assert.deepEqual(getCalendarMonthBounds('2024-02'), {
    start: '2024-02-01',
    end: '2024-02-29',
  });
});

test('invalid yearMonth throws', () => {
  assert.throws(() => assertValidYearMonth('2026-13'), /YYYY-MM/);
  assert.throws(() => assertValidYearMonth('26-04'), /YYYY-MM/);
});

test('default base is one hundred dollars in cents', () => {
  assert.equal(DEFAULT_BASE_ALLOWANCE_CENTS, 10_000);
});
