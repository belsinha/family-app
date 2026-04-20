import { prisma } from '../db/prisma.js';

const EPOCH = new Date('2020-01-01').getTime();
const MS_PER_DAY = 86400000;

function getDayOfWeek(date: Date): number {
  return date.getDay();
}

function getWeekOfMonth(date: Date): number {
  const d = date.getDate();
  if (d <= 7) return 1;
  if (d <= 14) return 2;
  if (d <= 21) return 3;
  return 4;
}

export function shouldGenerateForDate(
  template: {
    frequencyType: string;
    dayOfWeek: number | null;
    weekOfMonth: number | null;
    dayOfMonth: number | null;
    semiannualMonths: string | null;
  },
  taskDate: Date
): { generate: boolean; availableAfter?: string } {
  const y = taskDate.getFullYear();
  const m = taskDate.getMonth();
  const day = taskDate.getDate();
  const dow = getDayOfWeek(taskDate);

  switch (template.frequencyType) {
    case 'DAILY':
      return { generate: true };
    case 'EVERY_OTHER_DAY': {
      const dateOnly = new Date(y, m, day).getTime();
      const daysSinceEpoch = Math.floor((dateOnly - EPOCH) / MS_PER_DAY);
      return { generate: daysSinceEpoch % 2 === 0 };
    }
    case 'WEEKLY':
      return { generate: template.dayOfWeek !== null && dow === template.dayOfWeek };
    case 'MONTHLY':
      if (template.weekOfMonth != null) {
        return { generate: getWeekOfMonth(taskDate) === template.weekOfMonth };
      }
      if (template.dayOfMonth != null) {
        return { generate: day === template.dayOfMonth };
      }
      return { generate: false };
    case 'SEMIANNUAL': {
      const month = m + 1;
      let months: number[] = [];
      try {
        if (template.semiannualMonths) {
          months = JSON.parse(template.semiannualMonths) as number[];
        }
      } catch {
        return { generate: false };
      }
      return { generate: months.includes(month) };
    }
    case 'CONDITIONAL_SCHEDULE':
      if (template.dayOfWeek == null) return { generate: false };
      if (dow !== template.dayOfWeek) return { generate: false };
      return { generate: true, availableAfter: undefined };
    default:
      return { generate: false };
  }
}

export async function ensureInstancesForDate(taskDate: string): Promise<void> {
  const date = new Date(taskDate + 'T12:00:00');
  const templates = await prisma.taskTemplate.findMany({
    where: { active: true },
    include: { assignees: true },
  });

  for (const t of templates) {
    let availableAfter: string | null = null;
    if (t.conditionalAfterTime) {
      availableAfter = t.conditionalAfterTime;
    }

    const effectiveDayOfWeek =
      t.frequencyType === 'CONDITIONAL_SCHEDULE'
        ? (t.conditionalDayOfWeek ?? null)
        : (t.conditionalDayOfWeek ?? t.dayOfWeek ?? null);

    const { generate } = shouldGenerateForDate(
      {
        frequencyType: t.frequencyType,
        dayOfWeek: effectiveDayOfWeek,
        weekOfMonth: t.weekOfMonth ?? null,
        dayOfMonth: t.dayOfMonth ?? null,
        semiannualMonths: t.semiannualMonths,
      },
      date
    );

    if (!generate) continue;

    if (t.anyoneMayComplete) {
      const existingPool = await prisma.taskInstance.findFirst({
        where: { templateId: t.id, taskDate, assignedToId: null },
      });
      if (!existingPool) {
        await prisma.taskInstance.create({
          data: {
            templateId: t.id,
            assignedToId: null,
            taskDate,
            status: 'PENDING',
            availableAfter: availableAfter ?? undefined,
          },
        });
      }
      continue;
    }

    const memberIds = t.assignees.map((a) => a.householdMemberId);
    if (memberIds.length === 0) continue;

    for (const assignedToId of memberIds) {
      await prisma.taskInstance.upsert({
        where: {
          templateId_taskDate_assignedToId: { templateId: t.id, taskDate, assignedToId },
        },
        create: {
          templateId: t.id,
          assignedToId,
          taskDate,
          status: 'PENDING',
          availableAfter: availableAfter ?? undefined,
        },
        update: {},
      });
    }
  }
}
