import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { Point, BitcoinConversion } from '../../../shared/src/types';

interface PointLogProps {
  childId: number;
  childName: string;
  onClose: () => void;
}

type SortOption = 'recent' | 'kind';

export default function PointLog({ childId, childName, onClose }: PointLogProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [conversions, setConversions] = useState<BitcoinConversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Load all points (not just last 7 days) to match with all conversions
        const [pointsData, conversionsData] = await Promise.all([
          api.getPointsByChildId(childId),
          api.getBitcoinConversions(childId).catch((err) => {
            console.warn('Failed to load Bitcoin conversions:', err);
            return [] as BitcoinConversion[];
          }),
        ]);
        setPoints(pointsData);
        setConversions(conversionsData);
        
        // Debug logging
        console.log('=== Point Log Data Loaded ===');
        console.log('Points loaded:', pointsData.length);
        console.log('Conversions loaded:', conversionsData.length);
        if (pointsData.length > 0) {
          console.log('Sample point:', {
            id: pointsData[0].id,
            id_type: typeof pointsData[0].id,
            type: pointsData[0].type,
            points: pointsData[0].points,
          });
        }
        if (conversionsData.length > 0) {
          console.log('Sample conversion:', {
            id: conversionsData[0].id,
            point_id: conversionsData[0].point_id,
            point_id_type: typeof conversionsData[0].point_id,
            satoshis: conversionsData[0].satoshis,
          });
          console.log('All conversion point_ids:', conversionsData.map(c => ({
            conv_id: c.id,
            point_id: c.point_id,
            point_id_type: typeof c.point_id
          })));
        }
        console.log('All point IDs:', pointsData.map(p => ({ id: p.id, id_type: typeof p.id })));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load points';
        setError(message);
        console.error('Error loading point log data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [childId]);

  // Create a map of point_id to conversion for quick lookup
  const conversionMap = new Map<number, BitcoinConversion>();
  const unmappedConversions: BitcoinConversion[] = [];
  
  conversions.forEach((conv) => {
    // Ensure point_id is a number (database might return it as string or number)
    const pointId = conv.point_id !== null && conv.point_id !== undefined 
      ? Number(conv.point_id) 
      : null;
    
    if (pointId && !isNaN(pointId) && pointId > 0) {
      conversionMap.set(pointId, conv);
    } else {
      // Track unmapped conversions for debugging
      unmappedConversions.push(conv);
      if (conv.point_id !== null && conv.point_id !== undefined) {
        console.warn('Conversion without valid point_id:', {
          conv_id: conv.id,
          point_id: conv.point_id,
          point_id_type: typeof conv.point_id,
          point_id_number: Number(conv.point_id),
          isNaN: isNaN(Number(conv.point_id))
        });
      }
    }
  });
  
  // Debug logging
  if (conversions.length > 0) {
    console.log('=== Conversion Mapping ===');
    console.log('Total conversions:', conversions.length);
    console.log('Conversions with point_id:', conversions.filter(c => c.point_id !== null).length);
    console.log('Successfully mapped:', conversionMap.size);
    console.log('Unmapped conversions:', unmappedConversions.length);
    if (unmappedConversions.length > 0) {
      console.warn('Unmapped conversions:', unmappedConversions.map(c => ({
        id: c.id,
        point_id: c.point_id,
        created_at: c.created_at
      })));
    }
    console.log('Conversion map keys (point_ids):', Array.from(conversionMap.keys()));
    console.log('Available point IDs:', points.map(p => p.id));
  }

  const sortedPoints = [...points].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else {
      // Sort by kind: bonus first, then demerit
      if (a.type !== b.type) {
        return a.type === 'bonus' ? -1 : 1;
      }
      // If same type, sort by most recent
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Point Log - {childName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('recent')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  sortBy === 'recent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Most Recent
              </button>
              <button
                onClick={() => setSortBy('kind')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  sortBy === 'kind'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                By Kind
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">All points with Bitcoin conversion history</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading points...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            </div>
          ) : sortedPoints.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No points recorded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedPoints.map((point) => {
                // Ensure point.id is a number for matching
                const pointId = Number(point.id);
                const conversion = conversionMap.get(pointId);
                
                // Debug matching for first few points
                if (sortedPoints.indexOf(point) < 3) {
                  console.log(`Matching point ${pointId} (type: ${typeof point.id}):`, {
                    found: !!conversion,
                    conversion_id: conversion?.id,
                    conversion_point_id: conversion?.point_id
                  });
                }
                
                return (
                  <div
                    key={point.id}
                    className={`p-4 rounded-lg border ${
                      point.type === 'bonus'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`font-semibold text-lg ${
                              point.type === 'bonus' ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
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
                          <p className="text-sm text-gray-700 mb-2">{point.reason}</p>
                        )}
                        
                        {/* Bitcoin conversion info integrated into the point entry */}
                        {conversion ? (
                          <div className={`mt-2 pt-2 border-t ${
                            point.type === 'bonus' ? 'border-green-300' : 'border-red-300'
                          }`}>
                            <div className="text-xs font-semibold text-gray-600 mb-2">Bitcoin Conversion</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Bonus Points:</span>
                                <span className={`font-medium ${
                                  conversion.bonus_points_converted >= 0 ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {conversion.bonus_points_converted > 0 ? '+' : ''}{conversion.bonus_points_converted}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Satoshis:</span>
                                <span className={`font-medium ${
                                  conversion.satoshis >= 0 ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {conversion.satoshis > 0 ? '+' : ''}{conversion.satoshis.toLocaleString('en-US')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">BTC Amount:</span>
                                <span className={`font-medium ${
                                  Number(conversion.btc_amount) >= 0 ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {Number(conversion.btc_amount) > 0 ? '+' : ''}{Number(conversion.btc_amount).toFixed(8)} BTC
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">USD Value:</span>
                                <span className={`font-medium ${
                                  Number(conversion.usd_value) >= 0 ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  ${Number(conversion.usd_value).toLocaleString('en-US', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                              <div className="flex justify-between">
                                <span>Price Used:</span>
                                <span className="font-medium text-gray-700">
                                  ${Number(conversion.price_usd).toLocaleString('en-US', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                  })}
                                </span>
                              </div>
                              <div className="flex justify-between mt-1">
                                <span>Price Timestamp:</span>
                                <span className="font-medium text-gray-700">
                                  {new Date(conversion.price_timestamp).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Show a message if point should have conversion but doesn't
                          <div className="mt-2 text-xs text-gray-400 italic">
                            No Bitcoin conversion recorded
                          </div>
                        )}
                        
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500">Given by:</span>
                          <span className={`text-sm font-semibold ${
                            point.parent_name 
                              ? 'text-blue-700 bg-blue-100 px-2 py-1 rounded' 
                              : 'text-gray-600 bg-gray-200 px-2 py-1 rounded'
                          }`}>
                            {point.parent_name || 'Anonymous'}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 ml-4 whitespace-nowrap">
                        {new Date(point.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

