import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectProductionStartupProblems,
  formatProductionStartupProblems,
  isWeakJwtSecret,
  DEV_ONLY_JWT_SECRET,
} from './startupSecurityGate.js';

const STRONG_JWT_SECRET = 'Qz7$kP2!vN9#mR4@xT6^wL1&hB8*yC3(dF5)gJ0-uK';

const VALID_PRODUCTION_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: STRONG_JWT_SECRET,
  SUPABASE_URL: 'https://abcxyzcorp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789',
  ALLOWED_ORIGINS: 'https://app.example-family.com',
  CHORES_DATABASE_URL: 'file:/opt/render/project/src/persist/chores.db',
};

test('isWeakJwtSecret', async (t) => {
  await t.test('rejects short secrets', () => {
    assert.equal(isWeakJwtSecret('short'), true);
  });

  await t.test('rejects the dev-only default even if it were long enough', () => {
    assert.equal(isWeakJwtSecret(DEV_ONLY_JWT_SECRET), true);
  });

  await t.test('rejects placeholder-looking long strings', () => {
    assert.equal(isWeakJwtSecret('please-change-me-before-deploying-to-prod-1234'), true);
  });

  await t.test('rejects low-entropy long strings', () => {
    assert.equal(isWeakJwtSecret('a'.repeat(40)), true);
    assert.equal(isWeakJwtSecret('abcabcabcabcabcabcabcabcabcabcabcabcabcabc'), true);
  });

  await t.test('accepts a long random-looking secret', () => {
    assert.equal(isWeakJwtSecret(STRONG_JWT_SECRET), false);
  });
});

test('collectProductionStartupProblems', async (t) => {
  await t.test('returns no problems for a fully valid production config', () => {
    assert.deepEqual(collectProductionStartupProblems(VALID_PRODUCTION_ENV), []);
  });

  await t.test('flags a missing JWT_SECRET', () => {
    const env = { ...VALID_PRODUCTION_ENV, JWT_SECRET: undefined };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.some((p) => /JWT_SECRET is not set/.test(p)));
  });

  await t.test('flags a weak JWT_SECRET', () => {
    const env = { ...VALID_PRODUCTION_ENV, JWT_SECRET: DEV_ONLY_JWT_SECRET };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.some((p) => /JWT_SECRET is too weak/.test(p)));
  });

  await t.test('flags a missing SUPABASE_URL / key', () => {
    const env = { ...VALID_PRODUCTION_ENV, SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.some((p) => /SUPABASE_URL is not set/.test(p)));
    assert.ok(problems.some((p) => /SUPABASE_ANON_KEY/.test(p)));
  });

  await t.test('flags a placeholder SUPABASE_URL copied from .env.example', () => {
    const env = { ...VALID_PRODUCTION_ENV, SUPABASE_URL: 'https://your-project-ref.supabase.co' };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.some((p) => /SUPABASE_URL/.test(p) && /placeholder/.test(p)));
  });

  await t.test('flags a placeholder SUPABASE_ANON_KEY copied from .env.example', () => {
    const env = { ...VALID_PRODUCTION_ENV, SUPABASE_ANON_KEY: 'your_publishable_or_anon_key_here' };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.some((p) => /SUPABASE_ANON_KEY.*placeholder/.test(p)));
  });

  await t.test('accepts SUPABASE_PUBLISHABLE_KEY in place of SUPABASE_ANON_KEY', () => {
    const env = { ...VALID_PRODUCTION_ENV, SUPABASE_ANON_KEY: undefined, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_realvalue0123456789' };
    assert.deepEqual(collectProductionStartupProblems(env), []);
  });

  await t.test('flags a missing ALLOWED_ORIGINS (and no PUBLIC_APP_ORIGIN fallback)', () => {
    const env = { ...VALID_PRODUCTION_ENV, ALLOWED_ORIGINS: undefined };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.some((p) => /ALLOWED_ORIGINS/.test(p)));
  });

  await t.test('accepts PUBLIC_APP_ORIGIN alone as satisfying the CORS requirement', () => {
    const env = { ...VALID_PRODUCTION_ENV, ALLOWED_ORIGINS: undefined, PUBLIC_APP_ORIGIN: 'https://app.example-family.com' };
    assert.deepEqual(collectProductionStartupProblems(env), []);
  });

  await t.test('flags a relative CHORES_DATABASE_URL', () => {
    const env = { ...VALID_PRODUCTION_ENV, CHORES_DATABASE_URL: 'file:./data/chores.db' };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.some((p) => /CHORES_DATABASE_URL/.test(p) && /relative/.test(p)));
  });

  await t.test('does not gate on DATABASE_PATH (dead config outside the sql.js boot path)', () => {
    const env = { ...VALID_PRODUCTION_ENV, DATABASE_PATH: './data/family-app.db' };
    assert.deepEqual(collectProductionStartupProblems(env), []);
  });

  await t.test('reports every problem at once, not just the first', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    const problems = collectProductionStartupProblems(env);
    assert.ok(problems.length >= 4);
  });
});

test('formatProductionStartupProblems renders a header, bullet list, and remediation hint', () => {
  const message = formatProductionStartupProblems(['JWT_SECRET is not set.', 'ALLOWED_ORIGINS is not set.']);
  assert.match(message, /Refusing to start in production/);
  assert.match(message, /- JWT_SECRET is not set\./);
  assert.match(message, /- ALLOWED_ORIGINS is not set\./);
  assert.match(message, /Render Dashboard/);
});
