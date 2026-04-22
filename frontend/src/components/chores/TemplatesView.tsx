import { useState, useEffect, useMemo, useRef, useLayoutEffect, type ReactNode } from 'react';
import {
  api,
  type ChoreTemplate,
  type ChoreHouseholdMember,
  type ChoreCategory,
  type ChoreTemplateSavePayload,
  type TemplateImportPreviewItem,
} from '../../utils/api';
import {
  CHORE_HOUSE_AREAS,
  CHORE_HOUSE_AREA_LABELS,
  normalizeHouseArea,
  type ChoreHouseAreaCode,
} from '../../constants/choreHouseArea';

const FREQUENCY_TYPES = [
  'DAILY',
  'EVERY_OTHER_DAY',
  'WEEKLY',
  'MONTHLY',
  'SEMIANNUAL',
  'CONDITIONAL_SCHEDULE',
] as const;

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: 'Every day',
  EVERY_OTHER_DAY: 'Every other day',
  WEEKLY: 'Once a week (pick day)',
  MONTHLY: 'Once a month (pick week 1–4 or day)',
  SEMIANNUAL: 'Twice a year (months as JSON, e.g. Jan & Jul)',
  CONDITIONAL_SCHEDULE: 'On a weekday after a set time (e.g. trash night)',
};

const TIME_BLOCKS = ['MORNING', 'AFTERNOON', 'NIGHT', 'ANY'] as const;

const WEEKDAY_OPTIONS = [
  { v: 0, label: 'Sunday' },
  { v: 1, label: 'Monday' },
  { v: 2, label: 'Tuesday' },
  { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' },
  { v: 5, label: 'Friday' },
  { v: 6, label: 'Saturday' },
];

const IMPORT_WEEKDAY_OPTIONS = [
  { v: '', label: 'Not set' },
  ...WEEKDAY_OPTIONS.map((d) => ({ v: String(d.v), label: d.label })),
];

interface TemplatesViewProps {
  members: ChoreHouseholdMember[];
  editorMemberId: number | null;
}

type Draft = {
  name: string;
  description: string;
  categoryId: number | null;
  houseArea: ChoreHouseAreaCode;
  assigneeIds: number[];
  anyoneMayComplete: boolean;
  frequencyType: string;
  dayOfWeek: string;
  weekOfMonth: string;
  dayOfMonth: string;
  semiannualMonths: string;
  conditionalDayOfWeek: string;
  conditionalAfterTime: string;
  timeBlock: string;
  pointsBase: string;
  active: boolean;
};

function templateToDraft(t: ChoreTemplate): Draft {
  return {
    name: t.name,
    description: t.description?.trim() ?? '',
    categoryId: t.categoryId,
    houseArea: normalizeHouseArea(t.houseArea),
    assigneeIds: [...t.assigneeIds],
    anyoneMayComplete: t.anyoneMayComplete === true,
    frequencyType: t.frequencyType,
    dayOfWeek: t.dayOfWeek != null ? String(t.dayOfWeek) : '',
    weekOfMonth: t.weekOfMonth != null ? String(t.weekOfMonth) : '',
    dayOfMonth: t.dayOfMonth != null ? String(t.dayOfMonth) : '',
    semiannualMonths: t.semiannualMonths ?? '',
    conditionalDayOfWeek: t.conditionalDayOfWeek != null ? String(t.conditionalDayOfWeek) : '',
    conditionalAfterTime: t.conditionalAfterTime ?? '',
    timeBlock: t.timeBlock,
    pointsBase: String(t.pointsBase),
    active: t.active,
  };
}

function emptyDraft(categories: ChoreCategory[], members: ChoreHouseholdMember[]): Draft {
  const firstCat = categories[0]?.id ?? null;
  const firstMembers = members.filter((m) => !m.canEditChores).map((m) => m.id);
  const defaultAssignees = firstMembers.length > 0 ? [firstMembers[0]] : members[0]?.id != null ? [members[0].id] : [];
  return {
    name: '',
    description: '',
    categoryId: firstCat,
    houseArea: 'NONE',
    assigneeIds: defaultAssignees,
    anyoneMayComplete: false,
    frequencyType: 'DAILY',
    dayOfWeek: '',
    weekOfMonth: '',
    dayOfMonth: '',
    semiannualMonths: '[1,7]',
    conditionalDayOfWeek: '',
    conditionalAfterTime: '',
    timeBlock: 'ANY',
    pointsBase: '1',
    active: true,
  };
}

function parseOptionalInt(s: string): number | null {
  if (s === '') return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function toggleAssignee(ids: number[], id: number, allowEmpty: boolean): number[] {
  if (ids.includes(id)) {
    const next = ids.filter((x) => x !== id);
    if (next.length === 0 && !allowEmpty) return [id];
    return next;
  }
  return [...ids, id].sort((a, b) => a - b);
}

function TemplateWhoSummary({ t }: { t: ChoreTemplate }): ReactNode {
  if (t.anyoneMayComplete) {
    return (
      <span>
        <span className="font-medium text-gray-900">Anyone</span>
        {t.assignees.length > 0 ? (
          <span className="text-gray-600">
            {' '}
            · optional hints: {t.assignees.map((a) => a.member.name).join(', ')}
          </span>
        ) : null}
      </span>
    );
  }
  return t.assignees.map((a) => a.member.name).join(', ') || '—';
}

function TemplateWhenSummary({ t }: { t: ChoreTemplate }): ReactNode {
  return (
    <>
      {t.timeBlock}
      {t.dayOfWeek != null && t.frequencyType === 'WEEKLY' && (
        <span className="text-gray-500"> · {WEEKDAY_OPTIONS.find((d) => d.v === t.dayOfWeek)?.label}</span>
      )}
      {t.weekOfMonth != null && <span className="text-gray-500"> · week {t.weekOfMonth}</span>}
      {t.conditionalAfterTime && <span className="text-gray-500"> · after {t.conditionalAfterTime}</span>}
    </>
  );
}

/** Child is assignee, or anyone-chore with no hints (whole household) or hints include this child. */
function templateInvolvesChild(t: ChoreTemplate, memberId: number): boolean {
  if (t.assigneeIds.includes(memberId)) return true;
  if (!t.anyoneMayComplete) return false;
  if (t.assigneeIds.length === 0) return true;
  return t.assigneeIds.includes(memberId);
}

/** Whether the template is tied to a specific weekday that equals `day` (0–6). */
function templateMatchesWeekday(t: ChoreTemplate, day: number): boolean {
  switch (t.frequencyType) {
    case 'WEEKLY':
      return t.dayOfWeek === day;
    case 'CONDITIONAL_SCHEDULE':
      return t.conditionalDayOfWeek === day;
    case 'MONTHLY':
      return t.dayOfWeek == null || t.dayOfWeek === day;
    case 'DAILY':
    case 'EVERY_OTHER_DAY':
    case 'SEMIANNUAL':
      return true;
    default:
      return true;
  }
}

export default function TemplatesView({ members, editorMemberId }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<ChoreTemplate[]>([]);
  const [categories, setCategories] = useState<ChoreCategory[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<number | 'all'>('all');
  const [houseAreaFilter, setHouseAreaFilter] = useState<ChoreHouseAreaCode | 'all'>('all');
  const [childFilterId, setChildFilterId] = useState<number | 'all'>('all');
  const [weekdayFilter, setWeekdayFilter] = useState<number | 'all'>('all');
  const [timeBlockFilter, setTimeBlockFilter] = useState<(typeof TIME_BLOCKS)[number] | 'all'>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<string | 'all'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft([], []));
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [importBulkSaving, setImportBulkSaving] = useState(false);
  const [importRows, setImportRows] = useState<(TemplateImportPreviewItem & { selected: boolean })[]>([]);
  const [importParseMode, setImportParseMode] = useState<'openai' | 'lines' | 'structured' | null>(null);
  const [importParseMessage, setImportParseMessage] = useState<string | null>(null);
  const [renamingCategoryId, setRenamingCategoryId] = useState<number | null>(null);
  const [renamingCategoryValue, setRenamingCategoryValue] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectAllFilteredRef = useRef<HTMLInputElement>(null);

  const canEdit = editorMemberId != null;

  const loadAll = () => {
    setLoading(true);
    setError(null);
    Promise.all([api.getTemplates(), api.getChoreCategories()])
      .then(([tpl, cats]) => {
        setTemplates(tpl);
        setCategories(cats);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const valid = new Set(templates.map((t) => t.id));
    setSelectedTemplateIds((prev) => {
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [templates]);

  useEffect(() => {
    if (!modalOpen || editingId != null) return;
    setDraft((d) => {
      if (d.categoryId != null) return d;
      const first = categories[0]?.id ?? null;
      if (first == null) return d;
      return { ...d, categoryId: first };
    });
  }, [modalOpen, editingId, categories]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [categories]
  );

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (categoryFilterId !== 'all' && t.categoryId !== categoryFilterId) return false;
      if (houseAreaFilter !== 'all' && normalizeHouseArea(t.houseArea) !== houseAreaFilter) return false;
      if (childFilterId !== 'all' && !templateInvolvesChild(t, childFilterId)) return false;
      if (weekdayFilter !== 'all' && !templateMatchesWeekday(t, weekdayFilter)) return false;
      if (timeBlockFilter !== 'all' && t.timeBlock !== timeBlockFilter) return false;
      if (frequencyFilter !== 'all' && t.frequencyType !== frequencyFilter) return false;
      if (activeFilter === 'active' && !t.active) return false;
      if (activeFilter === 'inactive' && t.active) return false;
      return true;
    });
  }, [
    templates,
    categoryFilterId,
    houseAreaFilter,
    childFilterId,
    weekdayFilter,
    timeBlockFilter,
    frequencyFilter,
    activeFilter,
  ]);

  const allFilteredSelected =
    filteredTemplates.length > 0 && filteredTemplates.every((t) => selectedTemplateIds.has(t.id));
  const someFilteredSelected = filteredTemplates.some((t) => selectedTemplateIds.has(t.id));

  useLayoutEffect(() => {
    const el = selectAllFilteredRef.current;
    if (!el) return;
    el.indeterminate = someFilteredSelected && !allFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft(categories, members));
    setNewCategoryName('');
    setModalOpen(true);
  };

  const openEdit = (t: ChoreTemplate) => {
    setEditingId(t.id);
    setDraft(templateToDraft(t));
    setNewCategoryName('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!canEdit || editorMemberId == null || !name) return;
    setError(null);
    try {
      const created = await api.createChoreCategory({ name }, editorMemberId);
      setCategories((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setDraft((d) => ({ ...d, categoryId: created.id }));
      setNewCategoryName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add category');
    }
  };

  const defaultAssigneeIdsForNewTemplate = (): number[] => {
    const firstMembers = members.filter((m) => !m.canEditChores).map((m) => m.id);
    return firstMembers.length > 0 ? [firstMembers[0]] : members[0]?.id != null ? [members[0].id] : [];
  };

  const onImportFileSelected = async (file: File | undefined) => {
    if (!file || !canEdit || editorMemberId == null) return;
    setImportParsing(true);
    setError(null);
    try {
      const res = await api.parseTemplateImport(file, editorMemberId);
      setImportRows(
        res.items.map((i) => ({
          ...i,
          selected: true,
          assigneeIds: Array.isArray(i.assigneeIds) ? i.assigneeIds : [],
        }))
      );
      setImportParseMode(res.parseMode);
      setImportParseMessage(res.message ?? null);
      setImportReviewOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImportParsing(false);
    }
  };

  const closeImportReview = () => {
    setImportReviewOpen(false);
    setImportRows([]);
    setImportParseMode(null);
    setImportParseMessage(null);
  };

  const commitImportSelected = async () => {
    if (!canEdit || editorMemberId == null) return;
    const selected = importRows.filter((r) => r.selected);
    if (selected.length === 0) {
      setError('Select at least one row to add.');
      return;
    }
    const defaultAssignees = defaultAssigneeIdsForNewTemplate();
    const assigneesForRow = (row: (typeof importRows)[number]) => {
      if (row.anyoneMayComplete) return [] as number[];
      if (row.assigneeIds.length > 0) return row.assigneeIds;
      return defaultAssignees;
    };
    if (!selected.some((r) => r.anyoneMayComplete) && defaultAssignees.length === 0) {
      setError('No household members available for assignees (or mark rows as anyone-can-do).');
      return;
    }
    const missingAssignee = selected.find((r) => !r.anyoneMayComplete && assigneesForRow(r).length === 0);
    if (missingAssignee) {
      setError(
        `Select at least one assignee for "${missingAssignee.name.trim() || 'a row'}" or mark it as anyone-can-do.`
      );
      return;
    }
    setImportBulkSaving(true);
    setError(null);
    try {
      for (const row of selected) {
        const name = row.name.trim();
        if (!name) continue;
        const anyone = row.anyoneMayComplete === true;
        const payload: ChoreTemplateSavePayload = {
          name,
          description: row.description?.trim() || null,
          categoryId: row.categoryId,
          houseArea: row.houseArea ?? 'NONE',
          assigneeIds: anyone ? [] : assigneesForRow(row),
          anyoneMayComplete: anyone,
          frequencyType: row.frequencyType,
          dayOfWeek: row.frequencyType === 'WEEKLY' ? row.dayOfWeek ?? null : null,
          weekOfMonth: row.frequencyType === 'MONTHLY' ? row.weekOfMonth ?? null : null,
      dayOfMonth: null,
          semiannualMonths: row.frequencyType === 'SEMIANNUAL' ? '[1,7]' : null,
      conditionalDayOfWeek: null,
      conditionalAfterTime: null,
          timeBlock: row.timeBlock,
          pointsBase: 1,
          active: true,
        };
        await api.createTemplate(payload, editorMemberId);
      }
      closeImportReview();
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add templates');
    } finally {
      setImportBulkSaving(false);
    }
  };

  const saveCategoryRename = async (id: number) => {
    if (!canEdit || editorMemberId == null) return;
    const name = renamingCategoryValue.trim();
    if (!name) return;
    setError(null);
    try {
      await api.updateChoreCategory(id, { name }, editorMemberId);
      setRenamingCategoryId(null);
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename category');
    }
  };

  const removeCategory = async (id: number) => {
    if (!canEdit || editorMemberId == null) return;
    if (!window.confirm('Delete this category? It must have no templates.')) return;
    setError(null);
    try {
      await api.deleteChoreCategory(id, editorMemberId);
      if (categoryFilterId === id) setCategoryFilterId('all');
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete category');
    }
  };

  const draftToPayload = (): ChoreTemplateSavePayload | null => {
    if (!draft.name.trim()) return null;
    if (draft.categoryId == null) return null;
    if (!draft.anyoneMayComplete && draft.assigneeIds.length === 0) return null;
    const semiannual =
      draft.frequencyType === 'SEMIANNUAL' && draft.semiannualMonths.trim()
        ? draft.semiannualMonths.trim()
        : draft.frequencyType === 'SEMIANNUAL'
          ? '[1,7]'
          : null;
    return {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      categoryId: draft.categoryId,
      houseArea: draft.houseArea,
      assigneeIds: draft.assigneeIds,
      anyoneMayComplete: draft.anyoneMayComplete,
      frequencyType: draft.frequencyType,
      dayOfWeek: parseOptionalInt(draft.dayOfWeek),
      weekOfMonth: parseOptionalInt(draft.weekOfMonth),
      dayOfMonth: parseOptionalInt(draft.dayOfMonth),
      semiannualMonths: semiannual,
      conditionalDayOfWeek: parseOptionalInt(draft.conditionalDayOfWeek),
      conditionalAfterTime: draft.conditionalAfterTime.trim() || null,
      timeBlock: draft.timeBlock,
      pointsBase: Math.max(1, parseInt(draft.pointsBase, 10) || 1),
      active: draft.active,
    };
  };

  const handleSave = async () => {
    if (!canEdit || editorMemberId == null) return;
    const payload = draftToPayload();
    if (!payload) {
      setError('Name and category are required. For fixed assignees, pick at least one person.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId == null) {
        await api.createTemplate(payload, editorMemberId);
      } else {
        await api.updateTemplate(editingId, payload, editorMemberId);
      }
      closeModal();
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canEdit || editorMemberId == null) return;
    if (!window.confirm('Delete this task template?')) return;
    setError(null);
    try {
      await api.deleteTemplate(id, editorMemberId);
      setSelectedTemplateIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const toggleTemplateSelected = (id: number) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      const ids = filteredTemplates.map((t) => t.id);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!canEdit || editorMemberId == null) return;
    const ids = [...selectedTemplateIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} selected template${ids.length !== 1 ? 's' : ''}? This removes their schedules and task history.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    try {
      for (const id of ids) {
        await api.deleteTemplate(id, editorMemberId);
      }
      setSelectedTemplateIds(new Set());
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkSetActive = async (active: boolean) => {
    if (!canEdit || editorMemberId == null) return;
    const ids = [...selectedTemplateIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const id of ids) {
        await api.updateTemplate(id, { active }, editorMemberId);
      }
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return <p className="text-gray-600">Loading…</p>;

  const assignableMembers = members.filter((m) => !m.canEditChores);
  const filterBarMembers = assignableMembers.length > 0 ? assignableMembers : members;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      )}

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-3">
          <div className="flex min-w-0 flex-col gap-1 lg:min-w-[10rem]">
            <label htmlFor="tpl-cat-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Category
            </label>
            <select
              id="tpl-cat-filter"
              value={categoryFilterId === 'all' ? 'all' : String(categoryFilterId)}
              onChange={(e) => {
                const v = e.target.value;
                setCategoryFilterId(v === 'all' ? 'all' : parseInt(v, 10));
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm lg:max-w-[14rem]"
            >
              <option value="all">All categories</option>
              {sortedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:min-w-[10rem]">
            <label htmlFor="tpl-area-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
              House area
            </label>
            <select
              id="tpl-area-filter"
              value={houseAreaFilter}
              onChange={(e) =>
                setHouseAreaFilter(e.target.value === 'all' ? 'all' : (e.target.value as ChoreHouseAreaCode))
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm lg:max-w-[16rem]"
            >
              <option value="all">All areas</option>
              {CHORE_HOUSE_AREAS.map((code) => (
                <option key={code} value={code}>
                  {CHORE_HOUSE_AREA_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:min-w-[10rem]">
            <label htmlFor="tpl-child-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Child / person
            </label>
            <select
              id="tpl-child-filter"
              value={childFilterId === 'all' ? 'all' : String(childFilterId)}
              onChange={(e) => {
                const v = e.target.value;
                setChildFilterId(v === 'all' ? 'all' : parseInt(v, 10));
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm lg:max-w-[14rem]"
            >
              <option value="all">Everyone</option>
              {filterBarMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:min-w-[9rem]">
            <label htmlFor="tpl-day-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Day of week
            </label>
            <select
              id="tpl-day-filter"
              value={weekdayFilter === 'all' ? 'all' : String(weekdayFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setWeekdayFilter(v === 'all' ? 'all' : parseInt(v, 10));
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm lg:max-w-[12rem]"
            >
              <option value="all">Any day</option>
              {WEEKDAY_OPTIONS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:min-w-[8rem]">
            <label htmlFor="tpl-block-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Time of day
            </label>
            <select
              id="tpl-block-filter"
              value={timeBlockFilter}
              onChange={(e) => setTimeBlockFilter(e.target.value as (typeof TIME_BLOCKS)[number] | 'all')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm lg:max-w-[11rem]"
            >
              <option value="all">Any time</option>
              {TIME_BLOCKS.map((tb) => (
                <option key={tb} value={tb}>
                  {tb === 'ANY' ? 'Any time block' : tb.charAt(0) + tb.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:min-w-[10rem]">
            <label htmlFor="tpl-freq-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
              How often
            </label>
            <select
              id="tpl-freq-filter"
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm lg:max-w-[16rem]"
            >
              <option value="all">Any schedule</option>
              {FREQUENCY_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f] ?? f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:min-w-[8rem]">
            <label htmlFor="tpl-active-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Status
            </label>
            <select
              id="tpl-active-filter"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm lg:max-w-[11rem]"
            >
              <option value="all">Active &amp; inactive</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
          <button
            type="button"
            className="justify-self-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 sm:col-span-2 lg:col-span-1 lg:self-end"
            onClick={() => {
              setCategoryFilterId('all');
              setHouseAreaFilter('all');
              setChildFilterId('all');
              setWeekdayFilter('all');
              setTimeBlockFilter('all');
              setFrequencyFilter('all');
              setActiveFilter('all');
            }}
          >
            Clear filters
          </button>
        </div>
      {canEdit && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={openCreate}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 sm:w-auto sm:py-2"
          >
              New task template
          </button>
            <button
              type="button"
              disabled={importParsing}
              onClick={() => importFileRef.current?.click()}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 sm:w-auto sm:py-2"
            >
              {importParsing ? 'Reading file…' : 'Import from PDF, image, or .txt'}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain,image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                void onImportFileSelected(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
        </div>
      )}
      </div>

              {canEdit && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
          <p className="mt-1 text-xs text-gray-600">
            Rename or remove categories. Delete is only allowed when no templates reference the category.
          </p>
          <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
            {sortedCategories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                {renamingCategoryId === c.id ? (
                  <>
                    <input
                      className="min-w-[10rem] flex-1 rounded border border-gray-300 px-2 py-1"
                      value={renamingCategoryValue}
                      onChange={(e) => setRenamingCategoryValue(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium hover:bg-gray-50"
                      onClick={() => void saveCategoryRename(c.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="rounded border border-transparent px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      onClick={() => setRenamingCategoryId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-[8rem] flex-1 font-medium text-gray-900">{c.name}</span>
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-700 hover:underline"
                      onClick={() => {
                        setRenamingCategoryId(c.id);
                        setRenamingCategoryValue(c.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 hover:underline"
                      onClick={() => void removeCategory(c.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-gray-600">
        Showing {filteredTemplates.length} of {templates.length} template{templates.length !== 1 ? 's' : ''}.
      </p>

      {canEdit && selectedTemplateIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/90 px-3 py-2 text-sm text-blue-950">
          <span className="font-medium">
            {selectedTemplateIds.size} selected
            {filteredTemplates.some((t) => selectedTemplateIds.has(t.id)) && (
              <span className="font-normal text-blue-800">
                {' '}
                ({filteredTemplates.filter((t) => selectedTemplateIds.has(t.id)).length} visible with current filters)
              </span>
            )}
          </span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void handleBulkSetActive(true)}
            className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-50"
          >
            Set active
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void handleBulkSetActive(false)}
            className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-50"
          >
            Set inactive
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void handleBulkDelete()}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Delete selected…
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => setSelectedTemplateIds(new Set())}
            className="rounded-md px-2 py-1 text-xs font-medium text-blue-800 hover:underline disabled:opacity-50"
          >
            Clear selection
          </button>
        </div>
      )}

      <ul className="space-y-3 lg:hidden" aria-label="Task templates">
        {filteredTemplates.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex gap-3 border-b border-gray-100 pb-3">
              {canEdit && (
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300"
                  disabled={bulkBusy}
                  checked={selectedTemplateIds.has(t.id)}
                  onChange={() => toggleTemplateSelected(t.id)}
                  aria-label={`Select ${t.name}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{t.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {t.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {t.pointsBase} pts
                  </span>
                </div>
                {t.description ? (
                  <p className="mt-1 text-xs text-gray-600">{t.description}</p>
                ) : null}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-800 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Category</dt>
                <dd className="mt-0.5">{t.category.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">House area</dt>
                <dd className="mt-0.5">
                  {normalizeHouseArea(t.houseArea) === 'NONE'
                    ? '—'
                    : CHORE_HOUSE_AREA_LABELS[normalizeHouseArea(t.houseArea)]}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Who</dt>
                <dd className="mt-0.5 text-gray-700">
                  <TemplateWhoSummary t={t} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Schedule</dt>
                <dd className="mt-0.5 text-gray-600">{FREQUENCY_LABELS[t.frequencyType] ?? t.frequencyType}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">When</dt>
                <dd className="mt-0.5 text-gray-600">
                  <TemplateWhenSummary t={t} />
                </dd>
              </div>
            </dl>
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 shadow-sm lg:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {canEdit && (
                <th className="w-10 px-2 py-2 text-center font-semibold text-gray-900" scope="col">
                  <span className="sr-only">Select</span>
                  <input
                    ref={selectAllFilteredRef}
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    disabled={filteredTemplates.length === 0 || bulkBusy}
                    checked={allFilteredSelected}
                    onChange={() => toggleSelectAllFiltered()}
                    title="Select or clear all templates in the current filtered list"
                    aria-label="Select all templates in filtered list"
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Task</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Category</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Area</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Who</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Schedule</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">When</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-900">Pts</th>
              {canEdit && <th className="px-3 py-2 text-left font-semibold text-gray-900">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredTemplates.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/80">
                {canEdit && (
                  <td className="w-10 px-2 py-2 text-center align-top">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      disabled={bulkBusy}
                      checked={selectedTemplateIds.has(t.id)}
                      onChange={() => toggleTemplateSelected(t.id)}
                      aria-label={`Select ${t.name}`}
                    />
                </td>
                )}
                <td className="px-3 py-2 text-gray-900">
                  <div className="font-medium">{t.name}</div>
                  {t.description ? (
                    <div className="mt-0.5 max-w-md text-xs font-normal text-gray-600">{t.description}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-gray-700">{t.category.name}</td>
                <td className="px-3 py-2 text-gray-700">
                  {normalizeHouseArea(t.houseArea) === 'NONE'
                    ? '—'
                    : CHORE_HOUSE_AREA_LABELS[normalizeHouseArea(t.houseArea)]}
                </td>
                <td className="px-3 py-2 text-gray-700">
                  <TemplateWhoSummary t={t} />
                </td>
                <td className="px-3 py-2 text-gray-600">{FREQUENCY_LABELS[t.frequencyType] ?? t.frequencyType}</td>
                <td className="px-3 py-2 text-gray-600">
                  <TemplateWhenSummary t={t} />
                </td>
                <td className="px-3 py-2 text-right text-gray-800">{t.pointsBase}</td>
                {canEdit && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="mr-3 text-sm font-medium text-blue-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && canEdit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5 sm:rounded-xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tpl-modal-title"
          >
            <h3 id="tpl-modal-title" className="text-lg font-semibold text-gray-900">
              {editingId == null ? 'New task template' : 'Edit task template'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Pick a category and schedule. For a normal chore, choose one or more assignees (each gets their own task
              row). For an &quot;anyone&quot; household chore, turn on the option below: one shared row per day; a
              parent picks whose allowance is at risk if it stays undone.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-800">Task name</label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Empty dishwasher"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-800">Description (optional)</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Extra detail shown under the task name"
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                <label className="text-sm font-medium text-gray-800">Category</label>
                <select
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                  value={draft.categoryId ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      categoryId: e.target.value ? parseInt(e.target.value, 10) : null,
                    }))
                  }
                >
                  <option value="">Select a category…</option>
                  {sortedCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="mt-3">
                  <label htmlFor="tpl-house-area" className="text-sm font-medium text-gray-800">
                    House area
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Where this chore happens (separate from category). Used for grouping and filters.
                  </p>
                  <select
                    id="tpl-house-area"
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                    value={draft.houseArea}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        houseArea: normalizeHouseArea(e.target.value),
                      }))
                    }
                  >
                    {CHORE_HOUSE_AREAS.map((code) => (
                      <option key={code} value={code}>
                        {CHORE_HOUSE_AREA_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="text"
                    className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void addCategory()}
                    disabled={!newCategoryName.trim()}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Add category
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-amber-50/40 p-3 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.anyoneMayComplete}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setDraft((d) => {
                      if (on) return { ...d, anyoneMayComplete: true, assigneeIds: [] };
                      const firstMembers = members.filter((m) => !m.canEditChores).map((m) => m.id);
                      const fallback =
                        firstMembers.length > 0 ? [firstMembers[0]] : members[0]?.id != null ? [members[0].id] : [];
                      return {
                        ...d,
                        anyoneMayComplete: false,
                        assigneeIds: d.assigneeIds.length > 0 ? d.assigneeIds : fallback,
                      };
                    });
                  }}
                />
                <span>
                  <span className="font-medium">Anyone in the household may complete this</span>
                  <span className="mt-1 block text-xs text-gray-600">
                    One task per day (not per child). If it is not done, a parent chooses which child&apos;s allowance is
                    reduced.
                  </span>
                </span>
              </label>

              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-1 text-sm font-medium text-gray-800">
                  {draft.anyoneMayComplete ? 'Optional assignee hints' : 'Assigned to (one or more)'}
                </legend>
                <p className="mb-3 text-xs text-gray-500">
                  {draft.anyoneMayComplete
                    ? 'Checking names does not create separate tasks; it is only for reference. Leave all unchecked for a fully open household task.'
                    : 'Everyone checked gets the same task on the schedule.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {(assignableMembers.length > 0 ? assignableMembers : members).map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={draft.assigneeIds.includes(m.id)}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            assigneeIds: toggleAssignee(d.assigneeIds, m.id, d.anyoneMayComplete),
                          }))
                        }
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="text-sm font-medium text-gray-800">How often</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm"
                  value={draft.frequencyType}
                  onChange={(e) => setDraft((d) => ({ ...d, frequencyType: e.target.value }))}
                >
                  {FREQUENCY_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f] ?? f}
                    </option>
                  ))}
                </select>
              </div>

              {draft.frequencyType === 'WEEKLY' && (
                <div>
                  <label className="text-sm font-medium text-gray-800">Day of week</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={draft.dayOfWeek}
                    onChange={(e) => setDraft((d) => ({ ...d, dayOfWeek: e.target.value }))}
                  >
                    <option value="">Select day…</option>
                    {WEEKDAY_OPTIONS.map((d) => (
                      <option key={d.v} value={d.v}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draft.frequencyType === 'MONTHLY' && (
                <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className="text-sm font-medium text-gray-800">Week of month (1–4)</label>
                  <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. 1 for first week"
                    value={draft.weekOfMonth}
                    onChange={(e) => setDraft((d) => ({ ...d, weekOfMonth: e.target.value }))}
                  />
                </div>
                  <div>
                    <label className="text-sm font-medium text-gray-800">Or day of month (1–31)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Optional; leave blank if using week"
                      value={draft.dayOfMonth}
                      onChange={(e) => setDraft((d) => ({ ...d, dayOfMonth: e.target.value }))}
                    />
              </div>
                </div>
              )}

              {draft.frequencyType === 'SEMIANNUAL' && (
              <div>
                  <label className="text-sm font-medium text-gray-800">Months (JSON array, 1=Jan)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                    value={draft.semiannualMonths}
                    onChange={(e) => setDraft((d) => ({ ...d, semiannualMonths: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-gray-500">Example: [1,7] for January and July.</p>
                </div>
              )}

              {draft.frequencyType === 'CONDITIONAL_SCHEDULE' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-800">Weekday</label>
                <select
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={draft.conditionalDayOfWeek}
                      onChange={(e) => setDraft((d) => ({ ...d, conditionalDayOfWeek: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      {WEEKDAY_OPTIONS.map((d) => (
                        <option key={d.v} value={d.v}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-800">Available after (24h)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="18:00"
                      value={draft.conditionalAfterTime}
                      onChange={(e) => setDraft((d) => ({ ...d, conditionalAfterTime: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-800">Time of day</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={draft.timeBlock}
                  onChange={(e) => setDraft((d) => ({ ...d, timeBlock: e.target.value }))}
                >
                  {TIME_BLOCKS.map((tb) => (
                    <option key={tb} value={tb}>
                      {tb === 'ANY' ? 'Any time' : tb.charAt(0) + tb.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-800">Base points</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={draft.pointsBase}
                  onChange={(e) => setDraft((d) => ({ ...d, pointsBase: e.target.value }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                Active (inactive templates do not generate tasks)
              </label>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
              >
                {saving ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importReviewOpen && canEdit && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-2 md:p-4">
          <div
            className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 sm:max-h-[92vh] sm:rounded-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-review-title"
          >
            <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
              <h3 id="import-review-title" className="text-lg font-semibold text-gray-900">
                Review imported tasks
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Parsed using{' '}
                {importParseMode === 'structured'
                  ? 'Task/Category/Area/Person/Day/Time/Frequency blocks from your file'
                  : importParseMode === 'openai'
                    ? 'OpenAI extraction'
                    : 'line-by-line heuristics'}
                . Adjust fields before adding. Rows marked anyone-can-do are created with no fixed assignees. For
                fixed assignees, names from the file are matched to household members when possible; otherwise use the
                checkboxes or the household default (first child in the list).
              </p>
              {importParseMessage ? (
                <p className="mt-2 text-sm text-amber-800">{importParseMessage}</p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-2 py-3 sm:px-4">
              <div className="space-y-4 pb-1 lg:hidden" aria-label="Imported tasks (mobile)">
                {importRows.map((row, idx) => (
                  <div
                    key={`import-mobile-${idx}`}
                    className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-900">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() =>
                          setImportRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r))
                          )
                        }
                      />
                      Use this row when adding
                    </label>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Task</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        value={row.name}
                        onChange={(e) =>
                          setImportRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r))
                          )
                        }
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Description</span>
                      <textarea
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        rows={2}
                        placeholder="Optional"
                        value={row.description ?? ''}
                        onChange={(e) =>
                          setImportRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, description: e.target.value || null } : r))
                          )
                        }
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Category</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          value={row.categoryId}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? { ...r, categoryId: parseInt(e.target.value, 10), categoryMatch: 'exact' }
                                  : r
                              )
                            )
                          }
                        >
                          {sortedCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col justify-end">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Match</span>
                        <p className="mt-1 text-sm text-gray-700">
                          {row.categoryMatch === 'exact'
                            ? 'Exact'
                            : row.categoryMatch === 'partial'
                              ? 'Partial'
                              : row.categoryMatch === 'suggested'
                                ? 'Inferred'
                                : 'Guess'}
                        </p>
                      </div>
                    </div>
                    {!row.anyoneMayComplete && (
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Assignees</span>
                        <div className="mt-2 flex flex-col gap-2">
                          {(assignableMembers.length > 0 ? assignableMembers : members).map((m) => (
                            <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                              <input
                                type="checkbox"
                                checked={row.assigneeIds.includes(m.id)}
                                onChange={() =>
                                  setImportRows((rows) =>
                                    rows.map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            assigneeIds: toggleAssignee(r.assigneeIds, m.id, false),
                                          }
                                        : r
                                    )
                                  )
                                }
                              />
                              <span>{m.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">House area</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          value={normalizeHouseArea(row.houseArea)}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, houseArea: e.target.value as ChoreHouseAreaCode } : r
                              )
                            )
                          }
                        >
                          {CHORE_HOUSE_AREAS.map((code) => (
                            <option key={code} value={code}>
                              {CHORE_HOUSE_AREA_LABELS[code]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 self-end text-sm text-gray-800 sm:pt-6">
                        <input
                          type="checkbox"
                          title="Anyone in the household may complete (no fixed assignee)"
                          checked={row.anyoneMayComplete}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => {
                                if (i !== idx) return r;
                                const on = e.target.checked;
                                if (on) return { ...r, anyoneMayComplete: true, assigneeIds: [] };
                                const fb = defaultAssigneeIdsForNewTemplate();
                                return {
                                  ...r,
                                  anyoneMayComplete: false,
                                  assigneeIds: r.assigneeIds.length > 0 ? r.assigneeIds : fb,
                                };
                              })
                            )
                          }
                        />
                        Anyone may complete
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">How often</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          value={row.frequencyType}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, frequencyType: e.target.value } : r))
                            )
                          }
                        >
                          {FREQUENCY_TYPES.map((f) => (
                            <option key={f} value={f}>
                              {FREQUENCY_LABELS[f] ?? f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Time block</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          value={row.timeBlock}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, timeBlock: e.target.value } : r))
                            )
                          }
                        >
                          {TIME_BLOCKS.map((tb) => (
                            <option key={tb} value={tb}>
                              {tb}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Weekday</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:opacity-40"
                          disabled={row.frequencyType !== 'WEEKLY'}
                          value={row.dayOfWeek == null ? '' : String(row.dayOfWeek)}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      dayOfWeek:
                                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                                    }
                                  : r
                              )
                            )
                          }
                        >
                          {IMPORT_WEEKDAY_OPTIONS.map((d) => (
                            <option key={d.v === '' ? 'none' : d.v} value={d.v}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Week of month
                        </span>
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:opacity-40"
                          disabled={row.frequencyType !== 'MONTHLY'}
                          value={row.weekOfMonth == null ? '' : String(row.weekOfMonth)}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      weekOfMonth:
                                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                                    }
                                  : r
                              )
                            )
                          }
                        >
                          <option value="">Not set</option>
                          {[1, 2, 3, 4].map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Use</th>
                    <th className="px-2 py-2 font-semibold">Task</th>
                    <th className="px-2 py-2 font-semibold">Description</th>
                    <th className="px-2 py-2 font-semibold">Category</th>
                    <th className="px-2 py-2 font-semibold">Category match</th>
                    <th className="px-2 py-2 font-semibold">Assignees</th>
                    <th className="px-2 py-2 font-semibold">House area</th>
                    <th className="px-2 py-2 font-semibold">Anyone</th>
                    <th className="px-2 py-2 font-semibold">How often</th>
                    <th className="px-2 py-2 font-semibold">Time</th>
                    <th className="px-2 py-2 font-semibold">Weekday</th>
                    <th className="px-2 py-2 font-semibold">Week of month</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importRows.map((row, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() =>
                            setImportRows((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r))
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="w-full min-w-[8rem] rounded border border-gray-200 px-2 py-1"
                          value={row.name}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r))
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <textarea
                          className="w-full min-w-[8rem] rounded border border-gray-200 px-2 py-1"
                          rows={2}
                          placeholder="Optional"
                          value={row.description ?? ''}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, description: e.target.value || null } : r))
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="w-full max-w-[10rem] rounded border border-gray-200 px-2 py-1"
                          value={row.categoryId}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? { ...r, categoryId: parseInt(e.target.value, 10), categoryMatch: 'exact' }
                                  : r
                              )
                            )
                          }
                        >
                          {sortedCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-gray-600">
                        {row.categoryMatch === 'exact'
                          ? 'Exact'
                          : row.categoryMatch === 'partial'
                            ? 'Partial'
                            : row.categoryMatch === 'suggested'
                              ? 'Inferred'
                              : 'Guess'}
                      </td>
                      <td className="px-2 py-2 min-w-[7rem] max-w-[12rem]">
                        {row.anyoneMayComplete ? (
                          <span className="text-xs text-gray-500">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {(assignableMembers.length > 0 ? assignableMembers : members).map((m) => (
                              <label
                                key={m.id}
                                className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-800"
                              >
                                <input
                                  type="checkbox"
                                  checked={row.assigneeIds.includes(m.id)}
                                  onChange={() =>
                                    setImportRows((rows) =>
                                      rows.map((r, i) =>
                                        i === idx
                                          ? {
                                              ...r,
                                              assigneeIds: toggleAssignee(r.assigneeIds, m.id, false),
                                            }
                                          : r
                                      )
                                    )
                                  }
                                />
                                <span className="truncate">{m.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="w-full max-w-[9rem] rounded border border-gray-200 px-1 py-1"
                          value={normalizeHouseArea(row.houseArea)}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, houseArea: e.target.value as ChoreHouseAreaCode } : r
                              )
                            )
                          }
                        >
                          {CHORE_HOUSE_AREAS.map((code) => (
                            <option key={code} value={code}>
                              {CHORE_HOUSE_AREA_LABELS[code]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          title="Anyone in the household may complete (no fixed assignee)"
                          checked={row.anyoneMayComplete}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => {
                                if (i !== idx) return r;
                                const on = e.target.checked;
                                if (on) return { ...r, anyoneMayComplete: true, assigneeIds: [] };
                                const fb = defaultAssigneeIdsForNewTemplate();
                                return {
                                  ...r,
                                  anyoneMayComplete: false,
                                  assigneeIds: r.assigneeIds.length > 0 ? r.assigneeIds : fb,
                                };
                              })
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="w-full max-w-[9rem] rounded border border-gray-200 px-1 py-1"
                          value={row.frequencyType}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, frequencyType: e.target.value } : r))
                            )
                          }
                        >
                          {FREQUENCY_TYPES.map((f) => (
                            <option key={f} value={f}>
                              {FREQUENCY_LABELS[f] ?? f}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="w-full max-w-[6rem] rounded border border-gray-200 px-1 py-1"
                          value={row.timeBlock}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, timeBlock: e.target.value } : r))
                            )
                          }
                        >
                          {TIME_BLOCKS.map((tb) => (
                            <option key={tb} value={tb}>
                              {tb}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="w-full max-w-[7rem] rounded border border-gray-200 px-1 py-1 disabled:opacity-40"
                          disabled={row.frequencyType !== 'WEEKLY'}
                          value={row.dayOfWeek == null ? '' : String(row.dayOfWeek)}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      dayOfWeek:
                                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                                    }
                                  : r
                              )
                            )
                          }
                        >
                          {IMPORT_WEEKDAY_OPTIONS.map((d) => (
                            <option key={d.v === '' ? 'none' : d.v} value={d.v}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="w-full max-w-[5rem] rounded border border-gray-200 px-1 py-1 disabled:opacity-40"
                          disabled={row.frequencyType !== 'MONTHLY'}
                          value={row.weekOfMonth == null ? '' : String(row.weekOfMonth)}
                          onChange={(e) =>
                            setImportRows((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      weekOfMonth:
                                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                                    }
                                  : r
                              )
                            )
                          }
                        >
                          <option value="">Not set</option>
                          {[1, 2, 3, 4].map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2 sm:px-6">
              <button
                type="button"
                onClick={() => {
                  setImportRows((rows) => rows.map((r) => ({ ...r, selected: true })));
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 sm:w-auto sm:py-2"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportRows((rows) => rows.map((r) => ({ ...r, selected: false })));
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 sm:w-auto sm:py-2"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={closeImportReview}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importBulkSaving}
                onClick={() => void commitImportSelected()}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
              >
                {importBulkSaving ? 'Adding…' : `Add ${importRows.filter((r) => r.selected).length} template(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
