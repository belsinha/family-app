import { describe, it } from 'node:test';
import assert from 'node:assert';
import { pointsForInstance, classifyWeek } from './scoring.js';

describe('scoring', () => {
  describe('pointsForInstance', () => {
    it('DONE gives base points (1)', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'DONE',
          doneWithoutReminder: false,
          complaintLogged: false,
          isExtra: false,
          template: { pointsBase: 1 },
        }),
        1
      );
    });

    it('DONE without reminder gives base + 1 bonus', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'DONE',
          doneWithoutReminder: true,
          complaintLogged: false,
          isExtra: false,
          template: { pointsBase: 1 },
        }),
        2
      );
    });

    it('DONE with custom pointsBase uses it', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'DONE',
          doneWithoutReminder: false,
          complaintLogged: false,
          isExtra: false,
          template: { pointsBase: 3 },
        }),
        3
      );
    });

    it('DONE with complaintLogged subtracts 1', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'DONE',
          doneWithoutReminder: false,
          complaintLogged: true,
          isExtra: false,
          template: { pointsBase: 1 },
        }),
        0
      );
    });

    it('MISSED gives -2', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'MISSED',
          doneWithoutReminder: false,
          complaintLogged: false,
          isExtra: false,
        }),
        -2
      );
    });

    it('MISSED with complaintLogged gives -3', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'MISSED',
          doneWithoutReminder: false,
          complaintLogged: true,
          isExtra: false,
        }),
        -3
      );
    });

    it('isExtra gives +2', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'PENDING',
          doneWithoutReminder: false,
          complaintLogged: false,
          isExtra: true,
        }),
        2
      );
    });

    it('PENDING (no extra) gives 0', () => {
      assert.strictEqual(
        pointsForInstance({
          status: 'PENDING',
          doneWithoutReminder: false,
          complaintLogged: false,
          isExtra: false,
        }),
        0
      );
    });
  });

  describe('classifyWeek', () => {
    it('>= 40 is green', () => {
      assert.strictEqual(classifyWeek(40), 'green');
      assert.strictEqual(classifyWeek(50), 'green');
    });
    it('25 to 39 is yellow', () => {
      assert.strictEqual(classifyWeek(25), 'yellow');
      assert.strictEqual(classifyWeek(39), 'yellow');
    });
    it('< 25 is red', () => {
      assert.strictEqual(classifyWeek(24), 'red');
      assert.strictEqual(classifyWeek(0), 'red');
    });
  });
});
