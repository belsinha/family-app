/**
 * Runs prisma/seed-chores.ts with CHORES_SEED_RESET=1 so all templates (and cascaded task instances) are removed,
 * then canonical templates from seed-chores.ts are re-inserted. Use only when you intend to wipe chore history.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.env.CHORES_SEED_RESET = '1';

const result = spawnSync(
  'node',
  ['scripts/with-chores-db-url.mjs', 'npx', 'tsx', 'prisma/seed-chores.ts'],
  {
    stdio: 'inherit',
    cwd: backendRoot,
    env: process.env,
    shell: true,
  }
);
process.exit(result.status ?? 1);
