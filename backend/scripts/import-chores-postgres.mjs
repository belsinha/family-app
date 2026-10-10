import { parseArgs } from 'node:util';
import { readSnapshot, importSnapshot, summary } from './chores-snapshot.mjs';
import pg from 'pg';

// Default is offline validation. No dotenv/config import, credential logging or startup side effects.
const { values } = parseArgs({ options: {
  source: { type: 'string' }, 'expected-sha': { type: 'string' },
  'house-id': { type: 'string' }, 'project-ref': { type: 'string' },
  apply: { type: 'boolean', default: false },
} });
let client;
try {
  if (!values.source || !/^[a-f0-9]{64}$/.test(values['expected-sha'] ?? '')) throw new Error('Specify source and approved SHA-256.');
  const snapshot = await readSnapshot(values.source, values['expected-sha']);
  if (values.apply) {
    const houseId = Number(values['house-id']);
    const ref = values['project-ref'];
    const url = new URL(process.env.CHORES_DATABASE_URL ?? '');
    if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !Number.isSafeInteger(houseId) || houseId <= 0) throw new Error('Specify the approved project and house.');
    const direct = url.hostname === `db.${ref}.supabase.co`;
    const session = url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username).endsWith(`.${ref}`);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !session) || (url.port && url.port !== '5432') || !['require', 'verify-full'].includes(url.searchParams.get('sslmode')) || url.searchParams.get('schema') !== 'chores') throw new Error('Use the approved Supabase direct/session TLS connection with schema=chores.');
    // Remove Prisma's schema parameter before handing the URL to node-postgres.
    url.searchParams.delete('schema');
    client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    console.log(JSON.stringify(await importSnapshot(client, snapshot, houseId)));
  } else console.log(JSON.stringify({ mode: 'offline-dry-run', ...summary(snapshot) }));
} catch {
  // Driver errors may contain row values or connection details; do not print them.
  console.error('Chores import failed. No partial import was committed. Check approved source, target access/schema and empty-target requirements privately.');
  process.exitCode = 1;
} finally { await client?.end(); }
