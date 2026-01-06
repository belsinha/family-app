import type { Child, Point, User, AddPointsRequest, ChildBalance, ApiError, ChangePasswordRequest, ChangePasswordResponse, BitcoinConversion, ConvertBonusRequest, ConvertBonusResponse, ChildBitcoinBalance } from '../../../shared/src/types';

// Automatically detect API URL based on current hostname for local network access
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Use current hostname and port 3001 for backend
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:3001/api`;
};

const API_BASE_URL = getApiBaseUrl();

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = localStorage.getItem('authToken');
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred');
  }
}

export const api = {
  // Users
  getUsers: (): Promise<User[]> => request<User[]>('/users'),
  getUserById: (id: number): Promise<User> => request<User>(`/users/${id}`),

  // Children
  getChildren: (): Promise<Child[]> => request<Child[]>('/children'),
  getChildById: (id: number): Promise<Child> => request<Child>(`/children/${id}`),

  // Points
  addPoints: (data: AddPointsRequest): Promise<Point> =>
    request<Point>('/points', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getPointsByChildId: (childId: number): Promise<Point[]> =>
    request<Point[]>(`/points/child/${childId}`),
  getPointsByChildIdLast7Days: (childId: number): Promise<Point[]> =>
    request<Point[]>(`/points/child/${childId}/last-7-days`),
  getChildBalance: (childId: number): Promise<ChildBalance> =>
    request<ChildBalance>(`/points/child/${childId}/balance`),
  getMostRecentPoint: (childId: number): Promise<Point> =>
    request<Point>(`/points/child/${childId}/most-recent`),
  deletePoint: (pointId: number): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`/points/${pointId}`, {
      method: 'DELETE',
    }),

  // Auth
  changePassword: (data: ChangePasswordRequest): Promise<ChangePasswordResponse> =>
    request<ChangePasswordResponse>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Bitcoin
  getBitcoinPrice: (): Promise<{ price_usd: number; fetched_at: string }> =>
    request<{ price_usd: number; fetched_at: string }>('/bitcoin/price'),
  refreshBitcoinPrice: (): Promise<{ price_usd: number; fetched_at: string }> =>
    request<{ price_usd: number; fetched_at: string }>('/bitcoin/price/refresh'),
  getBitcoinBalance: (childId: number): Promise<ChildBitcoinBalance> =>
    request<ChildBitcoinBalance>(`/bitcoin/balance/${childId}`),
  getBitcoinConversions: (childId: number): Promise<BitcoinConversion[]> =>
    request<BitcoinConversion[]>(`/bitcoin/conversions/${childId}`),
  convertBonusToBitcoin: (data: ConvertBonusRequest): Promise<ConvertBonusResponse> =>
    request<ConvertBonusResponse>('/bitcoin/convert', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};


