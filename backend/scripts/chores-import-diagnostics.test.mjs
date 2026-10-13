import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { safeErrorCode, queryStage } from './chores-import-diagnostics.mjs';

test('diagnostic codes are allowlisted and never include secret-bearing driver fields', () => {
  const error = { code: '28P01', message: 'PASSWORD_CANARY', detail: 'ROW_CANARY', stack: 'URL_CANARY' };
  assert.equal(safeErrorCode(error), '28P01');
  assert.equal(safeErrorCode({ code: 'PASSWORD_CANARY' }), 'UNCLASSIFIED');
  assert.equal(safeErrorCode({ message: 'SELF_SIGNED_CERT_IN_CHAIN' }), 'UNCLASSIFIED');
  assert.equal(queryStage('COMMIT'), 'commit');
  assert.equal(queryStage('SELECT count(*) FROM chores."TaskInstance"'), 'empty_target_check');
});
test('CLI source failure emits sanitized stage/code without connection or unsafe error data', () => {
  const run = spawnSync(process.execPath, ['scripts/import-chores-postgres.mjs', '--source', '/missing/SECRET_CANARY', '--expected-sha', 'a'.repeat(64)], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', env: { CHORES_DATABASE_URL: 'postgresql://secret:URL_CANARY@invalid/postgres' },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /"stage":"source_validation","code":"UNCLASSIFIED"/);
  assert.doesNotMatch(run.stderr, /SECRET_CANARY|URL_CANARY|postgresql:|ENOENT|at read/);
});
