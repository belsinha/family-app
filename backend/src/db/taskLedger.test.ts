import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(readFileSync(new URL('./schema-postgres-supabase.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../../../supabase/migrations/20261010201518_task_point_tracking.sql', import.meta.url), 'utf8'));
await db.exec(`INSERT INTO houses(id,name) VALUES(1,'One'),(2,'Two');
INSERT INTO users(id,name,role,house_id) VALUES(1,'Parent','parent',1),(2,'Other','parent',2);
INSERT INTO children(id,name,house_id,chore_member_id) VALUES(10,'Child',1,100),(20,'Other child',2,200);
INSERT INTO points(child_id,points,type,reason,parent_id) VALUES(10,5,'bonus','Legacy',1),(10,1,'demerit','Legacy',1);`);
after(() => db.close());

// Execute the real balance query implementation against a real isolated PostgreSQL engine.
const config = { taskPoints: { schemaReady: true, enabled: true } };
mock.module('../config.js', { namedExports: { config } });
mock.module('./supabase.js', { namedExports: { getSupabaseClient: () => ({
  from: (table: string) => {
    const values: unknown[] = []; const filters: string[] = [];
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: unknown) => { values.push(value); filters.push(`${key} = $${values.length}`); return builder; },
      is: (key: string, value: unknown) => { assert.equal(value, null); filters.push(`${key} IS NULL`); return builder; },
      then: (resolve: any, reject: any) => db.query(`SELECT points FROM ${table} WHERE ${filters.join(' AND ')}`, values).then(r => resolve({ data: r.rows, error: null }), reject),
    };
    return builder;
  },
}) } });
const { getChildBalance } = await import('./queries/points.js');
const insert = `INSERT INTO points(child_id,points,type,reason,parent_id,source,task_instance_id,task_house_id,task_actor_id,task_snapshot,request_id,request_fingerprint)
VALUES($1,$2,$3,'Parent reason',1,'task',50,$4,1,'{"taskName":"Task","taskDate":"2026-10-10","householdMemberId":100}', $5, $6)`;
const key = '10000000-0000-4000-8000-000000000001';
test('migration preserves legacy value; task points affect tracking totals only', async () => {
  assert.deepEqual(await getChildBalance(10), { bonus: 5, demerit: 1, balance: 4 });
  await db.query(insert, [10, 3, 'bonus', 1, key, 'a'.repeat(64)]);
  assert.deepEqual(await getChildBalance(10), { bonus: 8, demerit: 1, balance: 7 });
  assert.deepEqual(await getChildBalance(10, true), { bonus: 5, demerit: 1, balance: 4 });
  await db.query(insert, [10, 2, 'demerit', 1, '10000000-0000-4000-8000-000000000002', 'b'.repeat(64)]);
  assert.deepEqual(await getChildBalance(10), { bonus: 8, demerit: 3, balance: 5 });
  assert.deepEqual(await getChildBalance(10, true), { bonus: 5, demerit: 1, balance: 4 });
});
test('database rejects duplicate request IDs and cross-house task ledger rows', async () => {
  await assert.rejects(db.query(insert, [10, 3, 'bonus', 1, key, 'a'.repeat(64)]), /duplicate key/i);
  await assert.rejects(db.query(insert, [20, 3, 'bonus', 1, '10000000-0000-4000-8000-000000000003', 'c'.repeat(64)]), /foreign key/i);
  await assert.rejects(db.query(insert, [10, 0, 'bonus', 1, '10000000-0000-4000-8000-000000000004', 'd'.repeat(64)]), /check constraint/i);
  await assert.rejects(db.exec(`UPDATE children SET chore_member_id=100 WHERE id=20; UPDATE children SET house_id=1 WHERE id=20;`), /duplicate key/i);
});
test('audit intent cannot change or be deleted; void keeps original actor and excludes balance', async () => {
  await assert.rejects(db.exec(`UPDATE points SET points=99 WHERE request_id='${key}'`), /immutable/i);
  await assert.rejects(db.exec(`UPDATE points SET source='legacy' WHERE request_id='${key}'`), /immutable/i);
  await assert.rejects(db.exec(`DELETE FROM points WHERE request_id='${key}'`), /voided/i);
  await db.exec(`UPDATE points SET voided_at=now(),voided_by=1,void_reason='Correction' WHERE request_id='${key}'`);
  assert.deepEqual(await getChildBalance(10), { bonus: 5, demerit: 3, balance: 2 });
  assert.deepEqual(await getChildBalance(10, true), { bonus: 5, demerit: 1, balance: 4 });
  await assert.rejects(db.exec(`UPDATE points SET voided_at=NULL,voided_by=NULL,void_reason=NULL WHERE request_id='${key}'`), /reversed/i);
  const { rows } = await db.query(`SELECT task_actor_id,reason,void_reason FROM points WHERE request_id=$1`, [key]);
  assert.deepEqual(rows[0], { task_actor_id: 1, reason: 'Parent reason', void_reason: 'Correction' });
});
test('migration does not grant browser table access', async () => {
  const { rows } = await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname='points'`);
  assert.equal(rows[0].relrowsecurity, true);
  const { rows: policies } = await db.query(`SELECT * FROM pg_policies WHERE tablename IN ('children','points')`);
  assert.equal(policies.length, 0);
});
test('disabling task writes retains financial exclusion', async () => {
  config.taskPoints.enabled = false;
  config.taskPoints.schemaReady = false;
  assert.deepEqual(await getChildBalance(10, true), { bonus: 5, demerit: 1, balance: 4 });
  assert.deepEqual(await getChildBalance(10), { bonus: 5, demerit: 3, balance: 2 });
});
test('missing financial discriminator fails closed instead of treating task points as money', async () => {
  await db.exec('ALTER TABLE points DROP COLUMN source CASCADE');
  await assert.rejects(getChildBalance(10, true), /source.*does not exist/i);
});
