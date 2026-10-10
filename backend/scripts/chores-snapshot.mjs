import fs from 'node:fs';
import { createHash } from 'node:crypto';
import initSqlJs from 'sql.js';
import { tables } from './chores-tables.mjs';

export const importOrder = ['ChoreCategory', 'HouseholdMember', 'TaskTemplate', 'TaskTemplateAssignee', 'TaskInstance', 'MonthlyAllowance'];
export const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
export const canonical = (rows, columns) => JSON.stringify(rows.map(row => columns.map(c => row[c])));

/** Reads only into memory. Never writes SQLite, emits rows, or loads application config. */
export async function readSnapshot(filename, expectedSha) {
  const bytes = fs.readFileSync(filename);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (expectedSha && expectedSha !== sha256) throw new Error('Source checksum differs from the approved baseline.');
  const SQL = await initSqlJs();
  const db = new SQL.Database(bytes);
  const query = sql => {
    const result = db.exec(sql)[0];
    return result ? result.values.map(row => Object.fromEntries(result.columns.map((c, i) => [c, row[i]]))) : [];
  };
  try {
    if (query('PRAGMA integrity_check').some(row => Object.values(row)[0] !== 'ok')) throw new Error('Source integrity failed.');
    if (query('PRAGMA foreign_key_check').length) throw new Error('Source foreign keys failed.');
    const rows = {}, sequences = {};
    for (const name of importOrder) {
      const spec = tables[name];
      const columns = query(`PRAGMA table_info(${quote(name)})`).map(c => c.name).sort();
      if (JSON.stringify(columns) !== JSON.stringify([...spec.columns].sort())) throw new Error(`Unexpected source schema: ${name}.`);
      rows[name] = query(`SELECT ${spec.columns.map(quote).join(',')} FROM ${quote(name)} ORDER BY ${spec.sequence ? 'id' : 'templateId, householdMemberId'}`);
      for (const row of rows[name]) for (const key of spec.booleans) {
        if (row[key] !== 0 && row[key] !== 1) throw new Error(`Invalid source boolean: ${name}.${key}.`);
        row[key] = Boolean(row[key]);
      }
      if (spec.sequence) {
        const seq = query(`SELECT seq FROM sqlite_sequence WHERE name='${name}'`)[0]?.seq ?? 0;
        sequences[name] = Math.max(seq, ...rows[name].map(row => row.id), 0);
        if (!Number.isSafeInteger(sequences[name]) || sequences[name] < 0 || sequences[name] >= 2147483647) throw new Error(`Invalid source sequence: ${name}.`);
      }
    }
    return { sha256, rows, sequences };
  } finally { db.close(); }
}

export function summary(snapshot) {
  return { sourceSha256: snapshot.sha256, counts: Object.fromEntries(importOrder.map(name => [name, snapshot.rows[name].length])) };
}

/** Caller must provide an isolated connection. No overwrite, delete, upsert or financial SQL. */
export async function importSnapshot(db, snapshot, houseId) {
  if (!Number.isSafeInteger(houseId) || houseId <= 0) throw new Error('An explicit positive house ID is required.');
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await db.query(`LOCK TABLE ${[...importOrder, 'StoreMetadata'].map(n => `chores.${quote(n)}`).join(',')} IN ACCESS EXCLUSIVE MODE`);
    const house = await db.query('SELECT id FROM public.houses WHERE id=$1 FOR SHARE', [houseId]);
    if (house.rows.length !== 1) throw new Error('Target house does not exist.');
    for (const name of [...importOrder, 'StoreMetadata']) {
      const result = await db.query(`SELECT count(*) AS count FROM chores.${quote(name)}`);
      if (Number(result.rows[0].count) !== 0) throw new Error('Target chores store is occupied; refusing overwrite.');
    }
    for (const name of importOrder) {
      const spec = tables[name];
      for (const row of snapshot.rows[name]) {
        await db.query(`INSERT INTO chores.${quote(name)} (${spec.columns.map(quote).join(',')}) VALUES (${spec.columns.map((_,i) => `$${i+1}`).join(',')})`, spec.columns.map(c => row[c]));
      }
      const result = await db.query(`SELECT ${spec.columns.map(quote).join(',')} FROM chores.${quote(name)} ORDER BY ${spec.sequence ? 'id' : '"templateId", "householdMemberId"'}`);
      if (canonical(result.rows, spec.columns) !== canonical(snapshot.rows[name], spec.columns)) throw new Error(`Reconciliation failed: ${name}.`);
      if (spec.sequence) {
        const nextId = snapshot.sequences[name] + 1;
        if (!Number.isSafeInteger(nextId) || nextId < 1 || nextId > 2147483647) throw new Error('Invalid source sequence.');
        // ALTER RESTART is transactional; setval would survive a later rollback.
        await db.query(`ALTER SEQUENCE chores.${quote(`${name}_id_seq`)} RESTART WITH ${nextId}`);
      }
    }
    await db.query('INSERT INTO chores."StoreMetadata" (id,"houseId","sourceSha256") VALUES (1,$1,$2)', [houseId, snapshot.sha256]);
    await db.query('COMMIT');
    return summary(snapshot);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
