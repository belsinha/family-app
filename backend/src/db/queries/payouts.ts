import { getSupabaseClient } from '../supabase.js';
import type { ChildCreditPayout, PayoutType } from '../../types.js';

export async function createPayout(payout: {
  childId: number;
  type: PayoutType;
  satoshis: number;
  usdAmount?: number | null;
  note?: string | null;
  parentId: number;
  txid?: string | null;
}): Promise<ChildCreditPayout> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('child_credit_payouts')
    .insert({
      child_id: payout.childId,
      type: payout.type,
      satoshis: payout.satoshis,
      usd_amount: payout.usdAmount ?? null,
      note: payout.note ?? null,
      parent_id: payout.parentId,
      txid: payout.txid ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create payout: ${error?.message || 'Unknown'}`);
  }
  return data as ChildCreditPayout;
}

export async function getPayoutsByChildId(childId: number): Promise<ChildCreditPayout[]> {
  const supabase = getSupabaseClient();
  const { data: payouts, error } = await supabase
    .from('child_credit_payouts')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch payouts: ${error.message}`);
  }
  if (!payouts || payouts.length === 0) return [];

  // Resolve parent names
  const parentIds = [...new Set(payouts.map((p: any) => p.parent_id).filter(Boolean))];
  const parentNames: Record<number, string> = {};
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('users')
      .select('id, name')
      .in('id', parentIds);
    if (parents) {
      for (const p of parents) parentNames[p.id] = p.name;
    }
  }

  return payouts.map((row: any) => ({
    ...row,
    parent_name: row.parent_id ? parentNames[row.parent_id] ?? null : null,
  })) as ChildCreditPayout[];
}

export async function getTotalWithdrawnSatoshis(childId: number): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('child_credit_payouts')
    .select('satoshis')
    .eq('child_id', childId);

  if (error) {
    throw new Error(`Failed to sum withdrawn satoshis: ${error.message}`);
  }
  if (!data || data.length === 0) return 0;
  return data.reduce((sum: number, row: any) => sum + Number(row.satoshis), 0);
}
