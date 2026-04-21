import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looksStructuredChorePdf,
  parseStructuredChoreListFromText,
  matchCategoryId,
  resolveAssigneeIdsFromPersonHint,
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
Task: Sort recycling
Category: Home Maintenance
Area: Garage
Person: Alex Rivera
Day: n/a
Time: Afternoon
Frequency: Weekly
`;

test('looksStructuredChorePdf detects key:value chore export', () => {
  assert.equal(looksStructuredChorePdf(SAMPLE), true);
  assert.equal(looksStructuredChorePdf('just some random lines\nno structure'), false);
});

test('parseStructuredChoreListFromText maps area, time, frequency, anyone', () => {
  const raw = parseStructuredChoreListFromText(SAMPLE);
  assert.equal(raw.length, 3);
  const walk = raw.find((r) => r.name.includes('Walk dog'));
  assert.ok(walk);
  assert.equal(walk!.houseArea, 'OUTDOOR');
  assert.equal(walk!.timeBlock, 'MORNING');
  assert.equal(walk!.frequencyType, 'DAILY');
  assert.equal(walk!.anyoneMayComplete, false);
  assert.equal(walk!.personHint, null);

  const breakfast = raw.find((r) => r.name.includes('Prepare breakfast'));
  assert.ok(breakfast);
  assert.equal(breakfast!.houseArea, 'KITCHEN');
  assert.equal(breakfast!.anyoneMayComplete, true);

  const recycle = raw.find((r) => r.name.includes('recycling'));
  assert.ok(recycle);
  assert.equal(recycle!.personHint, 'Alex Rivera');
  assert.equal(recycle!.frequencyType, 'WEEKLY');
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

test('matchCategoryId token overlap suggests category before first-category fallback', () => {
  const cats = [
    { id: 1, name: 'Kitchen' },
    { id: 2, name: 'Pet Care' },
  ];
  const r = matchCategoryId('feed pets morning', cats);
  assert.equal(r.id, 2);
  assert.equal(r.match, 'suggested');
});

test('resolveAssigneeIdsFromPersonHint matches household names', () => {
  const members = [
    { id: 10, name: 'Alex Rivera' },
    { id: 11, name: 'Sam' },
  ];
  assert.deepEqual(resolveAssigneeIdsFromPersonHint('Alex Rivera', false, members), [10]);
  assert.deepEqual(resolveAssigneeIdsFromPersonHint('Sam and Alex Rivera', false, members), [11, 10]);
  assert.deepEqual(resolveAssigneeIdsFromPersonHint('Anyone', true, members), []);
});
