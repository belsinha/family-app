import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { BitcoinConversion } from '../../../shared/src/types';

interface BitcoinConversionHistoryProps {
  childId: number;
  childName: string;
  onClose?: () => void;
}

export default function BitcoinConversionHistory({ 
  childId, 
  childName,
  onClose 
}: BitcoinConversionHistoryProps) {
  const [conversions, setConversions] = useState<BitcoinConversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConversions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getBitcoinConversions(childId);
        setConversions(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load conversion history';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadConversions();
  }, [childId]);

  const totalSatoshis = conversions.reduce((sum, conv) => sum + conv.satoshis, 0);
  const totalBtc = totalSatoshis / 100_000_000;
  const totalBonusPoints = conversions.reduce((sum, conv) => sum + conv.bonus_points_converted, 0);

  if (onClose) {
    // Modal version
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              Bitcoin Conversion History - {childName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>
          
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading conversion history...</div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-sm text-red-600">{error}</div>
              </div>
            ) : conversions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No conversions yet. Convert bonus points to Bitcoin to see history here.
              </div>
            ) : (
              <>
                <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-sm font-semibold text-gray-700 mb-2">Total Summary</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Total Conversions</div>
                      <div className="font-bold text-gray-900">{conversions.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Bonus Points</div>
                      <div className="font-bold text-gray-900">{totalBonusPoints.toLocaleString('en-US')}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Satoshis</div>
                      <div className="font-bold text-gray-900">{totalSatoshis.toLocaleString('en-US')}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total BTC</div>
                      <div className="font-bold text-gray-900">{totalBtc.toFixed(8)} BTC</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {conversions.map((conversion) => (
                    <div
                      key={conversion.id}
                      className="bg-blue-50 border border-blue-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-blue-900 mb-1">
                            Conversion #{conversion.id}
                          </div>
                          <div className="text-xs text-blue-700">
                            {new Date(conversion.created_at).toLocaleString()}
                          </div>
                        </div>
                        {conversion.parent_name && (
                          <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                            By: {conversion.parent_name}
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                        <div>
                          <div className="text-blue-700 font-medium">Bonus Points</div>
                          <div className="text-blue-900 font-bold">
                            {conversion.bonus_points_converted.toLocaleString('en-US')}
                          </div>
                        </div>
                        <div>
                          <div className="text-blue-700 font-medium">Satoshis</div>
                          <div className="text-blue-900 font-bold">
                            {conversion.satoshis.toLocaleString('en-US')}
                          </div>
                        </div>
                        <div>
                          <div className="text-blue-700 font-medium">BTC Amount</div>
                          <div className="text-blue-900 font-bold">
                            {Number(conversion.btc_amount).toFixed(8)} BTC
                          </div>
                        </div>
                        <div>
                          <div className="text-blue-700 font-medium">USD Value</div>
                          <div className="text-blue-900 font-bold">
                            ${Number(conversion.usd_value).toLocaleString('en-US', { 
                              minimumFractionDigits: 2, 
                              maximumFractionDigits: 2 
                            })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-600">
                        <div>Price Used: ${Number(conversion.price_usd).toLocaleString('en-US', { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        })}</div>
                        <div>Price Timestamp: {new Date(conversion.price_timestamp).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Inline version
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        Bitcoin Conversion History - {childName}
      </h3>
      
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading conversion history...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      ) : conversions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No conversions yet. Convert bonus points to Bitcoin to see history here.
        </div>
      ) : (
        <>
          <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="text-sm font-semibold text-gray-700 mb-2">Total Summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Total Conversions</div>
                <div className="font-bold text-gray-900">{conversions.length}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Bonus Points</div>
                <div className="font-bold text-gray-900">{totalBonusPoints.toLocaleString('en-US')}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Satoshis</div>
                <div className="font-bold text-gray-900">{totalSatoshis.toLocaleString('en-US')}</div>
              </div>
              <div>
                <div className="text-gray-600">Total BTC</div>
                <div className="font-bold text-gray-900">{totalBtc.toFixed(8)} BTC</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {conversions.map((conversion) => (
              <div
                key={conversion.id}
                className="bg-blue-50 border border-blue-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-blue-900 mb-1">
                      Conversion #{conversion.id}
                    </div>
                    <div className="text-xs text-blue-700">
                      {new Date(conversion.created_at).toLocaleString()}
                    </div>
                  </div>
                  {conversion.parent_name && (
                    <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                      By: {conversion.parent_name}
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                  <div>
                    <div className="text-blue-700 font-medium">Bonus Points</div>
                    <div className="text-blue-900 font-bold">
                      {conversion.bonus_points_converted.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-700 font-medium">Satoshis</div>
                    <div className="text-blue-900 font-bold">
                      {conversion.satoshis.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-700 font-medium">BTC Amount</div>
                    <div className="text-blue-900 font-bold">
                      {Number(conversion.btc_amount).toFixed(8)} BTC
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-700 font-medium">USD Value</div>
                    <div className="text-blue-900 font-bold">
                      ${Number(conversion.usd_value).toLocaleString('en-US', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-600">
                  <div>Price Used: ${Number(conversion.price_usd).toLocaleString('en-US', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}</div>
                  <div>Price Timestamp: {new Date(conversion.price_timestamp).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

