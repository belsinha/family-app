export type Role = 'parent' | 'child' | 'family';
export type PointType = 'bonus' | 'demerit';

export interface House {
  id: number;
  name: string;
}

export interface User {
  id: number;
  name: string;
  role: Role;
  house_id: number | null;
  password_hash?: string;
}

export interface Child {
  id: number;
  name: string;
  user_id: number | null;
  house_id: number | null;
}

export interface Point {
  id: number;
  child_id: number;
  points: number;
  type: PointType;
  reason: string | null;
  created_at: string;
  parent_id: number | null;
  parent_name?: string | null;
}

export interface ChildBalance {
  childId: number;
  bonus: number;
  demerit: number;
  balance: number;
}

export interface ChildBitcoinBalance {
  childId: number;
  totalSatoshis: number;
  totalBtc: number;
  currentUsdValue: number;
  priceUsd: number;
}

// API Request/Response types
export interface AddPointsRequest {
  childId: number;
  points: number;
  type: PointType;
  reason?: string;
  description?: string;
  anonymous?: boolean;
}

export interface ApiError {
  error: string;
  message?: string;
}

export interface LoginRequest {
  name: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'password_hash'>;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

// Bitcoin types
export interface BitcoinPrice {
  id: number;
  price_usd: number;
  fetched_at: string;
  created_at: string;
}

export interface BitcoinConversion {
  id: number;
  child_id: number;
  point_id: number | null;
  bonus_points_converted: number;
  satoshis: number;
  btc_amount: number;
  usd_value: number;
  price_usd: number;
  price_timestamp: string;
  parent_id: number | null;
  parent_name?: string | null;
  created_at: string;
}

export interface ConvertBonusRequest {
  childId: number;
  bonusPoints: number;
}

export interface ConvertBonusResponse {
  conversion: BitcoinConversion;
  bonusPointsConverted: number;
  satoshis: number;
  btcAmount: number;
  usdValue: number;
  priceUsd: number;
  priceTimestamp: string;
}

// On-chain wallet types
export type PayoutType = 'onchain_settlement' | 'apple_cash_manual';
export type BitcoinNetwork = 'mainnet' | 'testnet';

export interface ChildOnchainWallet {
  id: number;
  child_id: number;
  derivation_index: number;
  receive_address: string;
  network: BitcoinNetwork;
  created_at: string;
  last_chain_sync_at: string | null;
}

export interface ChildCreditPayout {
  id: number;
  child_id: number;
  type: PayoutType;
  satoshis: number;
  usd_amount: number | null;
  note: string | null;
  parent_id: number | null;
  txid: string | null;
  created_at: string;
  parent_name?: string | null;
}

export interface OnchainBalanceResponse {
  childId: number;
  address: string;
  network: BitcoinNetwork;
  confirmedSat: number;
  unconfirmedSat: number;
}

export interface DepositUriResponse {
  childId: number;
  address: string;
  network: BitcoinNetwork;
  bitcoinUri: string;
}

export interface SettleCreditsRequest {
  childId: number;
  satoshis: number;
}

export interface SettleCreditsResponse {
  payout: ChildCreditPayout;
  txid: string;
}

export interface AppleCashPayoutRequest {
  childId: number;
  satoshis: number;
  usdAmount?: number;
  note?: string;
}

// Project types
export type ProjectStatus = 'active' | 'inactive';
export type WorkLogStatus = 'pending' | 'approved' | 'declined';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  bonus_rate: number;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectChildHours {
  project_id: number;
  child_id: number;
  child_name: string;
  total_hours: number;
}

export interface ProjectStatistics {
  project_id: number;
  child_hours: ProjectChildHours[];
  total_hours: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  bonusRate: number;
  status?: ProjectStatus;
}

export interface UpdateProjectRequest {
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  bonusRate: number;
  status: ProjectStatus;
}

// Work Log types
export interface WorkLog {
  id: number;
  child_id: number;
  project_id: number;
  hours: number;
  description: string;
  work_date: string;
  status: WorkLogStatus;
  created_at: string;
  project?: Project;
}

export interface AddWorkLogRequest {
  childId: number;
  projectId: number;
  hours: number;
  /** Optional; stored as empty string if omitted. */
  description?: string;
  workDate?: string;
}

export interface UpdateWorkLogRequest {
  hours: number;
  /** Optional; stored as empty string if omitted. */
  description?: string;
  workDate?: string;
}

export interface ApproveWorkLogRequest {
  workLogId: number;
  action: 'approve' | 'decline';
}


