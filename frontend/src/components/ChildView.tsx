import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import type { Child, ChildBalance, Point, ChildBitcoinBalance } from '../../../shared/src/types';
import BitcoinPrice from './BitcoinPrice';
import BitcoinConversionHistory from './BitcoinConversionHistory';

export default function ChildView() {
  const { user } = useAuth();
  const [child, setChild] = useState<Child | null>(null);
  const [balance, setBalance] = useState<ChildBalance | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [bitcoinBalance, setBitcoinBalance] = useState<ChildBitcoinBalance | null>(null);
  const [bitcoinPrice, setBitcoinPrice] = useState<{ price_usd: number; fetched_at: string } | null>(null);
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

        // Load balance, points, and Bitcoin data
        const [balanceData, pointsData, bitcoinData, priceData] = await Promise.all([
          api.getChildBalance(childRecord.id),
          api.getPointsByChildIdLast7Days(childRecord.id),
          api.getBitcoinBalance(childRecord.id).catch(() => null),
          api.getBitcoinPrice().catch(() => null),
        ]);

        setBalance(balanceData);
        setPoints(pointsData);
        setBitcoinBalance(bitcoinData);
        setBitcoinPrice(priceData);
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

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Recent Points</h3>
        <p className="text-sm text-gray-500 mb-4">Last 7 days</p>
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

      <BitcoinConversionHistory childId={child.id} childName={child.name} />
    </div>
  );
}

