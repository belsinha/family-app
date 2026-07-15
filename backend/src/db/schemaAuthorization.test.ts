import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(dbDir, 'schema-postgres-supabase.sql'), 'utf8');
const bitcoinMigration = readFileSync(resolve(dbDir, 'migrate-bitcoin-tables.ts'), 'utf8');
const projectMigration = readFileSync(resolve(dbDir, 'migrate-project-tables.ts'), 'utf8');
const initMigration = readFileSync(resolve(dbDir, 'init-supabase.ts'), 'utf8');

test('Supabase application tables are deny-by-default under RLS', () => {
  const tables = [
    'houses',
    'users',
    'children',
    'points',
    'bitcoin_price_cache',
    'bitcoin_conversions',
    'projects',
    'work_logs',
    'active_timers',
    'challenges',
    'challenge_progress',
    'child_onchain_wallets',
    'child_credit_payouts',
  ];

  for (const table of tables) {
    assert.match(
      schema,
      new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
      `${table} must have RLS enabled`
    );
  }
  assert.doesNotMatch(schema, /CREATE\s+POLICY/i, 'browser-facing roles must have no table policies');
});

test('work logs enforce child and project ownership with the same house key', () => {
  assert.match(
    schema,
    /FOREIGN KEY\s*\(child_id,\s*house_id\)\s*REFERENCES\s+children\s*\(id,\s*house_id\)/i
  );
  assert.match(
    schema,
    /FOREIGN KEY\s*\(project_id,\s*house_id\)\s*REFERENCES\s+projects\s*\(id,\s*house_id\)/i
  );
});

test('active timers enforce child and project ownership with the same house key', () => {
  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS active_timers[\s\S]*FOREIGN KEY\s*\(child_id,\s*house_id\)\s*REFERENCES\s+children\s*\(id,\s*house_id\)/i
  );
  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS active_timers[\s\S]*FOREIGN KEY\s*\(project_id,\s*house_id\)\s*REFERENCES\s+projects\s*\(id,\s*house_id\)/i
  );
});

test('runtime-created Supabase tables also enable RLS', () => {
  assert.match(bitcoinMigration, /ALTER TABLE bitcoin_price_cache ENABLE ROW LEVEL SECURITY/);
  assert.match(bitcoinMigration, /ALTER TABLE bitcoin_conversions ENABLE ROW LEVEL SECURITY/);
  assert.match(projectMigration, /ALTER TABLE projects ENABLE ROW LEVEL SECURITY/);
  assert.match(initMigration, /ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY/);
  assert.match(initMigration, /ALTER TABLE active_timers ENABLE ROW LEVEL SECURITY/);
});
