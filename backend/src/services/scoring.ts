/**
 * Scoring rules (weekly):
 * - DONE: +pointsBase (default 1)
 * - DONE without reminder: +1 bonus in addition to base
 * - MISSED: -2
 * - complaintLogged: -1
 * - isExtra (voluntary): +2
 *
 * Classification:
 * - Green: >= 40
 * - Yellow: 25 to 39
 * - Red: < 25
 */

export type WeekClassification = 'green' | 'yellow' | 'red';

export function pointsForInstance(instance: {
  status: string;
  doneWithoutReminder: boolean;
  complaintLogged: boolean;
  isExtra: boolean;
  template?: { pointsBase: number };
}): number {
  const base = instance.template?.pointsBase ?? 1;
  if (instance.status === 'DONE') {
    let p = base;
    if (instance.doneWithoutReminder) p += 1;
    if (instance.complaintLogged) p -= 1;
    return p;
  }
  if (instance.status === 'MISSED') {
    let p = -2;
    if (instance.complaintLogged) p -= 1;
    return p;
  }
  if (instance.isExtra) return 2;
  return 0;
}

export function classifyWeek(totalPoints: number): WeekClassification {
  if (totalPoints >= 40) return 'green';
  if (totalPoints >= 25) return 'yellow';
  return 'red';
}
