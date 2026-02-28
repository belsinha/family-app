import { prisma } from '../db/prisma.js';

const EPOCH = new Date('2020-01-01').getTime();
const MS_PER_DAY = 86400000;

function getDayOfWeek(date: Date): number {
  return date.getDay();
}

function isSameDay(d: Date, y: number, m: number, day: number): boolean {
  return d.getFullYear() === y && d.getMonth() === m && d.getDate() === day;
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
    include: { assignedTo: true },
  });

  for (const t of templates) {
    let availableAfter: string | null = null;
    if (t.conditionalAfterTime) {
      availableAfter = t.conditionalAfterTime;
    }

    const { generate } = shouldGenerateForDate(
      {
        frequencyType: t.frequencyType,
        dayOfWeek: t.dayOfWeek ?? null,
        weekOfMonth: t.weekOfMonth ?? null,
        dayOfMonth: t.dayOfMonth ?? null,
        semiannualMonths: t.semiannualMonths,
      },
      date
    );

    if (!generate) continue;

    await prisma.taskInstance.upsert({
      where: {
        templateId_taskDate: { templateId: t.id, taskDate },
      },
      create: {
        templateId: t.id,
        assignedToId: t.assignedToId,
        taskDate,
        status: 'PENDING',
        availableAfter: availableAfter ?? undefined,
      },
      update: {},
    });
  }
}
