import { getSupabaseClient } from '../supabase.js';
import type { Challenge, ChallengeProgressEntry, ChallengeStatus } from '../../types.js';

const today = () => new Date().toISOString().split('T')[0];

function mapChallenge(row: any): Challenge {
  return {
    id: row.id,
    child_id: row.child_id,
    title: row.title,
    description: row.description ?? null,
    deadline: row.deadline,
    reward_type: row.reward_type,
    reward_points: row.reward_points ?? null,
    reward_description: row.reward_description ?? null,
    target_number: row.target_number ?? null,
    target_unit: row.target_unit ?? null,
    status: row.status,
    rewarded_at: row.rewarded_at ?? null,
    created_at: row.created_at,
    created_by: row.created_by ?? null,
  };
}

function mapProgressEntry(row: any): ChallengeProgressEntry {
  return {
    id: row.id,
    challenge_id: row.challenge_id,
    note: row.note,
    amount: row.amount ?? null,
    logged_at: row.logged_at,
    created_by: row.created_by ?? null,
  };
}

export async function createChallenge(params: {
  child_id: number;
  title: string;
  description?: string | null;
  deadline: string;
  reward_type: 'bonus_points' | 'custom';
  reward_points?: number | null;
  reward_description?: string | null;
  target_number?: number | null;
  target_unit?: string | null;
  created_by: number | null;
}): Promise<Challenge> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      child_id: params.child_id,
      title: params.title,
      description: params.description ?? null,
      deadline: params.deadline,
      reward_type: params.reward_type,
      reward_points: params.reward_points ?? null,
      reward_description: params.reward_description ?? null,
      target_number: params.target_number ?? null,
      target_unit: params.target_unit ?? null,
      status: 'active',
      created_by: params.created_by,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create challenge: ${error.message}`);
  return mapChallenge(data);
}

export async function getChallengesByChildId(childId: number): Promise<Challenge[]> {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('child_id', childId)
    .order('deadline', { ascending: true });

  if (error) throw new Error(`Failed to fetch challenges: ${error.message}`);

  const challenges = (rows || []).map(mapChallenge);
  const t = today();

  for (const c of challenges) {
    if (c.status === 'active' && c.deadline < t) {
      await supabase.from('challenges').update({ status: 'expired' }).eq('id', c.id);
      c.status = 'expired';
    }
  }

  return challenges;
}

export async function getChallengeById(id: number): Promise<Challenge | null> {
  const supabase = getSupabaseClient();
  const { data: row, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch challenge: ${error.message}`);
  }

  if (!row) return null;

  const challenge = mapChallenge(row);
  const t = today();
  if (challenge.status === 'active' && challenge.deadline < t) {
    await supabase.from('challenges').update({ status: 'expired' }).eq('id', id);
    challenge.status = 'expired';
  }
  return challenge;
}

export async function updateChallenge(
  id: number,
  updates: Partial<{
    title: string;
    description: string | null;
    deadline: string;
    reward_type: 'bonus_points' | 'custom';
    reward_points: number | null;
    reward_description: string | null;
    target_number: number | null;
    target_unit: string | null;
    status: ChallengeStatus;
    rewarded_at: string | null;
  }>
): Promise<Challenge> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('challenges')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update challenge: ${error.message}`);
  return mapChallenge(data);
}

export async function getProgressByChallengeId(challengeId: number): Promise<ChallengeProgressEntry[]> {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('challenge_progress')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('logged_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch challenge progress: ${error.message}`);
  return (rows || []).map(mapProgressEntry);
}

export async function addProgressEntry(params: {
  challenge_id: number;
  note: string;
  amount?: number | null;
  created_by: number | null;
}): Promise<ChallengeProgressEntry> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('challenge_progress')
    .insert({
      challenge_id: params.challenge_id,
      note: params.note,
      amount: params.amount ?? null,
      created_by: params.created_by,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add progress entry: ${error.message}`);
  return mapProgressEntry(data);
}
