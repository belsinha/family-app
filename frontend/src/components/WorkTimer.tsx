/**
 * Work Timer
 *
 * Stopwatch-style tracker for logging project work, backed by the server:
 * the running timer lives in the database (started_at wall clock), so it keeps
 * counting across navigation, reloads, and closed browsers. Elapsed time shown
 * here is server-computed at fetch plus a local display-only tick — the amount
 * that gets logged on stop is always computed on the server from started_at.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../utils/api';
import type { ActiveTimer, Project, WorkLog } from '../../../shared/src/types';

interface WorkTimerProps {
  childId?: number;
  projects?: Project[];
  /** Called after a stop successfully created a work log (refresh lists, etc.). */
  onLogCreated?: (workLog: WorkLog) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Server elapsed at last sync + wall-clock time since that sync (display only). */
interface TimerSync {
  timer: ActiveTimer;
  elapsedAtSync: number;
  syncedAtMs: number;
}

export default function WorkTimer({ childId, projects = [], onLogCreated }: WorkTimerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [sync, setSync] = useState<TimerSync | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [projectId, setProjectId] = useState<string>('');
  const [showStopPanel, setShowStopPanel] = useState(false);
  const [description, setDescription] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const syncRef = useRef<TimerSync | null>(null);
  syncRef.current = sync;

  const refreshFromServer = useCallback(async () => {
    if (!childId) return;
    try {
      const res = await api.getActiveWorkTimer(childId);
      if (res.active && res.timer) {
        setSync({ timer: res.timer, elapsedAtSync: res.elapsedSeconds, syncedAtMs: Date.now() });
        setDisplaySeconds(res.elapsedSeconds);
      } else {
        setSync(null);
        setDisplaySeconds(0);
        setShowStopPanel(false);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timer');
    } finally {
      setIsLoading(false);
    }
  }, [childId]);

  // Initial load + periodic re-sync with the server (catches another device stopping it)
  useEffect(() => {
    setIsLoading(true);
    refreshFromServer();
    const resync = setInterval(refreshFromServer, 30_000);
    const onFocus = () => refreshFromServer();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(resync);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshFromServer]);

  // Display-only tick: recomputes from the last server sync, never accumulates
  useEffect(() => {
    if (!sync) return;
    const tick = setInterval(() => {
      const s = syncRef.current;
      if (!s) return;
      setDisplaySeconds(s.elapsedAtSync + Math.floor((Date.now() - s.syncedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [sync]);

  // Keep the project select pointing at a real project
  useEffect(() => {
    if (projects.length === 0) return;
    if (!projectId || !projects.some((p) => String(p.id) === projectId)) {
      setProjectId(String(projects[0].id));
    }
  }, [projects, projectId]);

  const isRunning = sync !== null;
  const runningProject =
    sync?.timer.project ?? projects.find((p) => p.id === sync?.timer.project_id) ?? null;

  const handleStart = async () => {
    if (!childId || !projectId) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.startWorkTimer(childId, Number(projectId));
      await refreshFromServer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start timer');
      // A 409 means a timer is already running (e.g. started on another device) — show it
      await refreshFromServer();
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmStop = async () => {
    if (!childId) return;
    setIsBusy(true);
    setError(null);
    try {
      const res = await api.stopWorkTimer(childId, description.trim());
      setShowStopPanel(false);
      setDescription('');
      if (res.workLog) {
        const hours = Number(res.workLog.hours);
        setNotice(
          `Logged ${hours} ${hours === 1 ? 'hour' : 'hours'}${
            res.cappedAt24h ? ' (capped at 24h)' : ''
          } — waiting for approval.`
        );
        onLogCreated?.(res.workLog);
      } else if (res.warning) {
        setNotice(res.warning);
      } else if (!res.stopped) {
        setNotice('The timer was already stopped.');
      }
      await refreshFromServer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop timer');
      await refreshFromServer();
    } finally {
      setIsBusy(false);
    }
  };

  const hoursPreview = Math.round((displaySeconds / 3600) * 100) / 100;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-900">Work Timer</h3>
        <p className="text-sm text-gray-500">
          Runs on the server — it keeps counting even if you leave this page or close the browser.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" data-testid="timer-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800" data-testid="timer-notice">
          {notice}
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500 py-8 text-center">Loading timer…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
            {isRunning ? (
              <div
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700"
                data-testid="timer-running-project"
              >
                {runningProject ? runningProject.name : `Project #${sync?.timer.project_id}`}
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                No active projects right now — ask a parent to create one.
              </p>
            ) : (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                data-testid="timer-project-select"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.bonus_rate} pts/hour)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="bg-slate-50 rounded-xl p-8 text-center border-2 border-slate-200">
            <div
              data-testid="timer-display"
              className={`text-5xl font-mono font-bold tracking-wider mb-4 ${
                isRunning ? 'text-blue-600' : 'text-gray-700'
              }`}
            >
              {formatTime(displaySeconds)}
            </div>
            {isRunning && (
              <div
                className="flex items-center justify-center gap-2 text-blue-600 text-sm font-medium mb-4"
                data-testid="timer-running-indicator"
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Recording — started {new Date(sync!.timer.started_at).toLocaleString()}
              </div>
            )}
            {isRunning && displaySeconds > 24 * 3600 && (
              <p className="text-xs text-amber-600 mb-4">
                This timer has been running over 24 hours — logged time is capped at 24h.
              </p>
            )}
            <div className="flex justify-center gap-3">
              {!isRunning && (
                <button
                  onClick={handleStart}
                  disabled={isBusy || !childId || projects.length === 0}
                  data-testid="timer-start"
                  className="px-8 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start
                </button>
              )}
              {isRunning && !showStopPanel && (
                <button
                  onClick={() => setShowStopPanel(true)}
                  disabled={isBusy}
                  data-testid="timer-stop"
                  className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Stop &amp; Log
                </button>
              )}
            </div>
          </div>

          {isRunning && showStopPanel && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4" data-testid="timer-stop-panel">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Ready to log (timer keeps running until you save)
                </span>
                <span className="text-lg font-bold text-blue-700">
                  ~{hoursPreview} {hoursPreview === 1 ? 'hour' : 'hours'}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What did you do?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Mowed the lawn, cleaned the garage"
                  data-testid="timer-description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmStop}
                  disabled={isBusy}
                  data-testid="timer-confirm-stop"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Stop &amp; Save Log
                </button>
                <button
                  onClick={() => {
                    setShowStopPanel(false);
                    setDescription('');
                  }}
                  disabled={isBusy}
                  data-testid="timer-keep-working"
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Keep Working
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
