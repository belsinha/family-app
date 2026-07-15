/**
 * Route-level authorization / IDOR tests (adversarial).
 *
 * Runs the real routers + auth middleware against in-memory mocks of the Supabase-backed
 * query modules and the chores Prisma client, with a two-house fixture:
 *
 *   house 1: parent Rommel (user 1), child Isabel (user 2 → child 10),
 *            family account Familia (user 5), child Nicholas (user 6 → child 30)
 *   house 2: parent Stranger (user 3), child Mallory (user 4 → child 20)
 *
 * Verifies: anonymous requests fail; children only reach their own records; the family
 * role gets no child-scoped or parent-only access; a child cannot escalate to chore
 * editor via the X-Editor-User-Id header; and one house cannot read or mutate another.
 *
 * Requires --experimental-test-module-mocks (see backend package.json test script).
 */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://fake-project.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'fake-anon-key';
process.env.CHORES_SKIP_MIGRATE_ON_START = '1';

import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Child, Point, User, WorkLog } from '../types.js';

// ── Fixture ────────────────────────────────────────────────────────────────

const users: User[] = [
  { id: 1, name: 'Rommel', role: 'parent', house_id: 1 },
  { id: 2, name: 'Isabel', role: 'child', house_id: 1 },
  { id: 3, name: 'Rommel', role: 'parent', house_id: 2 },
  { id: 4, name: 'Mallory', role: 'child', house_id: 2 },
  { id: 5, name: 'Familia', role: 'family', house_id: 1 },
  { id: 6, name: 'Nicholas', role: 'child', house_id: 1 },
  { id: 7, name: 'Orphan', role: 'child', house_id: null },
];

const children: Child[] = [
  { id: 10, name: 'Isabel', user_id: 2, house_id: 1 },
  { id: 20, name: 'Mallory', user_id: 4, house_id: 2 },
  { id: 30, name: 'Nicholas', user_id: 6, house_id: 1 },
  { id: 50, name: 'Bad legacy family link', user_id: 5, house_id: 1 },
  { id: 40, name: 'Orphan', user_id: 7, house_id: null },
];

const points: Point[] = [
  { id: 100, child_id: 10, points: 5, type: 'bonus', reason: null, created_at: '2026-07-01', parent_id: 1 },
  { id: 200, child_id: 20, points: 5, type: 'bonus', reason: null, created_at: '2026-07-01', parent_id: 3 },
];

const project = {
  id: 500,
  house_id: 1,
  name: 'Treehouse',
  description: null,
  start_date: '2026-01-01',
  end_date: null,
  bonus_rate: 2,
  status: 'active' as const,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const projectHouse2 = {
  ...project,
  id: 600,
  house_id: 2,
  name: 'Other house project',
};

const projects = [project, projectHouse2];

const workLogs: WorkLog[] = [
  { id: 300, house_id: 1, child_id: 10, project_id: 500, hours: 1, description: '', work_date: '2026-07-01', status: 'pending', created_at: '2026-07-01', project },
  { id: 310, house_id: 2, child_id: 20, project_id: 600, hours: 1, description: '', work_date: '2026-07-01', status: 'pending', created_at: '2026-07-01', project: projectHouse2 },
];

const challenges = [
  { id: 400, child_id: 20, title: 'Read', description: null, deadline: '2026-08-01', reward_type: 'custom' as const, reward_points: null, reward_description: null, target_number: null, target_unit: null, status: 'active' as const, rewarded_at: null, created_at: '2026-07-01', created_by: 3 },
  { id: 410, child_id: 10, title: 'Swim', description: null, deadline: '2026-08-01', reward_type: 'custom' as const, reward_points: null, reward_description: null, target_number: null, target_unit: null, status: 'active' as const, rewarded_at: null, created_at: '2026-07-01', created_by: 1 },
];

// Chores household (single-house SQLite world). Member 1 has edit rights; the child
// login "Isabel" maps to member 3 (no edit rights); child login "Nicholas" → member 4 (editor).
const householdMembers = [
  { id: 1, name: 'Celiane', canEditChores: true },
  { id: 2, name: 'Rommel', canEditChores: true },
  { id: 3, name: 'Isabel', canEditChores: false },
  { id: 4, name: 'Nicholas', canEditChores: true },
];

const choreCategory = { id: 1, name: 'General', sortOrder: 0 };
const choreTemplates = [
  {
    id: 1,
    name: 'Isabel task',
    description: null,
    categoryId: 1,
    category: choreCategory,
    frequencyType: 'DAILY',
    dayOfWeek: null,
    weekOfMonth: null,
    dayOfMonth: null,
    semiannualMonths: null,
    conditionalDayOfWeek: null,
    conditionalAfterTime: null,
    timeBlock: 'ANY',
    pointsBase: 1,
    active: true,
    anyoneMayComplete: false,
    houseArea: 'NONE',
    assignees: [{ householdMemberId: 3, member: householdMembers[2] }],
  },
  {
    id: 2,
    name: 'Nicholas task',
    description: null,
    categoryId: 1,
    category: choreCategory,
    frequencyType: 'DAILY',
    dayOfWeek: null,
    weekOfMonth: null,
    dayOfMonth: null,
    semiannualMonths: null,
    conditionalDayOfWeek: null,
    conditionalAfterTime: null,
    timeBlock: 'ANY',
    pointsBase: 1,
    active: true,
    anyoneMayComplete: false,
    houseArea: 'NONE',
    assignees: [{ householdMemberId: 4, member: householdMembers[3] }],
  },
];

const choreInstances = choreTemplates.map((template, index) => ({
  id: index + 1,
  templateId: template.id,
  template,
  assignedToId: template.assignees[0].householdMemberId,
  assignedTo: template.assignees[0].member,
  allowanceLiabilityMemberId: null,
  allowanceLiabilityMember: null,
  taskDate: '2026-07-15',
  status: 'PENDING',
  doneAt: null,
  doneWithoutReminder: false,
  notes: null,
  complaintLogged: false,
  isExtra: false,
  availableAfter: null,
  excuseStatus: 'NONE',
  excuseNote: null,
  excuseRequestedAt: null,
  excuseDecidedAt: null,
  excuseDeciderUserId: null,
}));

const allowanceLines = [3, 4].map((householdMemberId, index) => ({
  id: index + 1,
  yearMonth: '2026-07',
  householdMemberId,
  householdMember: householdMembers.find((m) => m.id === householdMemberId),
  status: 'PENDING_APPROVAL',
}));

// ── Module mocks (must precede the dynamic imports of the routers) ────────

mock.module('../db/queries/users.js', {
  namedExports: {
    getAllUsers: async () => users,
    getUsersByHouseId: async (houseId: number) => users.filter((u) => u.house_id === houseId),
    getUserById: async (id: number) => users.find((u) => u.id === id) ?? null,
    getUsersByRole: async (role: string) => users.filter((u) => u.role === role),
    getUserByName: async (name: string) => users.find((u) => u.name === name) ?? null,
    getUserByIdWithPassword: async (id: number) => users.find((u) => u.id === id) ?? null,
    updateUserPassword: async () => true,
  },
});

mock.module('../db/queries/children.js', {
  namedExports: {
    getAllChildren: async () => children,
    getChildById: async (id: number) => children.find((c) => c.id === id) ?? null,
    getChildrenByHouseId: async (houseId: number) => children.filter((c) => c.house_id === houseId),
    getChildByUserId: async (userId: number) => children.find((c) => c.user_id === userId) ?? null,
  },
});

mock.module('../db/queries/points.js', {
  namedExports: {
    addPoints: async (childId: number, pts: number, type: string) =>
      ({ id: 999, child_id: childId, points: pts, type, reason: null, created_at: 'now', parent_id: null }),
    getPointsByChildId: async (childId: number) => points.filter((p) => p.child_id === childId),
    getChildBalance: async () => ({ bonus: 10, demerit: 0, balance: 10 }),
    getMostRecentPoint: async (childId: number) => points.find((p) => p.child_id === childId) ?? null,
    getPointsByChildIdLast7Days: async (childId: number) => points.filter((p) => p.child_id === childId),
    getPointById: async (id: number) => points.find((p) => p.id === id) ?? null,
    deletePoint: async () => true,
  },
});

mock.module('../db/queries/bitcoin.js', {
  namedExports: {
    createConversion: async () => ({ id: 1, point_id: 1, child_id: 1, satoshis: 1 }),
    getConversionsByChildId: async () => [],
    deleteConversionByPointId: async () => true,
  },
});

mock.module('../db/queries/work-logs.js', {
  namedExports: {
    addWorkLog: async (houseId: number, childId: number) => ({ ...workLogs[0], id: 998, house_id: houseId, child_id: childId }),
    getWorkLogsByChildId: async (childId: number, houseId: number) =>
      workLogs.filter((w) => w.child_id === childId && children.find((c) => c.id === w.child_id)?.house_id === houseId),
    updateWorkLog: async () => workLogs[0],
    getWorkLogById: async (id: number, houseId: number) =>
      workLogs.find((w) => w.id === id && children.find((c) => c.id === w.child_id)?.house_id === houseId) ?? null,
    getPendingWorkLogs: async (houseId: number) =>
      workLogs.filter((w) => children.find((c) => c.id === w.child_id)?.house_id === houseId),
    updateWorkLogStatus: async () => workLogs[0],
  },
});

mock.module('../db/queries/projects.js', {
  namedExports: {
    createProject: async (houseId: number, name: string) => ({ ...project, id: 999, house_id: houseId, name }),
    getAllProjects: async (houseId: number) => projects.filter((p) => p.house_id === houseId),
    getActiveProjects: async (houseId: number) => projects.filter((p) => p.house_id === houseId),
    getProjectById: async (id: number, houseId: number) =>
      projects.find((p) => p.id === id && p.house_id === houseId) ?? null,
    updateProject: async () => project,
    deleteProject: async () => true,
  },
});

mock.module('../db/queries/project-stats.js', {
  namedExports: { getAllProjectsStatistics: async () => [] },
});

mock.module('../db/queries/challenges.js', {
  namedExports: {
    createChallenge: async () => challenges[0],
    getChallengesByChildId: async (childId: number) => challenges.filter((c) => c.child_id === childId),
    getChallengeById: async (id: number) => challenges.find((c) => c.id === id) ?? null,
    updateChallenge: async (id: number) => challenges.find((c) => c.id === id) ?? challenges[0],
    getProgressByChallengeId: async () => [],
    addProgressEntry: async () => ({ id: 1 }),
  },
});

mock.module('../db/queries/payouts.js', {
  namedExports: {
    createPayout: async () => ({ id: 1 }),
    getPayoutsByChildId: async () => [],
    getTotalWithdrawnSatoshis: async () => 0,
  },
});

mock.module('../db/queries/onchainWallets.js', {
  namedExports: {
    getOrCreateWalletForChild: async () => ({ id: 1, child_id: 10, receive_address: 'tb1qtest', network: 'testnet' }),
    updateSyncTimestamp: async () => undefined,
  },
});

mock.module('../services/bitcoin.js', {
  namedExports: {
    getOrFetchPrice: async () => null,
    refreshPriceCache: async () => ({ price_usd: 1, fetched_at: new Date() }),
  },
});

mock.module('../services/bitcoinWallet.js', {
  namedExports: {
    deriveChildAddress: () => 'tb1qtest',
    getConfiguredNetwork: () => 'testnet',
    buildAndSignTx: () => ({ hex: '', txid: '', fee: 0 }),
    getHotWalletAddress: () => 'tb1qhot',
    isSigningEnabled: () => false,
  },
});

mock.module('../services/chainIndex.js', {
  namedExports: {
    getAddressBalance: async () => ({ confirmedSat: 0, unconfirmedSat: 0 }),
    getUtxos: async () => [],
    broadcastTx: async () => '',
    getRecommendedFeeRate: async () => 1,
  },
});

mock.module('../db/migrate-bitcoin-tables.js', {
  namedExports: { cleanupOrphanedConversions: async () => 0 },
});

mock.module('../services/taskGenerator.js', {
  namedExports: { ensureInstancesForDate: async () => undefined },
});

type PrismaStub = Record<string, any>;
const prismaStub: PrismaStub = {
  householdMember: {
    findUnique: async ({ where: { id } }: any) => householdMembers.find((m) => m.id === id) ?? null,
    findFirst: async () => householdMembers.find((m) => m.canEditChores) ?? null,
    findMany: async () => [...householdMembers],
    count: async () => householdMembers.length,
    createMany: async () => ({ count: 0 }),
  },
  choreCategory: {
    count: async () => 1,
    create: async ({ data }: any) => ({ id: 99, ...data }),
    findMany: async () => [],
    findUnique: async () => null,
    update: async () => ({}),
    delete: async () => ({}),
  },
  taskTemplate: {
    count: async () => 0,
    findMany: async ({ where }: any = {}) => {
      const memberId = where?.OR?.[0]?.assignees?.some?.householdMemberId;
      return memberId == null
        ? choreTemplates
        : choreTemplates.filter((t) =>
            t.anyoneMayComplete || t.assignees.some((a) => a.householdMemberId === memberId)
          );
    },
    findUnique: async ({ where: { id } }: any) => choreTemplates.find((t) => t.id === id) ?? null,
    findUniqueOrThrow: async () => { throw new Error('not found'); },
    create: async ({ data }: any) => ({ id: 1, ...data }),
    update: async () => ({}),
    delete: async () => ({}),
  },
  taskTemplateAssignee: {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  },
  taskInstance: {
    findMany: async ({ where }: any = {}) => {
      const memberId = where?.OR?.[0]?.assignedToId;
      return memberId == null
        ? choreInstances
        : choreInstances.filter((i) => i.assignedToId === memberId || i.template.anyoneMayComplete);
    },
    findUnique: async ({ where: { id } }: any) => choreInstances.find((i) => i.id === id) ?? null,
    update: async ({ where: { id }, data }: any) => ({
      ...(choreInstances.find((i) => i.id === id) ?? choreInstances[0]),
      ...data,
    }),
  },
  monthlyAllowance: {
    findMany: async ({ where }: any = {}) =>
      allowanceLines.filter(
        (line) =>
          (where?.yearMonth == null || line.yearMonth === where.yearMonth) &&
          (where?.householdMemberId == null || line.householdMemberId === where.householdMemberId)
      ),
    findUnique: async ({ where: { id } }: any) => allowanceLines.find((line) => line.id === id) ?? null,
    update: async () => ({}),
    upsert: async () => ({}),
  },
  $executeRawUnsafe: async () => 0,
  $executeRaw: async () => 0,
  $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prismaStub)),
};
mock.module('../db/prisma.js', { namedExports: { prisma: prismaStub } });

// ── App assembly (mirrors routes/index.ts, without the write rate limiter) ─

const { generateToken } = await import('../utils/auth.js');
const usersRoutes = (await import('./users.js')).default;
const authRoutes = (await import('./auth.js')).default;
const childrenRoutes = (await import('./children.js')).default;
const pointsRoutes = (await import('./points.js')).default;
const bitcoinRoutes = (await import('./bitcoin.js')).default;
const onchainRoutes = (await import('./onchain.js')).default;
const workLogsRoutes = (await import('./work-logs.js')).default;
const projectsRoutes = (await import('./projects.js')).default;
const householdMembersRoutes = (await import('./household-members.js')).default;
const tasksRoutes = (await import('./tasks.js')).default;
const templatesRoutes = (await import('./templates.js')).default;
const choreCategoriesRoutes = (await import('./chore-categories.js')).default;
const weeklySummaryRoutes = (await import('./weekly-summary.js')).default;
const challengesRoutes = (await import('./challenges.js')).default;
const allowanceRoutes = (await import('./allowance.js')).default;

const app = express();
app.use(express.json());
app.use('/api/users', usersRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/bitcoin', bitcoinRoutes);
app.use('/api/bitcoin', onchainRoutes);
app.use('/api/work-logs', workLogsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/household-members', householdMembersRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/chore-categories', choreCategoriesRoutes);
app.use('/api/weekly-summary', weeklySummaryRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/allowance', allowanceRoutes);

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

const tokens = {
  parent1: generateToken(users[0]), // Rommel, house 1
  child1: generateToken(users[1]), // Isabel, house 1, child 10
  parent2: generateToken(users[2]), // Stranger, house 2
  child2: generateToken(users[3]), // Mallory, house 2, child 20
  family1: generateToken(users[4]), // Familia, house 1
};

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  return fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

// ── 1. Anonymous access fails everywhere ───────────────────────────────────

test('anonymous requests are rejected with 401 on every router', async () => {
  const endpoints: [string, string, unknown?][] = [
    ['GET', '/users'],
    ['POST', '/auth/change-password', { currentPassword: 'old', newPassword: 'new' }],
    ['GET', '/users/1'],
    ['GET', '/users/7'],
    ['GET', '/children/40'],
    ['GET', '/children'],
    ['GET', '/children/10'],
    ['GET', '/children/50'],
    ['GET', '/points/child/50'],
    ['GET', '/points/child/10'],
    ['GET', '/points/child/10/balance'],
    ['POST', '/points', { childId: 10, points: 1, type: 'bonus' }],
    ['DELETE', '/points/100'],
    ['GET', '/bitcoin/price'],
    ['POST', '/bitcoin/convert', { childId: 10, bonusPoints: 1 }],
    ['GET', '/bitcoin/conversions/10'],
    ['GET', '/bitcoin/balance/10'],
    ['GET', '/bitcoin/onchain-wallet/10'],
    ['GET', '/bitcoin/payouts/10'],
    ['GET', '/bitcoin/available-credits/10'],
    ['POST', '/bitcoin/onchain/settle-credits', { childId: 10, satoshis: 1000 }],
    ['POST', '/bitcoin/payout/apple-cash', { childId: 10, satoshis: 1000 }],
    ['GET', '/work-logs/child/10'],
    ['GET', '/work-logs/pending'],
    ['POST', '/work-logs', { childId: 10, projectId: 500, hours: 1 }],
    ['GET', '/projects'],
    ['GET', '/projects/active'],
    ['POST', '/projects', { name: 'x', startDate: '2026-01-01', bonusRate: 1 }],
    ['GET', '/challenges/child/10'],
    ['POST', '/challenges', { childId: 10, title: 'x', deadline: '2026-08-01', rewardType: 'custom' }],
    ['GET', '/household-members'],
    ['GET', '/tasks/today'],
    ['GET', '/templates'],
    ['POST', '/templates', { name: 'x', categoryId: 1 }],
    ['GET', '/chore-categories'],
    ['POST', '/chore-categories', { name: 'x' }],
    ['GET', '/weekly-summary?weekStart=2026-07-13'],
    ['GET', '/allowance/monthly/2026-07/lines'],
    ['POST', '/allowance/lines/1/approve'],
  ];
  for (const [method, path, body] of endpoints) {
    const res = await call(method, path, { body });
    assert.equal(res.status, 401, `${method} ${path} should be 401, got ${res.status}`);
  }
});

// ── 2. Child cannot reach other children's records or parent/admin data ────

test('child can read own records but not another child’s', async () => {
  const own = await call('GET', '/points/child/10', { token: tokens.child1 });
  assert.equal(own.status, 200);

  const foreign: [string, string][] = [
    ['GET', '/points/child/20'],
    ['GET', '/points/child/20/balance'],
    ['GET', '/points/child/20/most-recent'],
    ['GET', '/points/child/20/last-7-days'],
    ['GET', '/bitcoin/conversions/20'],
    ['GET', '/bitcoin/balance/20'],
    ['GET', '/bitcoin/onchain-wallet/20'],
    ['GET', '/bitcoin/onchain-deposit-uri/20'],
    ['GET', '/bitcoin/payouts/20'],
    ['GET', '/bitcoin/available-credits/20'],
    ['GET', '/work-logs/child/20'],
    ['GET', '/challenges/child/20'],
    ['GET', '/children/20'],
  ];
  for (const [method, path] of foreign) {
    const res = await call(method, path, { token: tokens.child1 });
    assert.equal(res.status, 403, `${method} ${path} as child should be 403, got ${res.status}`);
  }

  const otherChallenge = await call('GET', '/challenges/400', { token: tokens.child1 });
  assert.equal(otherChallenge.status, 403);

  const createForOther = await call('POST', '/work-logs', {
    token: tokens.child1,
    body: { childId: 20, projectId: 500, hours: 1 },
  });
  assert.equal(createForOther.status, 403);

  const list = await call('GET', '/children', { token: tokens.child1 });
  assert.equal(list.status, 200);
  assert.deepEqual(((await list.json()) as Child[]).map((c) => c.id), [10]);
});

test('child is denied on parent/admin-only endpoints', async () => {
  const endpoints: [string, string, unknown?][] = [
    ['POST', '/points', { childId: 10, points: 1, type: 'bonus' }],
    ['DELETE', '/points/100'],
    ['POST', '/bitcoin/convert', { childId: 10, bonusPoints: 1 }],
    ['GET', '/bitcoin/price/refresh'],
    ['POST', '/bitcoin/cleanup-orphaned'],
    ['POST', '/bitcoin/onchain/settle-credits', { childId: 10, satoshis: 1000 }],
    ['POST', '/bitcoin/payout/apple-cash', { childId: 10, satoshis: 1000 }],
    ['GET', '/work-logs/pending'],
    ['PUT', '/work-logs/300', { hours: 2 }],
    ['POST', '/work-logs/300/approve', { action: 'approve' }],
    ['GET', '/projects'],
    ['GET', '/projects/statistics'],
    ['GET', '/projects/500'],
    ['POST', '/projects', { name: 'x', startDate: '2026-01-01', bonusRate: 1 }],
    ['PUT', '/projects/500', { name: 'x', startDate: '2026-01-01', bonusRate: 1, status: 'active' }],
    ['DELETE', '/projects/500'],
    ['POST', '/challenges', { childId: 10, title: 'x', deadline: '2026-08-01', rewardType: 'custom' }],
    ['GET', '/users'],
    ['GET', '/tasks/excuse-requests/pending'],
    ['PATCH', '/tasks/1/allowance-liability', { householdMemberId: 3 }],
    ['POST', '/tasks/1/excuse-decision', { action: 'approve' }],
    ['POST', '/allowance/monthly/2026-07/submit-for-approval'],
    ['POST', '/allowance/lines/1/approve'],
    ['POST', '/allowance/lines/1/reject'],
  ];
  for (const [method, path, body] of endpoints) {
    const res = await call(method, path, { token: tokens.child1, body });
    assert.equal(res.status, 403, `${method} ${path} as child should be 403, got ${res.status}`);
  }

  // Users route: self is allowed, another user is not.
  assert.equal((await call('GET', '/users/2', { token: tokens.child1 })).status, 200);
  assert.equal((await call('GET', '/users/1', { token: tokens.child1 })).status, 403);
});

test('child cannot escalate to chore editor by spoofing X-Editor-User-Id', async () => {
  // Member 1 (Celiane) has canEditChores; the child's own member (3, Isabel) does not.
  const spoofed: [string, string, unknown?][] = [
    ['POST', '/chore-categories', { name: 'sneaky' }],
    ['POST', '/templates', { name: 'sneaky', categoryId: 1 }],
    ['PUT', '/templates/1', { name: 'sneaky' }],
    ['DELETE', '/templates/1'],
    ['DELETE', '/chore-categories/1'],
  ];
  for (const [method, path, body] of spoofed) {
    const res = await call(method, path, {
      token: tokens.child1,
      body,
      headers: { 'X-Editor-User-Id': '1' },
    });
    assert.equal(res.status, 403, `${method} ${path} with spoofed editor id should be 403, got ${res.status}`);
  }

  // Sending their own (non-editor) member id is denied too.
  const ownId = await call('POST', '/chore-categories', {
    token: tokens.child1,
    body: { name: 'sneaky' },
    headers: { 'X-Editor-User-Id': '3' },
  });
  assert.equal(ownId.status, 403);

  // A child whose own member really has canEditChores (Nicholas → member 4) still passes.
  const nicholasToken = generateToken(users[5]);
  const legit = await call('POST', '/chore-categories', {
    token: nicholasToken,
    body: { name: 'legit-child-editor' },
    headers: { 'X-Editor-User-Id': '4' },
  });
  assert.equal(legit.status, 201);

  // Parent path still works with any valid member id.
  const parent = await call('POST', '/chore-categories', {
    token: tokens.parent1,
    body: { name: 'parent-created' },
    headers: { 'X-Editor-User-Id': '1' },
  });
  assert.equal(parent.status, 201);
});

test('child sees only own Prisma chores and allowance records and cannot mutate another child task', async () => {
  const members = await call('GET', '/household-members', { token: tokens.child1 });
  assert.equal(members.status, 200);
  assert.deepEqual(
    ((await members.json()) as Array<{ id: number }>).map((m) => m.id),
    [3]
  );

  const templates = await call('GET', '/templates', { token: tokens.child1 });
  assert.equal(templates.status, 200);
  assert.deepEqual(
    ((await templates.json()) as Array<{ id: number }>).map((t) => t.id),
    [1]
  );
  assert.equal((await call('GET', '/templates/2', { token: tokens.child1 })).status, 403);

  const tasks = await call('GET', '/tasks/today?date=2026-07-15', { token: tokens.child1 });
  assert.equal(tasks.status, 200);
  assert.deepEqual(
    ((await tasks.json()) as Array<{ id: number }>).map((task) => task.id),
    [1]
  );

  for (const [path, body] of [
    ['/tasks/2/complete', {}],
    ['/tasks/2/miss', {}],
    ['/tasks/2/excuse-request', { note: 'not my task' }],
  ] as const) {
    const res = await call('POST', path, { token: tokens.child1, body });
    assert.equal(res.status, 403, `${path} should reject another child's task id`);
  }

  const allowance = await call('GET', '/allowance/monthly/2026-07/lines', {
    token: tokens.child1,
  });
  assert.equal(allowance.status, 200);
  const allowanceBody = (await allowance.json()) as {
    lines: Array<{ householdMemberId: number }>;
  };
  assert.deepEqual(allowanceBody.lines.map((line) => line.householdMemberId), [3]);
});

// ── 3. Family role has no child-scoped or admin access ─────────────────────

test('family account cannot read or write child-scoped records', async () => {
  const endpoints: [string, string, unknown?][] = [
    ['GET', '/points/child/50'],
    ['GET', '/points/child/10'],
    ['GET', '/points/child/10/balance'],
    ['GET', '/bitcoin/conversions/10'],
    ['GET', '/bitcoin/balance/10'],
    ['GET', '/bitcoin/payouts/10'],
    ['GET', '/bitcoin/onchain-wallet/10'],
    ['GET', '/work-logs/child/10'],
    ['GET', '/challenges/child/10'],
    ['GET', '/children'],
    ['GET', '/children/10'],
    ['GET', '/children/50'],
    ['POST', '/work-logs', { childId: 10, projectId: 500, hours: 1 }],
    ['POST', '/points', { childId: 10, points: 1, type: 'bonus' }],
    ['GET', '/users'],
  ];
  for (const [method, path, body] of endpoints) {
    const res = await call(method, path, { token: tokens.family1, body });
    assert.equal(res.status, 403, `${method} ${path} as family should be 403, got ${res.status}`);
  }
});

// ── 4. Cross-house isolation: one family cannot touch another ──────────────

test('parent of another house cannot read or mutate this house’s children', async () => {
  // Reads and writes against house-1 child 10 / its records, as house-2 parent.
  const endpoints: [string, string, unknown?][] = [
    ['GET', '/points/child/10'],
    ['GET', '/points/child/10/balance'],
    ['GET', '/points/child/10/most-recent'],
    ['GET', '/points/child/10/last-7-days'],
    ['POST', '/points', { childId: 10, points: 100, type: 'bonus' }],
    ['DELETE', '/points/100'],
    ['POST', '/bitcoin/convert', { childId: 10, bonusPoints: 1 }],
    ['GET', '/bitcoin/conversions/10'],
    ['GET', '/bitcoin/balance/10'],
    ['GET', '/bitcoin/onchain-wallet/10'],
    ['GET', '/bitcoin/payouts/10'],
    ['GET', '/bitcoin/available-credits/10'],
    ['POST', '/bitcoin/payout/apple-cash', { childId: 10, satoshis: 1000 }],
    ['GET', '/work-logs/child/10'],
    ['POST', '/work-logs', { childId: 10, projectId: 500, hours: 1 }],
    ['POST', '/challenges', { childId: 10, title: 'x', deadline: '2026-08-01', rewardType: 'custom' }],
    ['GET', '/challenges/child/10'],
    ['GET', '/challenges/410'],
    ['GET', '/children/10'],
    ['GET', '/users/1'],
    ['GET', '/users/7'],
    ['GET', '/children/40'],
    ['GET', '/household-members'],
  ];
  for (const [method, path, body] of endpoints) {
    const res = await call(method, path, { token: tokens.parent2, body });
    assert.equal(res.status, 403, `${method} ${path} cross-house should be 403, got ${res.status}`);
  }

  const foreignProject = await call('GET', '/projects/500', { token: tokens.parent2 });
  assert.equal(foreignProject.status, 404);

  const foreignLogUpdate = await call('PUT', '/work-logs/300', {
    token: tokens.parent2,
    body: { hours: 2 },
  });
  assert.equal(foreignLogUpdate.status, 404);

  const foreignLogApproval = await call('POST', '/work-logs/300/approve', {
    token: tokens.parent2,
    body: { action: 'approve' },
  });
  assert.equal(foreignLogApproval.status, 404);
});

test('cross-house parent listings are scoped to their own house', async () => {
  const childList = await call('GET', '/children', { token: tokens.parent2 });
  assert.equal(childList.status, 200);
  assert.deepEqual(((await childList.json()) as Child[]).map((c) => c.id), [20]);

  const pending = await call('GET', '/work-logs/pending', { token: tokens.parent2 });
  assert.equal(pending.status, 200);
  assert.deepEqual(((await pending.json()) as WorkLog[]).map((w) => w.id), [310]);

  const userList = await call('GET', '/users', { token: tokens.parent2 });
  assert.equal(userList.status, 200);
  assert.deepEqual(
    ((await userList.json()) as User[]).map((u) => u.id),
    [3, 4]
  );
});

test('projects and work-log project assignment are house-scoped', async () => {
  const parentProjects = await call('GET', '/projects', { token: tokens.parent2 });
  assert.equal(parentProjects.status, 200);
  assert.deepEqual(((await parentProjects.json()) as typeof projects).map((p) => p.id), [600]);

  const childProjects = await call('GET', '/projects/active', { token: tokens.child2 });
  assert.equal(childProjects.status, 200);
  assert.deepEqual(((await childProjects.json()) as typeof projects).map((p) => p.id), [600]);

  const created = await call('POST', '/projects', {
    token: tokens.parent2,
    body: { name: 'House 2 project', startDate: '2026-01-01', bonusRate: 1 },
  });
  assert.equal(created.status, 201);
  assert.equal(((await created.json()) as { house_id: number }).house_id, 2);

  assert.equal(
    (await call('PUT', '/projects/500', {
      token: tokens.parent2,
      body: {
        name: 'stolen',
        startDate: '2026-01-01',
        bonusRate: 1,
        status: 'active',
      },
    })).status,
    404
  );
  assert.equal((await call('DELETE', '/projects/500', { token: tokens.parent2 })).status, 404);

  const mixedHouseLog = await call('POST', '/work-logs', {
    token: tokens.parent2,
    body: { childId: 20, projectId: 500, hours: 1 },
  });
  assert.equal(mixedHouseLog.status, 404);
});

test('foreign-house parent is denied by every SQLite chores router', async () => {
  const endpoints: [string, string, unknown?][] = [
    ['GET', '/household-members'],
    ['GET', '/tasks/today'],
    ['GET', '/templates'],
    ['GET', '/chore-categories'],
    ['GET', '/weekly-summary?weekStart=2026-07-13'],
    ['GET', '/allowance/monthly/2026-07/lines'],
    ['POST', '/allowance/monthly/2026-07/submit-for-approval'],
  ];
  for (const [method, path, body] of endpoints) {
    const res = await call(method, path, { token: tokens.parent2, body });
    assert.equal(res.status, 403, `${method} ${path} should deny a foreign-house parent`);
  }
});

// ── 5. Same-house parent keeps working (positive controls) ─────────────────

test('same-house parent retains full access to own children', async () => {
  assert.equal((await call('GET', '/points/child/10', { token: tokens.parent1 })).status, 200);
  assert.equal((await call('GET', '/children/10', { token: tokens.parent1 })).status, 200);

  const childList = await call('GET', '/children', { token: tokens.parent1 });
  assert.deepEqual(((await childList.json()) as Child[]).map((c) => c.id), [10, 30, 50]);

  const add = await call('POST', '/points', {
    token: tokens.parent1,
    body: { childId: 10, points: 2, type: 'bonus', reason: 'test' },
  });
  assert.equal(add.status, 201);

  const del = await call('DELETE', '/points/100', { token: tokens.parent1 });
  assert.equal(del.status, 200);

  const pending = await call('GET', '/work-logs/pending', { token: tokens.parent1 });
  assert.deepEqual(((await pending.json()) as WorkLog[]).map((w) => w.id), [300]);

  const users2 = await call('GET', '/users', { token: tokens.parent1 });
  assert.deepEqual(((await users2.json()) as User[]).map((u) => u.id), [1, 2, 5, 6]);
});
