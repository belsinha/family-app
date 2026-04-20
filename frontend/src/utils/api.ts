import type { Child, Point, User, AddPointsRequest, ChildBalance, ApiError, ChangePasswordRequest, ChangePasswordResponse, BitcoinConversion, ConvertBonusRequest, ConvertBonusResponse, ChildBitcoinBalance, WorkLog, AddWorkLogRequest, UpdateWorkLogRequest, Project, CreateProjectRequest, UpdateProjectRequest, ProjectStatistics, OnchainBalanceResponse, DepositUriResponse, ChildCreditPayout, SettleCreditsRequest, SettleCreditsResponse, AppleCashPayoutRequest } from '../../../shared/src/types';
import { getApiBaseUrl } from './getApiBaseUrl';

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
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const error: ApiError = await response.json();
        errorMessage = error.message || error.error || errorMessage;
      } catch (parseError) {
        // If response is not JSON, try to get text
        try {
          const text = await response.text();
          if (text) {
            errorMessage = text;
          }
        } catch {
          // Use default error message
        }
      }
      throw new Error(errorMessage);
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

  // On-chain Bitcoin Wallets
  getOnchainWallet: (childId: number): Promise<OnchainBalanceResponse> =>
    request<OnchainBalanceResponse>(`/bitcoin/onchain-wallet/${childId}`),
  getDepositUri: (childId: number, amountSat?: number): Promise<DepositUriResponse> => {
    const q = amountSat ? `?amountSat=${amountSat}` : '';
    return request<DepositUriResponse>(`/bitcoin/onchain-deposit-uri/${childId}${q}`);
  },
  settleCreditsOnchain: (data: SettleCreditsRequest): Promise<SettleCreditsResponse> =>
    request<SettleCreditsResponse>('/bitcoin/onchain/settle-credits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  payoutAppleCash: (data: AppleCashPayoutRequest): Promise<ChildCreditPayout> =>
    request<ChildCreditPayout>('/bitcoin/payout/apple-cash', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getPayouts: (childId: number): Promise<ChildCreditPayout[]> =>
    request<ChildCreditPayout[]>(`/bitcoin/payouts/${childId}`),
  getAvailableCredits: (childId: number): Promise<{ childId: number; notionalSat: number; withdrawnSat: number; availableSat: number }> =>
    request<{ childId: number; notionalSat: number; withdrawnSat: number; availableSat: number }>(`/bitcoin/available-credits/${childId}`),

  // Work Logs
  addWorkLog: (data: AddWorkLogRequest): Promise<WorkLog> =>
    request<WorkLog>('/work-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getWorkLogsByChildId: (childId: number): Promise<WorkLog[]> =>
    request<WorkLog[]>(`/work-logs/child/${childId}`),
  updateWorkLog: (workLogId: number, data: UpdateWorkLogRequest): Promise<WorkLog> =>
    request<WorkLog>(`/work-logs/${workLogId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getPendingWorkLogs: (): Promise<WorkLog[]> =>
    request<WorkLog[]>('/work-logs/pending'),
  approveWorkLog: (workLogId: number, action: 'approve' | 'decline'): Promise<WorkLog> =>
    request<WorkLog>(`/work-logs/${workLogId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  // Projects
  getProjects: (): Promise<Project[]> =>
    request<Project[]>('/projects'),
  getActiveProjects: (): Promise<Project[]> =>
    request<Project[]>('/projects/active'),
  getProjectById: (projectId: number): Promise<Project> =>
    request<Project>(`/projects/${projectId}`),
  getProjectStatistics: (): Promise<{ [projectId: number]: ProjectStatistics }> =>
    request<{ [projectId: number]: ProjectStatistics }>('/projects/statistics'),
  createProject: (data: CreateProjectRequest): Promise<Project> =>
    request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProject: (projectId: number, data: UpdateProjectRequest): Promise<Project> =>
    request<Project>(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProject: (projectId: number): Promise<{ message: string }> =>
    request<{ message: string }>(`/projects/${projectId}`, {
      method: 'DELETE',
    }),

  // Chores (Casa Organizada)
  getHouseholdMembers: (): Promise<ChoreHouseholdMember[]> =>
    request<ChoreHouseholdMember[]>('/household-members'),
  getTasksToday: (params: { date?: string; userId?: number }): Promise<ChoreTaskInstance[]> => {
    const q = new URLSearchParams();
    if (params.date) q.set('date', params.date);
    if (params.userId != null) q.set('userId', String(params.userId));
    return request<ChoreTaskInstance[]>(`/tasks/today?${q}`);
  },
  completeTask: (instanceId: number, doneWithoutReminder: boolean): Promise<ChoreTaskInstance> =>
    request<ChoreTaskInstance>(`/tasks/${instanceId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ doneWithoutReminder }),
    }),
  missTask: (instanceId: number): Promise<ChoreTaskInstance> =>
    request<ChoreTaskInstance>(`/tasks/${instanceId}/miss`, {
      method: 'POST',
    }),
  getWeeklySummary: (weekStart: string): Promise<ChoreWeeklySummary> =>
    request<ChoreWeeklySummary>(`/weekly-summary?weekStart=${weekStart}`),

  getAllowanceMonthlyPreview: (yearMonth: string): Promise<AllowanceMonthlyPreviewResponse> =>
    request<AllowanceMonthlyPreviewResponse>(`/allowance/monthly/${encodeURIComponent(yearMonth)}/preview`),
  getAllowanceMonthlyLines: (yearMonth: string): Promise<AllowanceMonthlyLinesResponse> =>
    request<AllowanceMonthlyLinesResponse>(`/allowance/monthly/${encodeURIComponent(yearMonth)}/lines`),
  submitAllowanceMonthlyForApproval: (yearMonth: string): Promise<AllowanceSubmitResponse> =>
    request<AllowanceSubmitResponse>(`/allowance/monthly/${encodeURIComponent(yearMonth)}/submit-for-approval`, {
      method: 'POST',
    }),
  approveAllowanceLine: (lineId: number): Promise<MonthlyAllowanceLine> =>
    request<MonthlyAllowanceLine>(`/allowance/lines/${lineId}/approve`, { method: 'POST' }),
  rejectAllowanceLine: (lineId: number, reason?: string): Promise<MonthlyAllowanceLine> =>
    request<MonthlyAllowanceLine>(`/allowance/lines/${lineId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  getTemplates: (): Promise<ChoreTemplate[]> =>
    request<ChoreTemplate[]>('/templates'),
  updateTemplate: (id: number, data: Partial<ChoreTemplate>, editorUserId: number): Promise<ChoreTemplate> =>
    request<ChoreTemplate>(`/templates/${id}`, {
      method: 'PUT',
      headers: { 'X-Editor-User-Id': String(editorUserId) },
      body: JSON.stringify(data),
    }),
  createTemplate: (
    data: Omit<ChoreTemplate, 'id' | 'assignedTo'>,
    editorUserId: number
  ): Promise<ChoreTemplate> =>
    request<ChoreTemplate>('/templates', {
      method: 'POST',
      headers: { 'X-Editor-User-Id': String(editorUserId) },
      body: JSON.stringify(data),
    }),
  deleteTemplate: (id: number, editorUserId: number): Promise<void> =>
    request<void>(`/templates/${id}`, {
      method: 'DELETE',
      headers: { 'X-Editor-User-Id': String(editorUserId) },
    }),

  // Challenges
  getChallengesByChildId: (childId: number): Promise<Challenge[]> =>
    request<Challenge[]>(`/challenges/child/${childId}`),
  createChallenge: (data: CreateChallengeRequest): Promise<Challenge> =>
    request<Challenge>('/challenges', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getChallenge: (id: number): Promise<ChallengeWithProgress> =>
    request<ChallengeWithProgress>(`/challenges/${id}`),
  updateChallenge: (id: number, data: Partial<UpdateChallengeRequest>): Promise<Challenge> =>
    request<Challenge>(`/challenges/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getChallengeProgress: (id: number): Promise<ChallengeProgressEntry[]> =>
    request<ChallengeProgressEntry[]>(`/challenges/${id}/progress`),
  addChallengeProgress: (id: number, data: { note: string; amount?: number | null }): Promise<ChallengeProgressEntry> =>
    request<ChallengeProgressEntry>(`/challenges/${id}/progress`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export interface ChoreHouseholdMember {
  id: number;
  name: string;
  canEditChores: boolean;
}

export interface ChoreTemplate {
  id: number;
  name: string;
  category: string;
  assignedToId: number;
  assignedTo: ChoreHouseholdMember;
  frequencyType: string;
  dayOfWeek: number | null;
  weekOfMonth: number | null;
  dayOfMonth: number | null;
  semiannualMonths: string | null;
  conditionalDayOfWeek: number | null;
  conditionalAfterTime: string | null;
  timeBlock: string;
  pointsBase: number;
  active: boolean;
}

export interface ChoreTaskInstance {
  id: number;
  templateId: number;
  template: ChoreTemplate;
  assignedToId: number;
  assignedTo: ChoreHouseholdMember;
  taskDate: string;
  status: string;
  doneAt: string | null;
  doneWithoutReminder: boolean;
  notes: string | null;
  complaintLogged: boolean;
  isExtra: boolean;
  availableAfter: string | null;
}

export interface ChoreWeeklySummary {
  weekStart: string;
  weekEnd: string;
  byUser: Array<{
    member: ChoreHouseholdMember;
    totalPoints: number;
    classification: 'green' | 'yellow' | 'red';
    instances: ChoreTaskInstance[];
    missed: ChoreTaskInstance[];
  }>;
}

export type MonthlyAllowanceStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface MonthlyAllowanceBreakdown {
  householdMemberId: number;
  memberName: string;
  baseCents: number;
  requiredChoreCount: number;
  completedChoreCount: number;
  pendingChoreCount: number;
  missedChoreCount: number;
  proposedCents: number;
}

export interface MonthlyAllowanceLine {
  id: number;
  yearMonth: string;
  householdMemberId: number;
  householdMember: ChoreHouseholdMember;
  baseCents: number;
  requiredChoreCount: number;
  completedChoreCount: number;
  pendingChoreCount: number;
  missedChoreCount: number;
  proposedCents: number;
  status: MonthlyAllowanceStatus;
  submittedAt: string;
  decidedAt: string | null;
  approverUserId: number | null;
  rejectionReason: string | null;
  skipped?: boolean;
}

export interface AllowanceMonthlyPreviewResponse {
  yearMonth: string;
  breakdown: MonthlyAllowanceBreakdown[];
}

export interface AllowanceMonthlyLinesResponse {
  yearMonth: string;
  lines: MonthlyAllowanceLine[];
}

export interface AllowanceSubmitResponse {
  yearMonth: string;
  lines: MonthlyAllowanceLine[];
}

// Challenges (API returns snake_case)
export type ChallengeStatus = 'active' | 'completed' | 'failed' | 'expired';
export type ChallengeRewardType = 'bonus_points' | 'custom';

export interface Challenge {
  id: number;
  child_id: number;
  title: string;
  description: string | null;
  deadline: string;
  reward_type: ChallengeRewardType;
  reward_points: number | null;
  reward_description: string | null;
  target_number: number | null;
  target_unit: string | null;
  status: ChallengeStatus;
  rewarded_at: string | null;
  created_at: string;
  created_by: number | null;
}

export interface ChallengeProgressEntry {
  id: number;
  challenge_id: number;
  note: string;
  amount: number | null;
  logged_at: string;
  created_by: number | null;
}

export interface ChallengeWithProgress extends Challenge {
  progress: ChallengeProgressEntry[];
}

export interface CreateChallengeRequest {
  childId: number;
  title: string;
  description?: string | null;
  deadline: string;
  rewardType: ChallengeRewardType;
  rewardPoints?: number | null;
  rewardDescription?: string | null;
  targetNumber?: number | null;
  targetUnit?: string | null;
}

export interface UpdateChallengeRequest {
  title?: string;
  description?: string | null;
  deadline?: string;
  rewardType?: ChallengeRewardType;
  rewardPoints?: number | null;
  rewardDescription?: string | null;
  targetNumber?: number | null;
  targetUnit?: string | null;
  status?: ChallengeStatus;
}


