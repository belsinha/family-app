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

  const instances = await prisma.taskInstance.findMany({
    where: {
      taskDate: { gte: start, lte: end },
      isExtra: false,
      assignedToId: { in: members.map((m) => m.id) },
      template: { active: true },
    },
    include: { template: true },
  });

  const byMember = new Map<number, typeof instances>();
  for (const m of members) {
    byMember.set(m.id, []);
  }
  for (const inst of instances) {
    const list = byMember.get(inst.assignedToId);
    if (list) list.push(inst);
  }

  return members.map((m) => {
    const list = byMember.get(m.id) ?? [];
    const requiredChoreCount = list.length;
    const completedChoreCount = list.filter((i) => i.status === 'DONE').length;
    const pendingChoreCount = list.filter((i) => i.status === 'PENDING').length;
    const missedChoreCount = list.filter((i) => i.status === 'MISSED').length;
    const proposedCents = proposedCentsForCounts(baseCents, requiredChoreCount, completedChoreCount);
    return {
      householdMemberId: m.id,
      memberName: m.name,
      baseCents,
      requiredChoreCount,
      completedChoreCount,
      pendingChoreCount,
      missedChoreCount,
      proposedCents,
    };
  });
}
