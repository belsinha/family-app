import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Point } from '../types.js';

const config = { chores: { houseId: 1 }, taskPoints: { enabled: true } };
const records: Point[] = [];
let taskExists = true;
let financialCalls = 0;
const children = [
  { id: 10, house_id: 1, chore_member_id: 100 },
  { id: 20, house_id: 2, chore_member_id: 200 },
  { id: 30, house_id: 1, chore_member_id: null },
];
mock.module('../config.js', { namedExports: { config } });
mock.module('../utils/auth.js', { namedExports: { verifyToken: (token: string) => {
  const fixtures: Record<string, unknown> = {
    parent: { userId: 1, role: 'parent', name: 'Parent' },
    other: { userId: 2, role: 'parent', name: 'Other' },
    child: { userId: 3, role: 'child', name: 'Child' },
    family: { userId: 4, role: 'family', name: 'Family' },
  };
  return fixtures[token] || null;
} } });
mock.module('../services/childAccess.js', { namedExports: {
  authorizeChildAccess: async (user: { userId: number }, id: number) => {
    const child = children.find(c => c.id === id);
    if (!child) return { ok: false, status: 404, error: 'Child not found' };
    if (child.house_id !== (user.userId === 2 ? 2 : 1)) return { ok: false, status: 403, error: 'Access denied' };
    return { ok: true, child };
  },
} });
mock.module('../db/prisma.js', { namedExports: { prisma: {
  taskInstance: { findUnique: async ({ where }: any) => taskExists && where.id === 50 ?
    { id: 50, assignedToId: 100, taskDate: '2026-10-10', template: { name: 'Selected task' } } :
    taskExists && where.id === 51 ? { id: 51, assignedToId: 999, taskDate: '2026-10-10', template: { name: 'Other task' } } : null },
} } });
mock.module('../db/queries/points.js', { namedExports: {
  getPointById: async (id: number) => records.find(p => p.id === id) || null,
} });
mock.module('../services/bitcoin.js', { namedExports: {
  getOrFetchPrice: async () => { financialCalls++; throw new Error('Financial call forbidden'); },
} });
mock.module('../db/queries/task-points.js', { namedExports: {
  getTaskPointRequest: async (actor: number, requestId: string) => records.find(p => p.task_actor_id === actor && p.request_id === requestId) || null,
  insertTaskPoint: async (r: any, actor: number, house: number, snapshot: any, fingerprint: string) => {
    const previous = records.find(p => p.task_actor_id === actor && p.request_id === r.requestId);
    if (previous) return { point: previous, replayed: true };
    const point: Point = { id: records.length + 1, child_id: r.childId, points: r.points,
      type: r.type, reason: r.reason, parent_id: actor, task_actor_id: actor,
      source: 'task', task_house_id: house, task_instance_id: r.taskInstanceId,
      task_snapshot: snapshot, request_id: r.requestId, request_fingerprint: fingerprint,
      created_at: '2026-10-10' };
    records.push(point); return { point, replayed: false };
  },
  voidTaskPoint: async (p: Point, actor: number, reason: string) => {
    if (!p.voided_at) Object.assign(p, { voided_at: '2026-10-10', voided_by: actor, void_reason: reason });
    return p;
  },
} });
const { default: router } = await import('./task-points.js');
const app = express(); app.use(express.json()); app.use('/api/points', router);
app.use((err: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/points`;
after(() => new Promise<void>(resolve => server.close(() => resolve())));
const intent = { childId: 10, taskInstanceId: 50, points: 3, type: 'bonus', reason: 'Parent supplied reason', requestId: '10000000-0000-4000-8000-000000000001' };
async function send(body: any, token = 'parent', path = '/task') {
  return fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
test('task write requires authentication and a parent', async () => {
  for (const [token, status] of [['', 401], ['child', 403], ['family', 403]] as const) {
    assert.equal((await send(intent, token)).status, status);
  }
});
test('rejects missing/invalid intent, guessed member mapping and other-house children', async () => {
  for (const change of [{ points: 0 }, { points: -1 }, { points: 1.5 }, { points: '3' }, { type: 'penalty' }, { reason: '' }, { requestId: 'not-uuid' }, { childId: '10' }]) {
    assert.equal((await send({ ...intent, ...change })).status, 400);
  }
  assert.equal((await send({ ...intent, childId: 20 })).status, 403);
  assert.equal((await send({ ...intent, childId: 20 }, 'other')).status, 403);
  assert.equal((await send({ ...intent, childId: 30 })).status, 409);
  assert.equal((await send({ ...intent, taskInstanceId: 51 })).status, 403);
  assert.equal((await send({ ...intent, taskInstanceId: 99 })).status, 404);
});
test('records supplied points and immutable task/actor context without financial calls', async () => {
  const response = await send(intent); assert.equal(response.status, 201);
  const { point, replayed } = await response.json() as any;
  assert.equal(replayed, false); assert.equal(point.points, 3);
  assert.equal(point.task_actor_id, 1); assert.equal(point.task_house_id, 1);
  assert.deepEqual(point.task_snapshot, { taskName: 'Selected task', taskDate: '2026-10-10', householdMemberId: 100 });
  assert.equal(financialCalls, 0);
});
test('concurrent identical retries return the original; changed intent conflicts', async () => {
  const responses = await Promise.all(Array.from({ length: 5 }, () => send(intent)));
  assert.ok(responses.every(r => r.status === 200)); assert.equal(records.length, 1);
  assert.equal((await send({ ...intent, points: 4 })).status, 409);
  assert.equal((await send({ ...intent, type: 'demerit' })).status, 409);
});
test('replay survives task deletion; correction preserves reason and actor history', async () => {
  taskExists = false;
  assert.equal((await send(intent)).status, 200);
  assert.equal((await send({ reason: '' }, 'parent', '/1/void')).status, 400);
  assert.equal((await send({ reason: 'Correction' }, 'other', '/1/void')).status, 403);
  const response = await send({ reason: 'Correction' }, 'parent', '/1/void');
  assert.equal(response.status, 200);
  const p = await response.json() as any;
  assert.equal(p.reason, intent.reason); assert.equal(p.voided_by, 1); assert.equal(p.void_reason, 'Correction');
  assert.equal((await send(intent)).status, 200); assert.equal(records.length, 1);
});
test('new endpoints remain unavailable until explicitly enabled', async () => {
  config.taskPoints.enabled = false;
  assert.equal((await send(intent)).status, 503);
  assert.equal((await send({ reason: 'Correction' }, 'parent', '/1/void')).status, 503);
});
