import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { Point } from '../../../shared/src/types';

interface PointLogProps {
  childId: number;
  childName: string;
  onClose: () => void;
}

type SortOption = 'recent' | 'kind';

export default function PointLog({ childId, childName, onClose }: PointLogProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  useEffect(() => {
    const loadPoints = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const pointsData = await api.getPointsByChildIdLast7Days(childId);
        setPoints(pointsData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load points';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadPoints();
  }, [childId]);

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
          <p className="text-sm text-gray-500 mt-2">Showing last 7 days</p>
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
              <p className="text-gray-600">No points recorded in the last 7 days.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedPoints.map((point) => (
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
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`font-semibold ${
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
                        <p className="text-sm text-gray-700 mt-1">{point.reason}</p>
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
                    <div className="text-sm text-gray-500 ml-4">
                      {new Date(point.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

