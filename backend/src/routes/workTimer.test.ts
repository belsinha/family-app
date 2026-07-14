process.env.SUPABASE_URL ||= 'https://fake-test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'fake-test-anon-key';

import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ActiveTimer, Child, Project, WorkLog } from '../types.js';
import { generateToken } from '../utils/auth.js';

const children: Child[] = [
  { id: 10, name: 'Isabel', user_id: 2, house_id: 1 },
  { id: 20, name: 'Mallory', user_id: 4, house_id: 2 },
];

const projects: Project[] = [
  {
    id: 500,
    house_id: 1,
    name: 'Treehouse',
    description: null,
    start_date: '2026-01-01',
    end_date: null,
    bonus_rate: 2,
    status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 600,
    house_id: 2,
    name: 'Other house project',
    description: null,
    start_date: '2026-01-01',
    end_date: null,
    bonus_rate: 2,
    status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

let timers: ActiveTimer[] = [];
let workLogs: WorkLog[] = [];

class TimerAlreadyRunningError extends Error {}

mock.module('../services/childAccess.js', {
  namedExports: {
    authorizeChildAccess: async (
      user: { userId: number; role: string },
      childIdRaw: number | string
    ) => {
      const childId = Number(childIdRaw);
      const child = children.find((candidate) => candidate.id === childId);
      if (!child) return { ok: false, status: 404, error: 'Child not found' };
      if (user.role === 'family') return { ok: false, status: 403, error: 'Access denied' };
      if (user.role === 'child') {
        return child.user_id === user.userId
          ? { ok: true, child }
          : { ok: false, status: 403, error: 'Access denied' };
      }
      const parentHouse = user.userId === 1 ? 1 : user.userId === 3 ? 2 : null;
      return parentHouse === child.house_id
        ? { ok: true, child }
        : { ok: false, status: 403, error: 'Access denied' };
    },
    listAccessibleChildren: async () => [],
  },
});

mock.module('../db/queries/children.js', {
  namedExports: {
    getChildByUserId: async (userId: number) =>
      children.find((child) => child.user_id === userId) ?? null,
  },
});

mock.module('../db/queries/projects.js', {
  namedExports: {
    getProjectById: async (projectId: number, houseId: number) =>
      projects.find((project) => project.id === projectId && project.house_id === houseId) ?? null,
  },
});

mock.module('../db/queries/work-timers.js', {
  namedExports: {
    TimerAlreadyRunningError,
    getActiveTimerByChildId: async (childId: number, houseId: number) =>
      timers.find((timer) => timer.child_id === childId && timer.house_id === houseId) ?? null,
    startActiveTimer: async (houseId: number, childId: number, projectId: number) => {
      if (timers.some((timer) => timer.child_id === childId)) {
        throw new TimerAlreadyRunningError();
      }
      const project = projects.find((candidate) => candidate.id === projectId) ?? null;
      const timer: ActiveTimer = {
        id: timers.length + 1,
        house_id: houseId,
        child_id: childId,
        project_id: projectId,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        project,
      };
      timers.push(timer);
      return timer;
    },
    claimActiveTimer: async (childId: number, houseId: number) => {
      const index = timers.findIndex(
        (timer) => timer.child_id === childId && timer.house_id === houseId
      );
      return index < 0 ? null : timers.splice(index, 1)[0];
    },
  },
});

mock.module('../db/queries/work-logs.js', {
  namedExports: {
    addWorkLog: async (
      houseId: number,
      childId: number,
      projectId: number,
      hours: number,
      description: string,
      workDate: string
    ) => {
      const workLog: WorkLog = {
        id: workLogs.length + 1,
        house_id: houseId,
        child_id: childId,
        project_id: projectId,
        hours,
        description,
        work_date: workDate,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      workLogs.push(workLog);
      return workLog;
    },
    getWorkLogsByChildId: async () => [],
    updateWorkLog: async () => null,
    getWorkLogById: async () => null,
    getPendingWorkLogs: async () => [],
    updateWorkLogStatus: async () => null,
  },
});

mock.module('../db/queries/points.js', { namedExports: { addPoints: async () => ({ id: 1 }) } });
mock.module('../services/bitcoin.js', { namedExports: { getOrFetchPrice: async () => null } });
mock.module('../db/queries/bitcoin.js', { namedExports: { createConversion: async () => ({}) } });
mock.module('../services/houseAccess.js', {
  namedExports: { authorizeHouseAccess: async () => ({ ok: false, status: 403, error: 'unused' }) },
});

const { default: workLogsRouter } = await import('./work-logs.js');

const tokens = {
  child: generateToken({ id: 2, name: 'Isabel', role: 'child', house_id: 1 }),
  otherChild: generateToken({ id: 4, name: 'Mallory', role: 'child', house_id: 2 }),
  parent: generateToken({ id: 1, name: 'Parent', role: 'parent', house_id: 1 }),
  otherParent: generateToken({ id: 3, name: 'Other parent', role: 'parent', house_id: 2 }),
  family: generateToken({ id: 5, name: 'Family', role: 'family', house_id: 1 }),
};

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/work-logs', workLogsRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/work-logs`;
});

after(() => server?.close());
beforeEach(() => {
  timers = [];
  workLogs = [];
});

async function call(method: string, path: string, token: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as any };
}

test('child starts and reloads a server-persisted timer for their house', async () => {
  const started = await call('POST', '/timer/start', tokens.child, { childId: 10, projectId: 500 });
  assert.equal(started.status, 201);
  assert.equal(started.json.timer.house_id, 1);

  const active = await call('GET', '/timer/active', tokens.child);
  assert.equal(active.status, 200);
  assert.equal(active.json.active, true);
  assert.equal(active.json.timer.project.name, 'Treehouse');
});

test('timer start rejects a project from another house', async () => {
  const response = await call('POST', '/timer/start', tokens.child, {
    childId: 10,
    projectId: 600,
  });
  assert.equal(response.status, 404);
  assert.equal(timers.length, 0);
});

test('parents cannot access a child timer from another house', async () => {
  const response = await call('GET', '/timer/active?childId=20', tokens.parent);
  assert.equal(response.status, 403);
});

test('family accounts cannot access child timers', async () => {
  const response = await call('GET', '/timer/active?childId=10', tokens.family);
  assert.equal(response.status, 403);
});

test('one active timer per child returns the running timer on duplicate start', async () => {
  await call('POST', '/timer/start', tokens.child, { childId: 10, projectId: 500 });
  const duplicate = await call('POST', '/timer/start', tokens.child, {
    childId: 10,
    projectId: 500,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.timer.child_id, 10);
  assert.equal(timers.length, 1);
});

test('stop claims the timer and creates a house-scoped pending work log', async () => {
  await call('POST', '/timer/start', tokens.child, { childId: 10, projectId: 500 });
  timers[0].started_at = new Date(Date.now() - 3600_000).toISOString();

  const stopped = await call('POST', '/timer/stop', tokens.child, {
    childId: 10,
    description: ' Built walls ',
  });
  assert.equal(stopped.status, 201);
  assert.equal(stopped.json.stopped, true);
  assert.equal(stopped.json.workLog.house_id, 1);
  assert.equal(stopped.json.workLog.description, 'Built walls');
  assert.ok(stopped.json.workLog.hours >= 1 && stopped.json.workLog.hours < 1.01);
  assert.equal(timers.length, 0);
});

test('duplicate stop is an idempotent no-op', async () => {
  const stopped = await call('POST', '/timer/stop', tokens.child, { childId: 10 });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.json.stopped, false);
  assert.equal(workLogs.length, 0);
});

test('same-house parent can read a child timer while another house cannot', async () => {
  await call('POST', '/timer/start', tokens.child, { childId: 10, projectId: 500 });
  assert.equal((await call('GET', '/timer/active?childId=10', tokens.parent)).status, 200);
  assert.equal((await call('GET', '/timer/active?childId=10', tokens.otherParent)).status, 403);
  assert.equal((await call('GET', '/timer/active?childId=10', tokens.otherChild)).status, 403);
});
