import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type MonthlyAllowanceBreakdown,
  type MonthlyAllowanceLine,
  type MonthlyAllowanceStatus,
} from '../../utils/api';

function currentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function statusLabel(s: MonthlyAllowanceStatus | undefined): string {
  if (s === 'APPROVED') return 'Approved';
  if (s === 'REJECTED') return 'Rejected';
  if (s === 'PENDING_APPROVAL') return 'Pending approval';
  return '—';
}

function statusBadgeClass(s: MonthlyAllowanceStatus | undefined): string {
  if (s === 'APPROVED') return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  if (s === 'REJECTED') return 'bg-rose-100 text-rose-900 border-rose-200';
  if (s === 'PENDING_APPROVAL') return 'bg-amber-100 text-amber-950 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function AllowanceView() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [breakdown, setBreakdown] = useState<MonthlyAllowanceBreakdown[]>([]);
  const [lines, setLines] = useState<MonthlyAllowanceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [preview, stored] = await Promise.all([
        api.getAllowanceMonthlyPreview(yearMonth),
        api.getAllowanceMonthlyLines(yearMonth),
      ]);
      setBreakdown(preview.breakdown);
      setLines(stored.lines);
    } catch (e) {
      setBreakdown([]);
      setLines([]);
      setError(e instanceof Error ? e.message : 'Failed to load allowance');
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const lineByMemberId = useMemo(() => {
    const m = new Map<number, MonthlyAllowanceLine>();
    for (const line of lines) {
      m.set(line.householdMemberId, line);
    }
    return m;
  }, [lines]);

  const submitForApproval = async () => {
    setActionError(null);
    setBusy(true);
    try {
      const res = await api.submitAllowanceMonthlyForApproval(yearMonth);
      setLines(res.lines);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const approve = async (lineId: number) => {
    setActionError(null);
    setBusy(true);
    try {
      await api.approveAllowanceLine(lineId);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (lineId: number) => {
    const reason = window.prompt('Optional note for rejection (cancel to abort):');
    if (reason === null) return;
    setActionError(null);
    setBusy(true);
    try {
      await api.rejectAllowanceLine(lineId, reason || undefined);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-4 text-sm text-blue-950">
        <p className="font-medium text-blue-950">How allowance is calculated</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-blue-900">
          <li>
            Each child starts from {formatUsdFromCents(10_000)} per calendar month when every required chore for that
            month is completed.
          </li>
          <li>
            Incomplete chores reduce the total in equal shares (for example, 9 of 10 done is roughly{' '}
            {formatUsdFromCents(Math.round((10_000 * 9) / 10))}).
          </li>
          <li>
            Extra (bonus) chores and inactive templates do not count toward this allowance. Bonus points from chores
            are separate and are not included here.
          </li>
          <li>
            If a parent approves an allowance excuse on a task (from Today&apos;s pending list), that chore is left out
            of the required count for the month so it does not lower the payout.
          </li>
          <li>
            For shared &quot;anyone&quot; chores (one household task per day), the child who completes it earns the
            completion; if it stays undone, a parent picks which child carries the missed chore for allowance purposes
            on that day.
          </li>
          <li>Use &quot;Submit for approval&quot; when the month is ready for review; then approve or reject each line.</li>
        </ul>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="allowance-month" className="block text-sm font-medium text-gray-700">
            Month
          </label>
          <input
            id="allowance-month"
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void submitForApproval()}
          disabled={loading || busy || breakdown.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Submit for approval
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}
      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{actionError}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : breakdown.length === 0 ? (
        <p className="text-sm text-gray-600">No allowance-eligible household members (children) found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Child</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Required</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Done</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Pending</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Missed</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Excused</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Proposed</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {breakdown.map((row) => {
                const line = lineByMemberId.get(row.householdMemberId);
                const status = line?.status;
                return (
                  <tr key={row.householdMemberId}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.memberName}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{row.requiredChoreCount}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{row.completedChoreCount}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{row.pendingChoreCount}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{row.missedChoreCount}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{row.excusedChoreCount ?? 0}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatUsdFromCents(row.proposedCents)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                      >
                        {statusLabel(status)}
                      </span>
                      {line?.skipped && (
                        <span className="ml-2 text-xs text-gray-500">(unchanged; already approved)</span>
                      )}
                      {line?.status === 'REJECTED' && line.rejectionReason && (
                        <div className="mt-1 text-xs text-rose-800">Note: {line.rejectionReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {line?.status === 'PENDING_APPROVAL' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void approve(line.id)}
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void reject(line.id)}
                            className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
