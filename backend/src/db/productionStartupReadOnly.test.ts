import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const calls: string[] = [];
let houses: { id: number }[] = [{ id: 1 }];
const forbidden = async () => { throw new Error('Startup attempted a mutation'); };
mock.module('../config.js', { namedExports: { config: { isProduction: true } } });
mock.module('./prisma.js', { namedExports: { assertChoresStoreReady: async () => { calls.push('chores-read-check'); } } });
mock.module('./supabase.js', { namedExports: {
  initSupabaseConnection: async () => { calls.push('connect'); },
  getSupabaseClient: () => ({ from: (table: string) => {
    assert.equal(table, 'houses');
    return { select: () => ({ limit: async () => ({ data: houses, error: null }) }) };
  } }),
} });
mock.module('./seed-supabase.js', { namedExports: { seedDatabase: forbidden } });
mock.module('./migrate-bitcoin-tables.js', { namedExports: { migrateBitcoinTables: forbidden, cleanupOrphanedConversions: forbidden } });
mock.module('./migrate-project-tables.js', { namedExports: { migrateProjectsTable: forbidden, migrateWorkLogsForProjects: forbidden } });
mock.module('./productionCredentialCheck.js', { namedExports: { assertProductionCredentialsAreSafe: async () => { calls.push('credential-read-check'); } } });
const { initDatabase } = await import('./init-supabase.js');

test('production startup checks readiness and credentials without legacy financial cleanup, migrations or seeding', async () => {
  await initDatabase();
  assert.deepEqual(calls, ['connect', 'chores-read-check', 'credential-read-check']);
});
test('production refuses empty house setup without creating accounts', async () => {
  houses = [];
  await assert.rejects(initDatabase(), /automatic seeding is disabled/);
});
