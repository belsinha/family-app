import { useState, useEffect } from 'react';
import { api, type ChoreTemplate, type ChoreHouseholdMember } from '../../utils/api';

const FREQUENCY_TYPES = [
  'DAILY',
  'EVERY_OTHER_DAY',
  'WEEKLY',
  'MONTHLY',
  'SEMIANNUAL',
  'CONDITIONAL_SCHEDULE',
] as const;
const TIME_BLOCKS = ['MORNING', 'AFTERNOON', 'NIGHT', 'ANY'] as const;

interface TemplatesViewProps {
  members: ChoreHouseholdMember[];
  /** Logged-in parent who may edit (household member id with canEditChores + name match). */
  editorMemberId: number | null;
}

type Draft = {
  name: string;
  category: string;
  assignedToId: number;
  frequencyType: string;
  dayOfWeek: string;
  weekOfMonth: string;
  timeBlock: string;
  pointsBase: string;
  active: boolean;
};

function templateToDraft(t: ChoreTemplate): Draft {
  return {
    name: t.name,
    category: t.category,
    assignedToId: t.assignedToId,
    frequencyType: t.frequencyType,
    dayOfWeek: t.dayOfWeek != null ? String(t.dayOfWeek) : '',
    weekOfMonth: t.weekOfMonth != null ? String(t.weekOfMonth) : '',
    timeBlock: t.timeBlock,
    pointsBase: String(t.pointsBase),
    active: t.active,
  };
}

function emptyDraft(members: ChoreHouseholdMember[]): Draft {
  return {
    name: '',
    category: 'Shared Areas',
    assignedToId: members[0]?.id ?? 1,
    frequencyType: 'DAILY',
    dayOfWeek: '',
    weekOfMonth: '',
    timeBlock: 'ANY',
    pointsBase: '1',
    active: true,
  };
}

export default function TemplatesView({ members, editorMemberId }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<ChoreTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(members));
  const [saving, setSaving] = useState(false);

  const canEdit = editorMemberId != null;

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .getTemplates()
      .then(setTemplates)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft(members));
    setModalOpen(true);
  };

  const openEdit = (t: ChoreTemplate) => {
    setEditingId(t.id);
    setDraft(templateToDraft(t));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const draftWeekMonthOrNull = (d: Draft): number | null => {
    if (d.weekOfMonth === '') return null;
    const n = parseInt(d.weekOfMonth, 10);
    return Number.isNaN(n) ? null : n;
  };
  const draftDayWeekOrNull = (d: Draft): number | null => {
    if (d.dayOfWeek === '') return null;
    const n = parseInt(d.dayOfWeek, 10);
    return Number.isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    if (!canEdit || editorMemberId == null) return;
    if (!draft.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Omit<ChoreTemplate, 'id' | 'assignedTo'> = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      assignedToId: draft.assignedToId,
      frequencyType: draft.frequencyType,
      dayOfWeek: draftDayWeekOrNull(draft),
      weekOfMonth: draftWeekMonthOrNull(draft),
      dayOfMonth: null,
      semiannualMonths: null,
      conditionalDayOfWeek: null,
      conditionalAfterTime: null,
      timeBlock: draft.timeBlock,
      pointsBase: Math.max(1, parseInt(draft.pointsBase, 10) || 1),
      active: draft.active,
    };
    try {
      if (editingId == null) {
        await api.createTemplate(payload, editorMemberId);
      } else {
        await api.updateTemplate(editingId, payload, editorMemberId);
      }
      closeModal();
      load();
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
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) return <p className="text-gray-600">Loading...</p>;

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {!canEdit && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          Only the household member with edit permission (Celiane) can change templates, and your login name must match
          that person&apos;s name in the chore list.
        </p>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add template
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-b border-gray-200 px-2 py-2 text-left">Name</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Category</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Assigned</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Frequency</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Time</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Points</th>
              {canEdit && (
                <th className="border-b border-gray-200 px-2 py-2 text-left">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-gray-100">
                <td className="px-2 py-2">{t.name}</td>
                <td className="px-2 py-2">{t.category}</td>
                <td className="px-2 py-2">{t.assignedTo?.name ?? '-'}</td>
                <td className="px-2 py-2">
                  {t.frequencyType}
                  {t.dayOfWeek != null && ` (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.dayOfWeek]})`}
                  {t.weekOfMonth != null && ` wk${t.weekOfMonth}`}
                  {t.conditionalAfterTime && ` after ${t.conditionalAfterTime}`}
                </td>
                <td className="px-2 py-2">{t.timeBlock}</td>
                <td className="px-2 py-2">{t.pointsBase}</td>
                {canEdit && (
                  <td className="px-2 py-2 space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="text-blue-700 hover:underline text-xs font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="text-red-600 hover:underline text-xs font-medium"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingId == null ? 'New template' : 'Edit template'}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600">Name</label>
                <input
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Category</label>
                <input
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Assigned to</label>
                <select
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={draft.assignedToId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, assignedToId: parseInt(e.target.value, 10) }))
                  }
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Frequency</label>
                <select
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={draft.frequencyType}
                  onChange={(e) => setDraft((d) => ({ ...d, frequencyType: e.target.value }))}
                >
                  {FREQUENCY_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Day of week (0–6, optional)</label>
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="e.g. 1 for Mon"
                    value={draft.dayOfWeek}
                    onChange={(e) => setDraft((d) => ({ ...d, dayOfWeek: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Week of month (optional)</label>
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="1–4"
                    value={draft.weekOfMonth}
                    onChange={(e) => setDraft((d) => ({ ...d, weekOfMonth: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Time block</label>
                <select
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={draft.timeBlock}
                  onChange={(e) => setDraft((d) => ({ ...d, timeBlock: e.target.value }))}
                >
                  {TIME_BLOCKS.map((tb) => (
                    <option key={tb} value={tb}>
                      {tb}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Points</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={draft.pointsBase}
                  onChange={(e) => setDraft((d) => ({ ...d, pointsBase: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
