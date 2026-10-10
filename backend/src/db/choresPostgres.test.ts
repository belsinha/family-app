import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '../../generated/chores-postgres/index.js';
// Scripts are intentionally independent of application startup/config.
// @ts-expect-error JavaScript CLI helpers have no declaration file.
import { readSnapshot, importSnapshot } from '../../scripts/chores-snapshot.mjs';

const migration = readFileSync(new URL('../../../supabase/migrations/20261010205952_chores_postgres_persistence.sql', import.meta.url), 'utf8');
const fixture = {
  sha256: 'a'.repeat(64), sequences: { ChoreCategory: 40, HouseholdMember: 20, TaskTemplate: 30, TaskInstance: 50, MonthlyAllowance: 60 },
  rows: {
    ChoreCategory: [{ id: 10, name: 'Category', sortOrder: 2 }],
    HouseholdMember: [{ id: 20, name: 'Member', canEditChores: false }],
    TaskTemplate: [{ id: 30, name: 'Task', description: 'Description', categoryId: 10, houseArea: 'NONE', frequencyType: 'DAILY', dayOfWeek: null, weekOfMonth: null, dayOfMonth: null, semiannualMonths: null, conditionalDayOfWeek: null, conditionalAfterTime: null, timeBlock: 'ANY', pointsBase: 1, active: true, anyoneMayComplete: false }],
    TaskTemplateAssignee: [{ templateId: 30, householdMemberId: 20 }],
    TaskInstance: [{ id: 50, templateId: 30, assignedToId: 20, allowanceLiabilityMemberId: 20, taskDate: '2026-05-02', status: 'DONE', doneAt: '2026-05-02T12:00:00Z', doneWithoutReminder: true, notes: null, complaintLogged: false, isExtra: false, availableAfter: null, excuseStatus: 'NONE', excuseNote: null, excuseRequestedAt: null, excuseDecidedAt: null, excuseDeciderUserId: null }],
    MonthlyAllowance: [{ id: 60, yearMonth: '2026-05', householdMemberId: 20, baseCents: 10000, requiredChoreCount: 1, completedChoreCount: 1, pendingChoreCount: 0, missedChoreCount: 0, excusedChoreCount: 0, proposedCents: 10000, status: 'APPROVED', submittedAt: '2026-05-02', decidedAt: '2026-05-03', approverUserId: 1, rejectionReason: null }],
  },
};
async function target() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated; ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO anon, authenticated;');
  await db.exec('CREATE TABLE houses(id bigint PRIMARY KEY); INSERT INTO houses VALUES(1); CREATE TABLE points(id integer PRIMARY KEY, points integer); INSERT INTO points VALUES(1,7);');
  await db.exec(migration);
  return db;
}
test('import preserves all six model values/IDs, permissions, history, allowance decisions and sequences; financial rows untouched', async () => {
  const db = await target();
  try {
    const result = await importSnapshot(db, fixture, 1);
    assert.equal(result.counts.TaskInstance, 1);
    assert.deepEqual((await db.query('SELECT * FROM points')).rows, [{ id: 1, points: 7 }]);
    assert.equal((await db.query<{ houseId: number }>('SELECT "houseId" FROM chores."StoreMetadata"')).rows[0].houseId, 1);
    const member = await db.query<{ id: number }>('INSERT INTO chores."HouseholdMember"(name) VALUES($1) RETURNING id', ['Next']);
    assert.equal(member.rows[0].id, 21);
    const category = await db.query<{ id: number }>('INSERT INTO chores."ChoreCategory"(name) VALUES($1) RETURNING id', ['Next']);
    assert.equal(category.rows[0].id, 41);
    const security = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='chores' AND relkind='r'");
    assert.equal(security.rows.length, 7);
    assert.ok(security.rows.every(r => r.relrowsecurity));
    assert.deepEqual((await db.query("SELECT has_schema_privilege('anon','chores','USAGE') AS schema, has_table_privilege('anon','chores.\"TaskInstance\"','SELECT') AS anon, has_table_privilege('authenticated','chores.\"TaskInstance\"','UPDATE') AS authenticated")).rows[0], { schema: false, anon: false, authenticated: false });
    await assert.rejects(importSnapshot(db, fixture, 1), /occupied/);
    await assert.rejects(db.exec(migration), /already exists/);
    await db.exec('ROLLBACK');
  } finally { await db.close(); }
});
test('missing house and broken relationships fail atomically, with no partial imported rows', async () => {
  const db = await target();
  try {
    await assert.rejects(importSnapshot(db, fixture, 2), /house does not exist/);
    const bad = structuredClone(fixture); bad.rows.TaskInstance[0].templateId = 999;
    await assert.rejects(importSnapshot(db, bad, 1), /foreign key/);
    assert.equal((await db.query<{ count: number }>('SELECT count(*) AS count FROM chores."ChoreCategory"')).rows[0].count, 0);
    assert.equal((await db.query<{ count: number }>('SELECT count(*) AS count FROM chores."StoreMetadata"')).rows[0].count, 0);
    assert.equal((await db.query<{ id: number }>('INSERT INTO chores."ChoreCategory"(name) VALUES($1) RETURNING id', ['After rollback'])).rows[0].id, 1);
  } finally { await db.close(); }
});
test('generated Postgres Prisma client reads relations and performs existing task/allowance transactions', async () => {
  const db = await target();
  await importSnapshot(db, fixture, 1);
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
  let client: PrismaClient | undefined;
  try {
    await server.start();
    const url = new URL(`postgresql://postgres@${server.getServerConn()}/postgres`);
    url.searchParams.set('schema', 'chores'); url.searchParams.set('connection_limit', '1');
    client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const task = await client.taskInstance.findUniqueOrThrow({ where: { id: 50 }, include: { template: { include: { assignees: { include: { member: true } } } }, assignedTo: true } });
    assert.equal(task.template.assignees[0].member.canEditChores, false);
    assert.equal(task.doneWithoutReminder, true);
    await client.$transaction(async tx => {
      await tx.taskInstance.update({ where: { id: 50 }, data: { status: 'PENDING', doneAt: null } });
      await tx.monthlyAllowance.update({ where: { yearMonth_householdMemberId: { yearMonth: '2026-05', householdMemberId: 20 } }, data: { status: 'REJECTED', rejectionReason: 'Review' } });
    });
    assert.equal((await client.monthlyAllowance.findUniqueOrThrow({ where: { id: 60 } })).status, 'REJECTED');
    await client.$disconnect();
    client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    assert.equal((await client.taskInstance.findUniqueOrThrow({ where: { id: 50 } })).status, 'PENDING');
  } finally { await client?.$disconnect(); await server.stop(); await db.close(); }
});
test('accepted recovery baseline dry-run reconciles exactly when explicitly provided; never required in CI', async t => {
  const filename = process.env.CHORES_RECOVERY_TEST_FILE;
  if (!filename) { t.skip('Private baseline stays outside source control.'); return; }
  const source = await readSnapshot(filename, '333a1d239f60a79ddc721b3ee1ff58f392144718d9c387b913051a7c07711665');
  const db = await target();
  try {
    const result = await importSnapshot(db, source, 1);
    assert.deepEqual(result.counts, { ChoreCategory: 9, HouseholdMember: 4, TaskTemplate: 47, TaskTemplateAssignee: 47, TaskInstance: 22, MonthlyAllowance: 0 });
  } finally { await db.close(); }
});
