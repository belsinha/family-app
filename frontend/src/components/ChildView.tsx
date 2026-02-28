import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import type {
  Challenge,
  ChallengeWithProgress,
  ChallengeProgressEntry,
} from '../utils/api';
import type { Child, ChildBalance, Point, ChildBitcoinBalance, WorkLog, Project } from '../../../shared/src/types';
import BitcoinPrice from './BitcoinPrice';
import WorkLogModal from './WorkLog';
import WorkTimer from './WorkTimer';

export default function ChildView() {
  const { user } = useAuth();
  const [child, setChild] = useState<Child | null>(null);
  const [balance, setBalance] = useState<ChildBalance | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [bitcoinBalance, setBitcoinBalance] = useState<ChildBitcoinBalance | null>(null);
  const [bitcoinPrice, setBitcoinPrice] = useState<{ price_usd: number; fetched_at: string } | null>(null);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeWithProgress | null>(null);
  const [progressNote, setProgressNote] = useState('');
  const [progressAmount, setProgressAmount] = useState<string>('');
  const [showWorkLog, setShowWorkLog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      setIsLoading(true);
      try {
        // Get child record for this user
        const children = await api.getChildren();
        const childRecord = children.find((c) => c.user_id === user.id);
        
        if (!childRecord) {
          setError('Child record not found');
          setIsLoading(false);
          return;
        }

        setChild(childRecord);

        // Load balance, points, work logs, projects, and Bitcoin data
        const [balanceData, pointsData, workLogsData, projectsData, bitcoinData, priceData, challengesData] = await Promise.all([
          api.getChildBalance(childRecord.id),
          api.getPointsByChildIdLast7Days(childRecord.id),
          api.getWorkLogsByChildId(childRecord.id).catch((err) => {
            console.warn('Failed to load work logs:', err);
            return [];
          }),
          api.getActiveProjects().catch(() => []),
          api.getBitcoinBalance(childRecord.id).catch(() => null),
          api.getBitcoinPrice().catch(() => null),
          api.getChallengesByChildId(childRecord.id).catch((err) => {
            console.warn('Failed to load challenges:', err);
            return [];
          }),
        ]);

        setBalance(balanceData);
        setPoints(pointsData);
        setWorkLogs(workLogsData);
        setActiveProjects(projectsData);
        setBitcoinBalance(bitcoinData);
        setBitcoinPrice(priceData);
        setChallenges(challengesData);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load data';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Refresh Bitcoin balance every 30 seconds to update USD value
  useEffect(() => {
    if (!child) return;

    const updateBitcoinBalance = async () => {
      try {
        const [balanceData, priceData] = await Promise.all([
          api.getBitcoinBalance(child.id),
          api.getBitcoinPrice(),
        ]);
        setBitcoinBalance(balanceData);
        setBitcoinPrice(priceData);
      } catch (err) {
        // Silently fail
      }
    };

    const interval = setInterval(updateBitcoinBalance, 30000);
    return () => clearInterval(interval);
  }, [child?.id]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading your data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <p className="text-red-800 font-semibold mb-2">Error</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!child || !balance) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No data found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome, {child.name}!</h2>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Bonus Points</div>
            <div className="text-2xl font-bold text-green-700">{balance.bonus}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Demerit Points</div>
            <div className="text-2xl font-bold text-red-700">{balance.demerit}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Balance</div>
            <div className="text-2xl font-bold text-blue-700">{balance.balance}</div>
          </div>
        </div>

        {bitcoinBalance && (
          <div className={`p-6 border rounded-lg ${
            bitcoinBalance.totalSatoshis > 0 
              ? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200' 
              : bitcoinBalance.totalSatoshis < 0
              ? 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="text-center">
              <div className="text-sm text-gray-600 font-medium mb-2">Bitcoin Balance</div>
              <div className={`text-4xl font-bold mb-2 ${
                bitcoinBalance.totalSatoshis > 0 
                  ? 'text-orange-600' 
                  : bitcoinBalance.totalSatoshis < 0
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`}>
                ${bitcoinBalance.currentUsdValue.toLocaleString('en-US', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </div>
              <div className="text-sm text-gray-500">
                {bitcoinBalance.totalBtc.toFixed(8)} BTC ({bitcoinBalance.totalSatoshis.toLocaleString('en-US')} satoshis)
              </div>
              {bitcoinPrice && (
                <div className="text-xs text-gray-400 mt-1">
                  @ ${bitcoinPrice.price_usd.toLocaleString('en-US', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}/BTC
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mb-6">
        <WorkTimer
          childId={child.id}
          projects={activeProjects}
          onSaveLog={() => {
            setShowWorkLog(true);
          }}
        />
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Work Logs</h3>
            <p className="text-sm text-gray-500">Manual entries and timer logs</p>
          </div>
          <button
            onClick={() => setShowWorkLog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            + Add Work Log
          </button>
        </div>
        {workLogs.length === 0 ? (
          <p className="text-gray-600">No work logs recorded. Click "Add Work Log" to get started.</p>
        ) : (
          <div className="space-y-3">
            {workLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="p-4 rounded-lg border bg-blue-50 border-blue-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-lg text-blue-700">
                        {Number(log.hours)} hour{Number(log.hours) !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs px-2 py-1 rounded bg-blue-200 text-blue-800">
                        {new Date(log.work_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{log.description}</p>
                    <p className="text-xs text-gray-500">
                      Logged on {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {workLogs.length > 5 && (
              <button
                onClick={() => setShowWorkLog(true)}
                className="w-full mt-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                View All Work Logs ({workLogs.length} total)
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Challenges</h3>
          <p className="text-sm text-gray-500">Goals set for you; log progress and mark complete by the deadline.</p>
        </div>
        {challenges.length === 0 ? (
          <p className="text-gray-600">No challenges yet.</p>
        ) : (
          <div className="space-y-3">
            {challenges.map((c) => (
              <div
                key={c.id}
                className={`p-4 rounded-lg border ${
                  c.status === 'active'
                    ? 'bg-amber-50 border-amber-200'
                    : c.status === 'completed'
                    ? 'bg-green-50 border-green-200'
                    : c.status === 'expired'
                    ? 'bg-gray-100 border-gray-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-gray-900">{c.title}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          c.status === 'active'
                            ? 'bg-amber-200 text-amber-800'
                            : c.status === 'completed'
                            ? 'bg-green-200 text-green-800'
                            : c.status === 'expired'
                            ? 'bg-gray-300 text-gray-700'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Due {new Date(c.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {c.reward_type === 'bonus_points' && c.reward_points != null && (
                        <span className="ml-2">Reward: +{c.reward_points} pts</span>
                      )}
                      {c.reward_type === 'custom' && c.reward_description && (
                        <span className="ml-2">Reward: {c.reward_description}</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const full = await api.getChallenge(c.id);
                        setSelectedChallenge(selectedChallenge?.id === c.id ? null : full);
                        setProgressNote('');
                        setProgressAmount('');
                      } catch (err) {
                        console.error('Failed to load challenge:', err);
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700 whitespace-nowrap"
                  >
                    {selectedChallenge?.id === c.id ? 'Hide' : 'View & log progress'}
                  </button>
                </div>
                {selectedChallenge?.id === c.id && selectedChallenge && (
                  <div className="mt-4 pt-4 border-t border-amber-200">
                    {selectedChallenge.description && (
                      <p className="text-sm text-gray-700 mb-2">{selectedChallenge.description}</p>
                    )}
                    {selectedChallenge.target_number != null && (
                      <p className="text-sm text-gray-600 mb-2">
                        Target: {selectedChallenge.target_number} {selectedChallenge.target_unit || ''}
                      </p>
                    )}
                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-700 mb-1">Progress log</p>
                      {selectedChallenge.progress.length === 0 ? (
                        <p className="text-sm text-gray-500">No entries yet.</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {selectedChallenge.progress.map((entry: ChallengeProgressEntry) => (
                            <li key={entry.id} className="flex gap-2 text-gray-700">
                              <span className="text-gray-500 shrink-0">
                                {new Date(entry.logged_at).toLocaleDateString()}:
                              </span>
                              {entry.amount != null && <span>(+{entry.amount})</span>}
                              <span>{entry.note}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {(selectedChallenge.status === 'active' || selectedChallenge.status === 'expired') && (
                      <>
                        <div className="flex gap-2 flex-wrap items-end mb-2">
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">Note</label>
                            <input
                              type="text"
                              value={progressNote}
                              onChange={(e) => setProgressNote(e.target.value)}
                              placeholder="What did you do?"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          {selectedChallenge.target_number != null && (
                            <div className="w-20">
                              <label className="block text-xs font-medium text-gray-600 mb-0.5">Amount</label>
                              <input
                                type="number"
                                min={0}
                                value={progressAmount}
                                onChange={(e) => setProgressAmount(e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              if (!progressNote.trim()) return;
                              try {
                                await api.addChallengeProgress(selectedChallenge.id, {
                                  note: progressNote.trim(),
                                  amount: progressAmount === '' ? undefined : Number(progressAmount),
                                });
                                const updated = await api.getChallenge(selectedChallenge.id);
                                setSelectedChallenge(updated);
                                setProgressNote('');
                                setProgressAmount('');
                              } catch (err) {
                                console.error('Failed to add progress:', err);
                              }
                            }}
                            className="px-3 py-1.5 bg-gray-700 text-white text-sm font-medium rounded hover:bg-gray-800"
                          >
                            Log progress
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.updateChallenge(selectedChallenge.id, { status: 'completed' });
                              const [list, bal, pts] = await Promise.all([
                                api.getChallengesByChildId(child.id),
                                api.getChildBalance(child.id),
                                api.getPointsByChildIdLast7Days(child.id),
                              ]);
                              setChallenges(list);
                              setSelectedChallenge(null);
                              setBalance(bal);
                              setPoints(pts);
                            } catch (err) {
                              console.error('Failed to mark complete:', err);
                            }
                          }}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
                        >
                          Mark complete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Recent Points</h3>
            <p className="text-sm text-gray-500">Last 7 days</p>
          </div>
        </div>
        {points.length === 0 ? (
          <p className="text-gray-600">No points recorded in the last 7 days.</p>
        ) : (
          <div className="space-y-3">
            {points.map((point) => (
              <div
                key={point.id}
                className={`p-4 rounded-lg border ${
                  point.type === 'bonus' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-semibold ${point.type === 'bonus' ? 'text-green-700' : 'text-red-700'}`}>
                        {point.type === 'bonus' ? '+' : '-'}{point.points} points
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          point.type === 'bonus'
                            ? 'bg-green-200 text-green-800'
                            : 'bg-red-200 text-red-800'
                        }`}
                      >
                        {point.type}
                      </span>
                    </div>
                    {point.reason && (
                      <p className="text-sm text-gray-700 mt-1">{point.reason}</p>
                    )}
                    <p className="text-xs text-gray-600 mt-1 font-medium">
                      Given by: {point.parent_name || 'Anonymous'}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500 ml-4">
                    {new Date(point.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6">
        <BitcoinPrice />
      </div>

      {showWorkLog && child && (
        <WorkLogModal
          childId={child.id}
          childName={child.name}
          onClose={() => setShowWorkLog(false)}
          onCreate={async () => {
            try {
              const logs = await api.getWorkLogsByChildId(child.id);
              setWorkLogs(logs);
            } catch (err) {
              console.error('Failed to refresh work logs:', err);
            }
          }}
        />
      )}
    </div>
  );
}

