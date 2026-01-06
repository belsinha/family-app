import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import type { ChildBalance, ConvertBonusResponse } from '../../../shared/src/types';

interface BitcoinConversionProps {
  childId: number;
  childName: string;
  balance: ChildBalance;
  onConversionComplete?: () => void;
}

const SATOSHIS_PER_BONUS_POINT = 5_000;
const SATOSHIS_PER_BTC = 100_000_000;

export default function BitcoinConversion({ 
  childId, 
  childName, 
  balance,
  onConversionComplete 
}: BitcoinConversionProps) {
  const { user } = useAuth();
  const [bonusPoints, setBonusPoints] = useState<number>(0);
  const [priceData, setPriceData] = useState<{ price_usd: number; fetched_at: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConvertBonusResponse | null>(null);

  const isParent = user?.role === 'parent';

  useEffect(() => {
    const loadPrice = async () => {
      try {
        setIsLoadingPrice(true);
        const data = await api.getBitcoinPrice();
        setPriceData(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load Bitcoin price';
        setError(message);
      } finally {
        setIsLoadingPrice(false);
      }
    };

    loadPrice();
  }, []);

  const calculatePreview = (points: number) => {
    if (!priceData || points <= 0) {
      return null;
    }

    const satoshis = points * SATOSHIS_PER_BONUS_POINT;
    const btcAmount = satoshis / SATOSHIS_PER_BTC;
    const usdValue = btcAmount * priceData.price_usd;

    return {
      satoshis,
      btcAmount,
      usdValue,
    };
  };

  const preview = calculatePreview(bonusPoints);

  const handleConvert = async () => {
    if (bonusPoints <= 0) {
      setError('Please enter a valid number of bonus points');
      return;
    }

    if (bonusPoints > balance.bonus) {
      setError(`Insufficient bonus points. Available: ${balance.bonus}`);
      return;
    }

    if (!priceData) {
      setError('Bitcoin price unavailable. Conversion disabled.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setConversionResult(null);

    try {
      const result = await api.convertBonusToBitcoin({
        childId,
        bonusPoints,
      });
      
      setConversionResult(result);
      setSuccess(`Successfully converted ${bonusPoints} bonus points to Bitcoin!`);
      setBonusPoints(0);
      
      if (onConversionComplete) {
        onConversionComplete();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to convert bonus points';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isParent) {
    return null;
  }

  if (isLoadingPrice) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="text-sm text-gray-500">Loading Bitcoin price...</div>
      </div>
    );
  }

  if (!priceData) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-red-200 bg-red-50">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Convert Bonus to Bitcoin</h3>
        <div className="text-sm text-red-600">
          Bitcoin price unavailable. Conversion disabled.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Convert Bonus to Bitcoin</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Child: {childName}
          </label>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Available Bonus Points: {balance.bonus}
          </label>
        </div>

        <div>
          <label htmlFor="bonusPoints" className="block text-sm font-medium text-gray-700 mb-1">
            Bonus Points to Convert
          </label>
          <input
            id="bonusPoints"
            type="number"
            min="1"
            max={balance.bonus}
            value={bonusPoints || ''}
            onChange={(e) => setBonusPoints(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter bonus points"
          />
        </div>

        {preview && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="text-sm font-semibold text-gray-700 mb-2">Conversion Preview</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Satoshis:</span>
                <span className="font-medium text-gray-900">
                  {preview.satoshis.toLocaleString('en-US')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BTC Amount:</span>
                <span className="font-medium text-gray-900">
                  {preview.btcAmount.toFixed(8)} BTC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">USD Value:</span>
                <span className="font-medium text-gray-900">
                  ${preview.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                <span>Price Used:</span>
                <span>${priceData.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Price Timestamp:</span>
                <span>{new Date(priceData.fetched_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="text-sm text-red-600">{error}</div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <div className="text-sm text-green-600">{success}</div>
          </div>
        )}

        {conversionResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="text-sm font-semibold text-blue-900 mb-2">Conversion Complete</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">Bonus Points Converted:</span>
                <span className="font-medium text-blue-900">{conversionResult.bonusPointsConverted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Satoshis Awarded:</span>
                <span className="font-medium text-blue-900">
                  {conversionResult.satoshis.toLocaleString('en-US')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">BTC Equivalent:</span>
                <span className="font-medium text-blue-900">
                  {conversionResult.btcAmount.toFixed(8)} BTC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">USD Value:</span>
                <span className="font-medium text-blue-900">
                  ${conversionResult.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleConvert}
          disabled={isLoading || bonusPoints <= 0 || bonusPoints > balance.bonus}
          className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Converting...' : 'Convert to Bitcoin'}
        </button>
      </div>
    </div>
  );
}

