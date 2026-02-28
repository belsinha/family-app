import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shouldGenerateForDate } from './taskGenerator.js';

describe('taskGenerator.shouldGenerateForDate', () => {
  it('DAILY always generates', () => {
    const d = new Date('2025-02-15');
    assert.strictEqual(
      shouldGenerateForDate(
        { frequencyType: 'DAILY', dayOfWeek: null, weekOfMonth: null, dayOfMonth: null, semiannualMonths: null },
        d
      ).generate,
      true
    );
  });

  it('EVERY_OTHER_DAY alternates by date parity', () => {
    const jan1 = new Date(2020, 0, 1);
    const jan2 = new Date(2020, 0, 2);
    const t = { frequencyType: 'EVERY_OTHER_DAY', dayOfWeek: null, weekOfMonth: null, dayOfMonth: null, semiannualMonths: null };
    const first = shouldGenerateForDate(t, jan1).generate;
    const second = shouldGenerateForDate(t, jan2).generate;
    assert.strictEqual(first, true);
    assert.strictEqual(second, false);
  });

  it('WEEKLY generates only on matching day (0=Sun, 4=Thu)', () => {
    const thursday = new Date(2025, 1, 13);
    const friday = new Date(2025, 1, 14);
    assert.strictEqual(thursday.getDay(), 4);
    assert.strictEqual(friday.getDay(), 5);
    const t = { frequencyType: 'WEEKLY', dayOfWeek: 4, weekOfMonth: null, dayOfMonth: null, semiannualMonths: null };
    assert.strictEqual(shouldGenerateForDate(t, thursday).generate, true);
    assert.strictEqual(shouldGenerateForDate(t, friday).generate, false);
  });

  it('MONTHLY weekOfMonth: first week only', () => {
    const firstWeek = new Date(2025, 1, 3);
    const secondWeek = new Date(2025, 1, 10);
    const t = { frequencyType: 'MONTHLY', dayOfWeek: null, weekOfMonth: 1, dayOfMonth: null, semiannualMonths: null };
    assert.strictEqual(shouldGenerateForDate(t, firstWeek).generate, true);
    assert.strictEqual(shouldGenerateForDate(t, secondWeek).generate, false);
  });

  it('MONTHLY dayOfMonth: only on that day', () => {
    const onDay = new Date(2025, 1, 15);
    const other = new Date(2025, 1, 16);
    const t = { frequencyType: 'MONTHLY', dayOfWeek: null, weekOfMonth: null, dayOfMonth: 15, semiannualMonths: null };
    assert.strictEqual(shouldGenerateForDate(t, onDay).generate, true);
    assert.strictEqual(shouldGenerateForDate(t, other).generate, false);
  });

  it('SEMIANNUAL generates in January and July', () => {
    const jan = new Date(2025, 0, 15);
    const jul = new Date(2025, 6, 15);
    const feb = new Date(2025, 1, 15);
    const t = { frequencyType: 'SEMIANNUAL', dayOfWeek: null, weekOfMonth: null, dayOfMonth: null, semiannualMonths: '[1,7]' };
    assert.strictEqual(shouldGenerateForDate(t, jan).generate, true);
    assert.strictEqual(shouldGenerateForDate(t, jul).generate, true);
    assert.strictEqual(shouldGenerateForDate(t, feb).generate, false);
  });

  it('CONDITIONAL_SCHEDULE generates only on correct day (Thursday = 4)', () => {
    const thursday = new Date(2025, 1, 13);
    const friday = new Date(2025, 1, 14);
    const t = { frequencyType: 'CONDITIONAL_SCHEDULE', dayOfWeek: 4, weekOfMonth: null, dayOfMonth: null, semiannualMonths: null };
    assert.strictEqual(shouldGenerateForDate(t, thursday).generate, true);
    assert.strictEqual(shouldGenerateForDate(t, friday).generate, false);
  });
});
