import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

const child = { id: 10, house_id: 1, chore_member_id: null as number | null };
let writes = 0;
let conflict = false;
mock.module('../config.js', { namedExports: { config: { chores: { houseId: 1 }, taskPoints: { enabled: true } } } });
mock.module('../utils/auth.js', { namedExports: { verifyToken: (token: string) => token ?
  { userId: token === 'other' ? 2 : 1, role: token === 'child' ? 'child' : 'parent', name: 'Fixture' } : null } });
mock.module('../services/childAccess.js', { namedExports: {
  listAccessibleChildren: async () => [child],
  authorizeChildAccess: async (user: any, id: any) => {
    if (user.userId === 2) return { ok: false, status: 403, error: 'Access denied' };
    if (Number(id) !== child.id) return { ok: false, status: 404, error: 'Child not found' };
    return { ok: true, child };
  },
} });
mock.module('../db/prisma.js', { namedExports: { prisma: { householdMember: { findUnique: async ({ where }: any) => where.id === 100 ? { id: 100, name: 'Different display name' } : null } } } });
mock.module('../db/supabase.js', { namedExports: { getSupabaseClient: () => ({
  from: (table: string) => {
    assert.equal(table, 'children'); const b: any = {
      update: (value: any) => { writes++; child.chore_member_id = value.chore_member_id; return b; },
      eq: (key: string, value: number) => { assert.equal(value, key === 'id' ? 10 : 1); return b; },
      select: () => b, single: async () => conflict ? { data: null, error: { code: '23505' } } : { data: child, error: null },
    }; return b;
  },
}) } });
const { default: router } = await import('./children.js');
const app = express(); app.use(express.json()); app.use('/children', router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/children/10/chore-member`;
after(() => new Promise<void>(resolve => server.close(() => resolve())));
const send = (member: any, token = 'parent') => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ householdMemberId: member }) });
test('mapping cannot be created anonymously, by a child or by another house', async () => {
  assert.equal((await send(100, '')).status, 401);
  assert.equal((await send(100, 'child')).status, 403);
  assert.equal((await send(100, 'other')).status, 403);
  assert.equal(writes, 0);
});
test('mapping rejects invalid or absent member IDs and records explicit parent selection', async () => {
  assert.equal((await send('100')).status, 400);
  assert.equal((await send(999)).status, 404);
  assert.equal(writes, 0);
  const response = await send(100); assert.equal(response.status, 200);
  assert.equal((await response.json() as any).chore_member_id, 100);
  assert.equal(writes, 1);
});
test('duplicate household member link returns a conflict', async () => {
  conflict = true; assert.equal((await send(100)).status, 409);
});
