/**
 * Work Timer Mockup
 *
 * A stopwatch-style time tracker for children to log project work hours.
 * This is a UI mockup - not wired to the backend yet.
 */

import { useState, useEffect } from 'react';

interface Project {
  id: number;
  name: string;
  bonus_rate: number;
}

interface WorkTimerProps {
  childId?: number;
  projects?: Project[];
  onSaveLog?: (projectId: number, hours: number, description: string) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function WorkTimer({
  childId: _childId,
  projects = [],
  onSaveLog,
}: WorkTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [projectId, setProjectId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [sessionComplete, setSessionComplete] = useState(false);
  const [recentSessions, setRecentSessions] = useState<
    { project: string; hours: number; description: string }[]
  >([]);

  const mockProjects: Project[] =
    projects.length > 0
      ? projects
      : [
          { id: 1, name: 'Yard work', bonus_rate: 2 },
          { id: 2, name: 'Homework', bonus_rate: 1 },
          { id: 3, name: 'Kitchen cleanup', bonus_rate: 1 },
        ];

  const activeProjectId = projectId || String(mockProjects[0]?.id ?? '');

  useEffect(() => {
    const list = projects.length > 0 ? projects : mockProjects;
    if (list.length === 0) return;
    const valid = list.some((p) => String(p.id) === projectId);
    if (!projectId || !valid) {
      setProjectId(String(list[0].id));
    }
  }, [projects, projectId]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRunning) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  const handleStart = () => {
    if (!activeProjectId) return;
    setIsRunning(true);
    setSessionComplete(false);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStop = () => {
    setIsRunning(false);
    setSessionComplete(true);
  };

  const handleSaveLog = () => {
    const hours = Math.round((elapsedSeconds / 3600) * 100) / 100;
    const project = mockProjects.find((p) => String(p.id) === activeProjectId);
    if (project && hours > 0) {
      setRecentSessions((prev) => [
        { project: project.name, hours, description },
        ...prev.slice(0, 4),
      ]);
      onSaveLog?.(project.id, hours, description);
    }
    setElapsedSeconds(0);
    setDescription('');
    setSessionComplete(false);
  };

  const handleDiscard = () => {
    setElapsedSeconds(0);
    setDescription('');
    setSessionComplete(false);
  };

  const hoursToLog = Math.round((elapsedSeconds / 3600) * 100) / 100;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-900">Work Timer</h3>
        <p className="text-sm text-gray-500">
          Track your time on a project with the stopwatch
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Project
          </label>
          <select
            value={activeProjectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={isRunning}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {mockProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.bonus_rate} pts/hour)
              </option>
            ))}
          </select>
        </div>

        <div className="bg-slate-50 rounded-xl p-8 text-center border-2 border-slate-200">
          <div
            className={`text-5xl font-mono font-bold tracking-wider mb-4 ${
              isRunning ? 'text-blue-600' : 'text-gray-700'
            } ${isRunning ? 'animate-pulse' : ''}`}
          >
            {formatTime(elapsedSeconds)}
          </div>
          {isRunning && (
            <div className="flex items-center justify-center gap-2 text-blue-600 text-sm font-medium mb-4">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Recording
            </div>
          )}
          <div className="flex justify-center gap-3">
            {!isRunning && elapsedSeconds === 0 && (
              <button
                onClick={handleStart}
                className="px-8 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors shadow-md"
              >
                Start
              </button>
            )}
            {isRunning && (
              <>
                <button
                  onClick={handlePause}
                  className="px-6 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors"
                >
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
                >
                  Stop & Log
                </button>
              </>
            )}
            {!isRunning && elapsedSeconds > 0 && !sessionComplete && (
              <>
                <button
                  onClick={() => setIsRunning(true)}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
                >
                  Resume
                </button>
                <button
                  onClick={handleStop}
                  className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
                >
                  Stop & Log
                </button>
              </>
            )}
          </div>
        </div>

        {sessionComplete && elapsedSeconds > 0 && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Ready to log
              </span>
              <span className="text-lg font-bold text-blue-700">
                {hoursToLog} {hoursToLog === 1 ? 'hour' : 'hours'}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={2}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSaveLog}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Save Work Log
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {recentSessions.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Recent sessions (mockup)
            </h4>
            <ul className="space-y-2">
              {recentSessions.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm py-2 px-3 bg-gray-50 rounded-lg"
                >
                  <span className="font-medium text-gray-800">{s.project}</span>
                  <span className="text-gray-600">
                    {s.hours}h
                    {s.description ? ` - ${s.description}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400 italic">
        Mockup: Timer state is local. Saving will integrate with Work Logs.
      </p>
    </div>
  );
}
