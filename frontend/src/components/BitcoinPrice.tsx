import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface BitcoinPriceData {
  price_usd: number;
  fetched_at: string;
}

export default function BitcoinPrice() {
  const { user } = useAuth();
  const [priceData, setPriceData] = useState<BitcoinPriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  const isParent = user?.role === 'parent';

  const loadPrice = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getBitcoinPrice();
      setPriceData(data);
      
      // Check if price is stale (older than 30 minutes)
      const fetchedAt = new Date(data.fetched_at);
      const now = new Date();
      const minutesSinceFetch = (now.getTime() - fetchedAt.getTime()) / (1000 * 60);
      setIsStale(minutesSinceFetch > 30);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Bitcoin price';
      setError(message);
      setPriceData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!isParent) return;
    
    try {
      setIsRefreshing(true);
      setError(null);
      const data = await api.refreshBitcoinPrice();
      setPriceData(data);
      setIsStale(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh Bitcoin price';
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadPrice();
    
    // Refresh price every 5 minutes
    const interval = setInterval(loadPrice, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !priceData) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <div className="text-sm text-gray-500">Loading Bitcoin price...</div>
      </div>
    );
  }

  if (error && !priceData) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 border border-red-200 bg-red-50">
        <div className="text-sm text-red-600">
          {error === 'Bitcoin price not available' 
            ? 'Bitcoin price unavailable. Conversion disabled.'
            : `Error: ${error}`}
        </div>
      </div>
    );
  }

  if (!priceData) {
    return null;
  }

  const fetchedAt = new Date(priceData.fetched_at);
  const formattedDate = fetchedAt.toLocaleString();

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-700 mb-1">Bitcoin Price</div>
          <div className="text-2xl font-bold text-gray-900">
            ${priceData.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Updated: {formattedDate}
          </div>
          {isStale && (
            <div className="text-xs text-yellow-600 mt-1 font-medium">
              ⚠️ Using last known Bitcoin price
            </div>
          )}
        </div>
        {isParent && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
}

