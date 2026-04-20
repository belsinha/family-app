import { prisma } from '../db/prisma.js';

/** Default monthly allowance when every required (non-extra) chore is completed. */
export const DEFAULT_BASE_ALLOWANCE_CENTS = 10_000;

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertValidYearMonth(yearMonth: string): void {
  if (!YEAR_MONTH.test(yearMonth)) {
    throw new Error('yearMonth must be YYYY-MM');
  }
}

export function getCalendarMonthBounds(yearMonth: string): { start: string; end: string } {
  assertValidYearMonth(yearMonth);
  const [ys, ms] = yearMonth.split('-');
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  const start = `${yearMonth}-01`;
  const endUtc = new Date(Date.UTC(y, m, 0));
  const day = String(endUtc.getUTCDate()).padStart(2, '0');
  const end = `${yearMonth}-${day}`;
  return { start, end };
}

export type MonthlyAllowanceBreakdown = {
  householdMemberId: number;
  memberName: string;
  baseCents: number;
  requiredChoreCount: number;
  completedChoreCount: number;
  pendingChoreCount: number;
  missedChoreCount: number;
  excusedChoreCount: number;
  proposedCents: number;
};

function proposedCentsForCounts(
  baseCents: number,
  required: number,
  completed: number
): number {
  if (required <= 0) {
    return baseCents;
  }
  const safeCompleted = Math.min(Math.max(0, completed), required);
  return Math.round((baseCents * safeCompleted) / required);
}

/** Instances that count toward allowance (not extra, active template, not parent-approved excused). */
function isAllowanceEligible(inst: {
  isExtra: boolean;
  excuseStatus: string;
  template: { active: boolean };
}): boolean {
  if (inst.isExtra) return false;
  if (!inst.template.active) return false;
  if (inst.excuseStatus === 'APPROVED') return false;
  return true;
}

type Inst = Awaited<ReturnType<typeof prisma.taskInstance.findMany>>[number] & {
  template: { active: boolean; anyoneMayComplete: boolean };
};

function instanceCountsForMember(inst: Inst, memberId: number): {
  required: boolean;
  completed: boolean;
  pending: boolean;
  missed: boolean;
} | null {
  if (!isAllowanceEligible(inst)) return null;

  const pool = inst.template.anyoneMayComplete;

  if (!pool) {
    if (inst.assignedToId !== memberId) return null;
    return {
      required: true,
      completed: inst.status === 'DONE',
      pending: inst.status === 'PENDING',
      missed: inst.status === 'MISSED',
    };
  }

  if (inst.status === 'DONE' && inst.assignedToId === memberId) {
    return { required: true, completed: true, pending: false, missed: false };
  }

  if (inst.status !== 'DONE' && inst.allowanceLiabilityMemberId === memberId) {
    return {
      required: true,
      completed: false,
      pending: inst.status === 'PENDING',
      missed: inst.status === 'MISSED',
    };
  }

  return null;
}

export async function computeMonthlyAllowanceBreakdown(
  yearMonth: string,
  options?: { householdMemberId?: number; baseCents?: number }
): Promise<MonthlyAllowanceBreakdown[]> {
  const { start, end } = getCalendarMonthBounds(yearMonth);
  const baseCents = options?.baseCents ?? DEFAULT_BASE_ALLOWANCE_CENTS;

  const members = await prisma.householdMember.findMany({
    where: {
      canEditChores: false,
      ...(options?.householdMemberId != null
        ? { id: options.householdMemberId }
        : {}),
    },
    orderBy: { id: 'asc' },
  });

  const instances = (await prisma.taskInstance.findMany({
    where: {
      taskDate: { gte: start, lte: end },
      assignedToId: { in: members.map((m) => m.id) },
      template: { active: true },
    },
    include: { template: true },
  })) as Inst[];

  const poolInstances = (await prisma.taskInstance.findMany({
    where: {
      taskDate: { gte: start, lte: end },
      assignedToId: null,
      template: { active: true, anyoneMayComplete: true },
    },
    include: { template: true },
  })) as Inst[];

  const all: Inst[] = [...instances, ...poolInstances];

  return members.map((m) => {
    let requiredChoreCount = 0;
    let completedChoreCount = 0;
    let pendingChoreCount = 0;
    let missedChoreCount = 0;
    let excusedChoreCount = 0;

    for (const inst of all) {
      if (!inst.isExtra && inst.template.active && inst.excuseStatus === 'APPROVED') {
        if (!inst.template.anyoneMayComplete && inst.assignedToId === m.id) {
          excusedChoreCount += 1;
        }
        if (inst.template.anyoneMayComplete && inst.allowanceLiabilityMemberId === m.id) {
          excusedChoreCount += 1;
        }
      }

      if (!isAllowanceEligible(inst)) continue;

      const row = instanceCountsForMember(inst, m.id);
      if (!row?.required) continue;
      requiredChoreCount += 1;
      if (row.completed) completedChoreCount += 1;
      if (row.pending) pendingChoreCount += 1;
      if (row.missed) missedChoreCount += 1;
    }

    const proposedCents = proposedCentsForCounts(baseCents, requiredChoreCount, completedChoreCount);
    return {
      householdMemberId: m.id,
      memberName: m.name,
      baseCents,
      requiredChoreCount,
      completedChoreCount,
      pendingChoreCount,
      missedChoreCount,
      excusedChoreCount,
      proposedCents,
    };
  });
}
