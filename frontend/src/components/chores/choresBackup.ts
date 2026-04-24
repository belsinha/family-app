import type { ChoreCategory, ChoreTemplate } from '../../utils/api';
import { normalizeHouseArea } from '../../constants/choreHouseArea';

export const CHORES_BACKUP_VERSION = 1 as const;

export interface ChoresBackupTemplateV1 {
  name: string;
  description: string | null;
  categoryName: string;
  houseArea: string;
  anyoneMayComplete: boolean;
  assigneeNames: string[];
  frequencyType: string;
  dayOfWeek: number | null;
  weekOfMonth: number | null;
  dayOfMonth: number | null;
  semiannualMonths: string | null;
  conditionalDayOfWeek: number | null;
  conditionalAfterTime: string | null;
  timeBlock: string;
  pointsBase: number;
  active: boolean;
}

export interface ChoresBackupFileV1 {
  version: typeof CHORES_BACKUP_VERSION;
  exportedAt: string;
  categories: Array<{ name: string; sortOrder: number }>;
  templates: ChoresBackupTemplateV1[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function buildChoresBackupFile(categories: ChoreCategory[], templates: ChoreTemplate[]): ChoresBackupFileV1 {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const sortedCats = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
  return {
    version: CHORES_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: sortedCats.map((c) => ({ name: c.name, sortOrder: c.sortOrder })),
    templates: templates.map((t) => {
      const cat = catById.get(t.categoryId) ?? t.category;
      return {
        name: t.name,
        description:
          t.description !== undefined && t.description !== null && String(t.description).trim()
            ? String(t.description).trim()
            : null,
        categoryName: cat.name,
        houseArea: normalizeHouseArea(t.houseArea),
        anyoneMayComplete: t.anyoneMayComplete === true,
        assigneeNames: t.assignees.map((a) => a.member.name),
        frequencyType: t.frequencyType,
        dayOfWeek: t.dayOfWeek,
        weekOfMonth: t.weekOfMonth,
        dayOfMonth: t.dayOfMonth,
        semiannualMonths: t.semiannualMonths,
        conditionalDayOfWeek: t.conditionalDayOfWeek,
        conditionalAfterTime: t.conditionalAfterTime,
        timeBlock: t.timeBlock,
        pointsBase: t.pointsBase,
        active: t.active,
      };
    }),
  };
}

export function parseChoresBackupJson(text: string): ChoresBackupFileV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  if (!isRecord(raw)) {
    throw new Error('Backup file must be a JSON object.');
  }
  if (raw.version !== CHORES_BACKUP_VERSION) {
    throw new Error(`Unsupported backup version (expected ${CHORES_BACKUP_VERSION}).`);
  }
  if (typeof raw.exportedAt !== 'string') {
    throw new Error('Backup is missing exportedAt.');
  }
  if (!Array.isArray(raw.categories) || !Array.isArray(raw.templates)) {
    throw new Error('Backup must include categories and templates arrays.');
  }

  const categories: ChoresBackupFileV1['categories'] = [];
  for (const c of raw.categories) {
    if (!isRecord(c) || typeof c.name !== 'string') {
      throw new Error('Invalid category entry in backup.');
    }
    const sortOrder = typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder) ? c.sortOrder : 0;
    categories.push({ name: c.name.trim(), sortOrder });
  }

  const templates: ChoresBackupTemplateV1[] = [];
  for (const t of raw.templates) {
    if (!isRecord(t) || typeof t.name !== 'string' || typeof t.categoryName !== 'string') {
      throw new Error('Invalid template entry in backup.');
    }
    const assigneeNames = Array.isArray(t.assigneeNames)
      ? t.assigneeNames.filter((x): x is string => typeof x === 'string').map((n) => n.trim())
      : [];
    let description: string | null = null;
    if (typeof t.description === 'string') {
      const d = t.description.trim();
      description = d.length > 0 ? d : null;
    } else if (t.description === null) {
      description = null;
    }
    templates.push({
      name: t.name.trim(),
      description,
      categoryName: t.categoryName.trim(),
      houseArea: typeof t.houseArea === 'string' ? t.houseArea : 'NONE',
      anyoneMayComplete: t.anyoneMayComplete === true,
      assigneeNames,
      frequencyType: typeof t.frequencyType === 'string' ? t.frequencyType : 'DAILY',
      dayOfWeek: typeof t.dayOfWeek === 'number' && Number.isFinite(t.dayOfWeek) ? t.dayOfWeek : null,
      weekOfMonth: typeof t.weekOfMonth === 'number' && Number.isFinite(t.weekOfMonth) ? t.weekOfMonth : null,
      dayOfMonth: typeof t.dayOfMonth === 'number' && Number.isFinite(t.dayOfMonth) ? t.dayOfMonth : null,
      semiannualMonths: typeof t.semiannualMonths === 'string' ? t.semiannualMonths : null,
      conditionalDayOfWeek:
        typeof t.conditionalDayOfWeek === 'number' && Number.isFinite(t.conditionalDayOfWeek)
          ? t.conditionalDayOfWeek
          : null,
      conditionalAfterTime:
        typeof t.conditionalAfterTime === 'string' ? t.conditionalAfterTime : t.conditionalAfterTime === null ? null : null,
      timeBlock: typeof t.timeBlock === 'string' ? t.timeBlock : 'ANY',
      pointsBase: typeof t.pointsBase === 'number' && Number.isFinite(t.pointsBase) ? t.pointsBase : 1,
      active: t.active !== false,
    });
  }

  return { version: CHORES_BACKUP_VERSION, exportedAt: raw.exportedAt, categories, templates };
}

export function assigneeIdsFromNames(
  members: { id: number; name: string }[],
  names: string[]
): number[] {
  const map = new Map(members.map((m) => [m.name.trim().toLowerCase(), m.id]));
  const ids: number[] = [];
  for (const n of names) {
    const id = map.get(n.trim().toLowerCase());
    if (id != null) ids.push(id);
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}
