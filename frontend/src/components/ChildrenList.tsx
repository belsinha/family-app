import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { Child, ChildBalance } from '../../../shared/src/types';
import ChildCard from './ChildCard';
import BitcoinPrice from './BitcoinPrice';
import { useAuth } from '../contexts/AuthContext';

export default function ChildrenList() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [balances, setBalances] = useState<Record<number, ChildBalance>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChildren = async () => {
    try {
      const childrenData = await api.getChildren();
      setChildren(childrenData);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load children';
      setError(message);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchChildren();
      setIsLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    const fetchBalances = async () => {
      if (children.length === 0) return;

      try {
        const balancePromises = children.map((child) =>
          api.getChildBalance(child.id).then((balance) => ({ childId: child.id, balance }))
        );
        const balanceResults = await Promise.all(balancePromises);
        
        const balancesMap: Record<number, ChildBalance> = {};
        balanceResults.forEach(({ childId, balance }) => {
          balancesMap[childId] = balance;
        });
        
        setBalances(balancesMap);
      } catch (err) {
        console.error('Failed to load balances:', err);
      }
    };

    if (children.length > 0) {
      fetchBalances();
    }
  }, [children]);

  const handleBalanceUpdate = (childId: number, newBalance: ChildBalance) => {
    setBalances((prev) => ({
      ...prev,
      [childId]: newBalance,
    }));
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading children...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <p className="text-red-800 font-semibold mb-2">Error loading children</p>
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={fetchChildren}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No children found.</p>
      </div>
    );
  }

  return (
    <div>
      {user?.role === 'parent' && (
        <div className="mb-6">
          <BitcoinPrice />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {children.map((child) => {
          const balance = balances[child.id] || {
            childId: child.id,
            bonus: 0,
            demerit: 0,
            balance: 0,
          };

          return (
            <ChildCard
              key={child.id}
              child={child}
              initialBalance={balance}
              onBalanceUpdate={handleBalanceUpdate}
            />
          );
        })}
      </div>
    </div>
  );
}

