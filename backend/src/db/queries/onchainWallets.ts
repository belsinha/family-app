import { getSupabaseClient } from '../supabase.js';
import type { ChildOnchainWallet } from '../../types.js';

export async function getWalletByChildId(childId: number): Promise<ChildOnchainWallet | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('child_onchain_wallets')
    .select('*')
    .eq('child_id', childId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch onchain wallet: ${error.message}`);
  }
  return data as ChildOnchainWallet | null;
}

export async function getNextDerivationIndex(): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('child_onchain_wallets')
    .select('derivation_index')
    .order('derivation_index', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return 0;
    throw new Error(`Failed to get max derivation index: ${error.message}`);
  }
  return (data?.derivation_index ?? -1) + 1;
}

export async function createWallet(wallet: {
  childId: number;
  derivationIndex: number;
  receiveAddress: string;
  network: string;
}): Promise<ChildOnchainWallet> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('child_onchain_wallets')
    .insert({
      child_id: wallet.childId,
      derivation_index: wallet.derivationIndex,
      receive_address: wallet.receiveAddress,
      network: wallet.network,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create onchain wallet: ${error?.message || 'Unknown'}`);
  }
  return data as ChildOnchainWallet;
}

export async function updateSyncTimestamp(childId: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('child_onchain_wallets')
    .update({ last_chain_sync_at: new Date().toISOString() })
    .eq('child_id', childId);

  if (error) {
    console.warn(`Failed to update sync timestamp for child ${childId}:`, error.message);
  }
}
