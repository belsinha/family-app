import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type {
  Challenge,
  ChallengeWithProgress,
  CreateChallengeRequest,
} from '../utils/api';
import type { Child, ChildBalance, ChildBitcoinBalance } from '../../../shared/src/types';
import PointLog from './PointLog';
import WorkLogModal from './WorkLog';

interface ChildCardProps {
  child: Child;
  initialBalance: ChildBalance;
  onBalanceUpdate: (childId: number, newBalance: ChildBalance) => void;
}

export default function ChildCard({ child, initialBalance, onBalanceUpdate }: ChildCardProps) {
  const [balance, setBalance] = useState<ChildBalance>(initialBalance);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasRecentPoint, setHasRecentPoint] = useState(false);
  const [showDescriptionInput, setShowDescriptionInput] = useState<'bonus' | 'demerit' | null>(null);
  const [description, setDescription] = useState('');
  const [showPointLog, setShowPointLog] = useState(false);
  const [showWorkLog, setShowWorkLog] = useState(false);
  const [bitcoinBalance, setBitcoinBalance] = useState<ChildBitcoinBalance | null>(null);
  const [bitcoinPrice, setBitcoinPrice] = useState<{ price_usd: number; fetched_at: string } | null>(null);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [showChallenges, setShowChallenges] = useState(false);
  const [showCreateChallenge, setShowCreateChallenge] = useState(false);
  const [selectedChallengeDetail, setSelectedChallengeDetail] = useState<ChallengeWithProgress | null>(null);
  const [createForm, setCreateForm] = useState<Partial<CreateChallengeRequest>>({
    childId: undefined,
    title: '',
    description: '',
    deadline: '',
    rewardType: 'bonus_points',
    rewardPoints: 0,
    rewardDescription: '',
    targetNumber: undefined,
    targetUnit: '',
  });

  // Update balance when initialBalance prop changes (e.g., when balances load from API)
  useEffect(() => {
    setBalance(initialBalance);
  }, [initialBalance]);

  // Check if there's a recent point to undo
  const checkForRecentPoint = async () => {
    try {
      await api.getMostRecentPoint(child.id);
      setHasRecentPoint(true);
    } catch {
      setHasRecentPoint(false);
    }
  };

  useEffect(() => {
    checkForRecentPoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id, balance.balance]);

  // Load Bitcoin balance and price
  useEffect(() => {
    const loadBitcoinData = async () => {
      try {
        const [balanceData, priceData] = await Promise.all([
          api.getBitcoinBalance(child.id),
          api.getBitcoinPrice(),
        ]);
        setBitcoinBalance(balanceData);
        setBitcoinPrice(priceData);
      } catch (err) {
        // Silently fail - Bitcoin balance is optional
        console.warn('Failed to load Bitcoin balance:', err);
      }
    };

    loadBitcoinData();

    // Refresh every 30 seconds to update USD value with current price
    const interval = setInterval(loadBitcoinData, 30000);
    return () => clearInterval(interval);
  }, [child.id]);

  // Update Bitcoin balance when points are added
  useEffect(() => {
    const updateBitcoinBalance = async () => {
      try {
        const balanceData = await api.getBitcoinBalance(child.id);
        setBitcoinBalance(balanceData);
      } catch (err) {
        // Silently fail
      }
    };

    if (balance.balance !== initialBalance.balance) {
      updateBitcoinBalance();
    }
  }, [balance.balance, child.id, initialBalance.balance]);

  // Load challenges when Challenges section is opened
  useEffect(() => {
    if (!showChallenges) return;
    const load = async () => {
      try {
        const list = await api.getChallengesByChildId(child.id);
        setChallenges(list);
      } catch (err) {
        console.warn('Failed to load challenges:', err);
      }
    };
    load();
  }, [showChallenges, child.id]);

  const handleAddPoints = async (type: 'bonus' | 'demerit') => {
    if (showDescriptionInput !== type) {
      setShowDescriptionInput(type);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.addPoints({
        childId: child.id,
        points: 1,
        type,
        description: description.trim() || undefined,
      });

      const newBalance = await api.getChildBalance(child.id);
      setBalance(newBalance);
      onBalanceUpdate(child.id, newBalance);
      
      // Update Bitcoin balance after adding any point (bonus or demerit)
      try {
        // Small delay to ensure backend has processed the conversion
        await new Promise(resolve => setTimeout(resolve, 500));
        const bitcoinData = await api.getBitcoinBalance(child.id);
        setBitcoinBalance(bitcoinData);
      } catch (err) {
        // Silently fail
        console.warn('Failed to refresh Bitcoin balance:', err);
      }
      
      setHasRecentPoint(true);
      setDescription('');
      setShowDescriptionInput(null);
      setSuccess(`${type === 'bonus' ? 'Bonus' : 'Demerit'} point added successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add points';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const recentPoint = await api.getMostRecentPoint(child.id);
      await api.deletePoint(recentPoint.id);

      const newBalance = await api.getChildBalance(child.id);
      setBalance(newBalance);
      onBalanceUpdate(child.id, newBalance);
      
      // Update Bitcoin balance after undo
      try {
        const bitcoinData = await api.getBitcoinBalance(child.id);
        setBitcoinBalance(bitcoinData);
      } catch (err) {
        // Silently fail
      }
      
      await checkForRecentPoint();
      setSuccess('Last action undone successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to undo action';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
      setShowUndoConfirm(false);
    }
  };

  const confirmUndo = () => {
    setShowUndoConfirm(true);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={confirmUndo}
            disabled={isLoading || !hasRecentPoint}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Undo last action"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          </button>
          <h3 className="text-xl font-semibold text-gray-900">{child.name}</h3>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600 mb-1">Balance</p>
          <p className="text-2xl font-bold text-blue-600">
            {balance.balance}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">Bonus</p>
          <p className="text-2xl font-bold text-green-600">{balance.bonus}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">Demerit</p>
          <p className="text-2xl font-bold text-red-600">{balance.demerit}</p>
        </div>
      </div>

      {bitcoinBalance && (
        <div className={`mb-4 p-4 border rounded-lg ${
          bitcoinBalance.totalSatoshis > 0 
            ? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200' 
            : bitcoinBalance.totalSatoshis < 0
            ? 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Bitcoin Balance</p>
            <p className={`text-3xl font-bold ${
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
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {bitcoinBalance.totalBtc.toFixed(8)} BTC ({bitcoinBalance.totalSatoshis.toLocaleString('en-US')} satoshis)
            </p>
            {bitcoinPrice && (
              <p className="text-xs text-gray-400 mt-1">
                @ ${bitcoinPrice.price_usd.toLocaleString('en-US', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}/BTC
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {showDescriptionInput === 'bonus' && (
          <div className="space-y-2">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleAddPoints('bonus');
                } else if (e.key === 'Escape') {
                  setShowDescriptionInput(null);
                  setDescription('');
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleAddPoints('bonus')}
                disabled={isLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                {isLoading ? 'Adding...' : 'Confirm Bonus'}
              </button>
              <button
                onClick={() => {
                  setShowDescriptionInput(null);
                  setDescription('');
                }}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {showDescriptionInput === 'demerit' && (
          <div className="space-y-2">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleAddPoints('demerit');
                } else if (e.key === 'Escape') {
                  setShowDescriptionInput(null);
                  setDescription('');
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleAddPoints('demerit')}
                disabled={isLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                {isLoading ? 'Adding...' : 'Confirm Demerit'}
              </button>
              <button
                onClick={() => {
                  setShowDescriptionInput(null);
                  setDescription('');
                }}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!showDescriptionInput && (
          <div className="flex gap-3">
            <button
              onClick={() => handleAddPoints('bonus')}
              disabled={isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isLoading ? 'Adding...' : 'Give Bonus'}
            </button>
            <button
              onClick={() => handleAddPoints('demerit')}
              disabled={isLoading}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isLoading ? 'Adding...' : 'Give Demerit'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
        <button
          onClick={() => setShowPointLog(true)}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Point Log
        </button>
        <button
          onClick={() => setShowWorkLog(true)}
          className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Work Log
        </button>
        <button
          onClick={() => setShowChallenges(!showChallenges)}
          className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {showChallenges ? 'Hide Challenges' : 'Challenges'}
        </button>
      </div>

      {showChallenges && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-900">Challenges for {child.name}</h4>
            <button
              onClick={() => {
                setCreateForm({
                  childId: child.id,
                  title: '',
                  description: '',
                  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                  rewardType: 'bonus_points',
                  rewardPoints: 10,
                  rewardDescription: '',
                  targetNumber: undefined,
                  targetUnit: '',
                });
                setShowCreateChallenge(true);
              }}
              className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700"
            >
              Create challenge
            </button>
          </div>
          {challenges.length === 0 ? (
            <p className="text-sm text-gray-500">No challenges. Create one to set a goal.</p>
          ) : (
            <ul className="space-y-2">
              {challenges.map((c) => (
                <li
                  key={c.id}
                  className={`p-2 rounded border text-sm ${
                    c.status === 'active' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{c.title}</span>
                    <span className="text-xs text-gray-500">
                      Due {new Date(c.deadline).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                      {c.status}
                    </span>
                    {c.reward_type === 'bonus_points' && c.reward_points != null && (
                      <span className="text-xs text-gray-600">+{c.reward_points} pts</span>
                    )}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const full = await api.getChallenge(c.id);
                          setSelectedChallengeDetail(selectedChallengeDetail?.id === c.id ? null : full);
                        } catch (err) {
                          console.error('Failed to load challenge:', err);
                        }
                      }}
                      className="text-xs text-amber-700 hover:underline"
                    >
                      {selectedChallengeDetail?.id === c.id ? 'Hide detail' : 'View detail'}
                    </button>
                    {(c.status === 'active' || c.status === 'expired') && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.updateChallenge(c.id, { status: 'completed' });
                            const list = await api.getChallengesByChildId(child.id);
                            setChallenges(list);
                            setSelectedChallengeDetail(null);
                            onBalanceUpdate(child.id, await api.getChildBalance(child.id));
                          } catch (err) {
                            console.error('Failed to mark complete:', err);
                          }
                        }}
                        className="text-xs text-green-700 hover:underline"
                      >
                        Mark complete
                      </button>
                    )}
                  </div>
                  {selectedChallengeDetail?.id === c.id && selectedChallengeDetail && (
                    <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
                      {selectedChallengeDetail.description && <p>{selectedChallengeDetail.description}</p>}
                      {selectedChallengeDetail.progress.length > 0 && (
                        <p className="mt-1">Progress: {selectedChallengeDetail.progress.length} entries</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showCreateChallenge && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create challenge</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-0.5">Title</label>
                <input
                  type="text"
                  value={createForm.title ?? ''}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Read 5 books"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-0.5">Description (optional)</label>
                <input
                  type="text"
                  value={createForm.description ?? ''}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Details"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-0.5">Deadline</label>
                <input
                  type="date"
                  value={createForm.deadline ?? ''}
                  onChange={(e) => setCreateForm((f) => ({ ...f, deadline: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-0.5">Reward type</label>
                <select
                  value={createForm.rewardType ?? 'bonus_points'}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      rewardType: e.target.value as 'bonus_points' | 'custom',
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="bonus_points">Bonus points</option>
                  <option value="custom">Custom reward</option>
                </select>
              </div>
              {createForm.rewardType === 'bonus_points' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-0.5">Reward points</label>
                  <input
                    type="number"
                    min={0}
                    value={createForm.rewardPoints ?? 0}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, rewardPoints: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}
              {createForm.rewardType === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-0.5">Reward description</label>
                  <input
                    type="text"
                    value={createForm.rewardDescription ?? ''}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rewardDescription: e.target.value }))}
                    placeholder="e.g. Ice cream trip"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-0.5">Target number (optional)</label>
                <input
                  type="number"
                  min={0}
                  value={createForm.targetNumber ?? ''}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      targetNumber: e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                    }))
                  }
                  placeholder="e.g. 5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-0.5">Target unit (optional)</label>
                <input
                  type="text"
                  value={createForm.targetUnit ?? ''}
                  onChange={(e) => setCreateForm((f) => ({ ...f, targetUnit: e.target.value }))}
                  placeholder="e.g. books"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowCreateChallenge(false)}
                className="px-3 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const childId = createForm.childId ?? child.id;
                  const title = (createForm.title ?? '').trim();
                  const deadline = createForm.deadline ?? '';
                  const rewardType = createForm.rewardType ?? 'bonus_points';
                  if (!title || !deadline) return;
                  if (rewardType === 'bonus_points' && (createForm.rewardPoints == null || createForm.rewardPoints < 0))
                    return;
                  try {
                    await api.createChallenge({
                      childId,
                      title,
                      description: (createForm.description ?? '').trim() || undefined,
                      deadline,
                      rewardType,
                      rewardPoints: rewardType === 'bonus_points' ? (createForm.rewardPoints ?? 0) : undefined,
                      rewardDescription:
                        rewardType === 'custom' ? (createForm.rewardDescription ?? '').trim() || undefined : undefined,
                      targetNumber: createForm.targetNumber ?? undefined,
                      targetUnit: (createForm.targetUnit ?? '').trim() || undefined,
                    });
                    const list = await api.getChallengesByChildId(child.id);
                    setChallenges(list);
                    setShowCreateChallenge(false);
                  } catch (err) {
                    console.error('Failed to create challenge:', err);
                  }
                }}
                className="px-3 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showPointLog && (
        <PointLog
          childId={child.id}
          childName={child.name}
          onClose={() => setShowPointLog(false)}
        />
      )}

      {showWorkLog && (
        <WorkLogModal
          childId={child.id}
          childName={child.name}
          onClose={() => setShowWorkLog(false)}
        />
      )}

      {showUndoConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Undo</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to undo the last action? This will remove the most recent point and its associated Bitcoin conversion.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowUndoConfirm(false)}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUndo}
                disabled={isLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Undoing...' : 'Confirm Undo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

