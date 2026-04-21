import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looksStructuredChorePdf,
  parseStructuredChoreListFromText,
  matchCategoryId,
} from './choreImportParse.js';

const SAMPLE = `Task: Walk dog
Category: Daily Cleaning
Area: Outdoor / yard
Person: n/a
Day: n/a
Time: Morning
Frequency: Daily
Task: Prepare breakfast
Category: Home Maintenance
Area: Kitchen
Person: Anyone
Day: n/a
Time: Morning
Frequency: Daily
`;

test('looksStructuredChorePdf detects key:value chore export', () => {
  assert.equal(looksStructuredChorePdf(SAMPLE), true);
  assert.equal(looksStructuredChorePdf('just some random lines\nno structure'), false);
});

test('parseStructuredChoreListFromText maps area, time, frequency, anyone', () => {
  const raw = parseStructuredChoreListFromText(SAMPLE);
  assert.equal(raw.length, 2);
  const walk = raw.find((r) => r.name.includes('Walk dog'));
  assert.ok(walk);
  assert.equal(walk!.houseArea, 'OUTDOOR');
  assert.equal(walk!.timeBlock, 'MORNING');
  assert.equal(walk!.frequencyType, 'DAILY');
  assert.equal(walk!.anyoneMayComplete, false);

  const breakfast = raw.find((r) => r.name.includes('Prepare breakfast'));
  assert.ok(breakfast);
  assert.equal(breakfast!.houseArea, 'KITCHEN');
  assert.equal(breakfast!.anyoneMayComplete, true);
});

test('parseStructuredChoreListFromText weekly monthly and as-needed', () => {
  const text = `Task: Full house reset
Category: Weekly Cleaning
Area: All areas
Person: n/a
Day: Saturday
Time: n/a
Frequency: Weekly
Task: Fridge clean
Category: Monthly Cleaning
Area: Kitchen
Person: n/a
Day: Saturday
Time: n/a
Frequency: Monthly
Task: Wipe spill
Category: Daily Cleaning
Area: Kitchen
Person: n/a
Day: n/a
Time: n/a
Frequency: As needed
`;
  const raw = parseStructuredChoreListFromText(text);
  assert.equal(raw.length, 3);
  const w = raw.find((r) => r.name.includes('Full house'));
  assert.equal(w?.frequencyType, 'WEEKLY');
  assert.equal(w?.dayOfWeek, 6);
  const m = raw.find((r) => r.name.includes('Fridge'));
  assert.equal(m?.frequencyType, 'MONTHLY');
  assert.equal(m?.weekOfMonth, 1);
  const a = raw.find((r) => r.name.includes('spill'));
  assert.equal(a?.frequencyType, 'DAILY');
  assert.ok(a?.description?.includes('As needed'));
});

test('matchCategoryId partial match', () => {
  const cats = [
    { id: 1, name: 'Kitchen' },
    { id: 2, name: 'Daily Cleaning' },
  ];
  const r = matchCategoryId('Daily Cleaning', cats);
  assert.equal(r.id, 2);
  assert.equal(r.match, 'exact');
});
