import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Proves the production startup gate is wired into the real boot path, not just tested in
 * isolation (see startupSecurityGate.test.ts): each case actually spawns `node` importing
 * config.ts — the module server.ts imports first — and asserts the process exits nonzero.
 */

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RELEVANT_KEYS = [
  'NODE_ENV',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CHORES_HOUSE_ID',
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'ALLOWED_ORIGINS',
  'PUBLIC_APP_ORIGIN',
  'CHORES_DATABASE_URL',
  'DATABASE_PATH',
];

const VALID_PRODUCTION_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz0123456789', // gitleaks:allow synthetic test fixture
  CHORES_HOUSE_ID: '1',
  JWT_SECRET: 'Qz7$kP2!vN9#mR4@xT6^wL1&hB8*yC3(dF5)gJ0-uK',
  SUPABASE_URL: 'https://abcxyzcorp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789', // gitleaks:allow synthetic test fixture
  ALLOWED_ORIGINS: 'https://app.example-family.com',
  CHORES_DATABASE_URL: 'file:/opt/render/project/src/persist/chores.db',
  DATABASE_PATH: '/opt/render/project/src/persist/family-app.db',
};

// DATABASE_PATH is set above only to match a real render.yaml deploy — it is legacy/unused on the
// server.ts boot path (see startupSecurityGate.ts), so the gate does not check it.

function runConfigWithEnv(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Strip any of the developer's real local values first so results only depend on the
  // explicit VALID_PRODUCTION_ENV + overrides below, never on whatever's in a local .env/.
  for (const key of RELEVANT_KEYS) delete env[key];
  Object.assign(env, VALID_PRODUCTION_ENV);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/config.ts'], {
    cwd: backendRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000,
  });
}

test('production startup gate (spawned process)', async (t) => {
  await t.test('exits 0 for a fully valid production config', () => {
    const result = runConfigWithEnv({});
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr:\n${result.stderr}`);
  });

  await t.test('exits nonzero and explains why for a weak/placeholder JWT_SECRET', () => {
    const result = runConfigWithEnv({ JWT_SECRET: 'dev-only-insecure-secret-change-me' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET/);
  });

  await t.test('exits nonzero when SUPABASE_URL/key are missing entirely', () => {
    const result = runConfigWithEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SUPABASE_URL/);
  });

  await t.test('exits nonzero for a placeholder SUPABASE_URL', () => {
    const result = runConfigWithEnv({ SUPABASE_URL: 'https://your-project-ref.supabase.co' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SUPABASE_URL/);
  });

  await t.test('exits nonzero when ALLOWED_ORIGINS (and PUBLIC_APP_ORIGIN) are both unset', () => {
    const result = runConfigWithEnv({ ALLOWED_ORIGINS: undefined });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ALLOWED_ORIGINS/);
  });

  await t.test('exits nonzero for a relative CHORES_DATABASE_URL', () => {
    const result = runConfigWithEnv({ CHORES_DATABASE_URL: 'file:./data/chores.db' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CHORES_DATABASE_URL/);
  });

  await t.test('boots fine with a relative DATABASE_PATH (dead config, not gated)', () => {
    const result = runConfigWithEnv({ DATABASE_PATH: './data/family-app.db' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr:\n${result.stderr}`);
  });

  await t.test('development boots fine even with a weak/absent JWT_SECRET (dev fallback, not gated)', () => {
    const result = runConfigWithEnv({ NODE_ENV: 'development', JWT_SECRET: undefined, ALLOWED_ORIGINS: undefined, CHORES_DATABASE_URL: undefined, DATABASE_PATH: undefined });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr:\n${result.stderr}`);
  });
});
