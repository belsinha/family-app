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

function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  const m = err.message ?? '';
  return /duplicate key/i.test(m);
}

/**
 * Idempotent wallet row for a child. Handles concurrent first requests (same child_id)
 * and rare derivation_index races by refetching or retrying with a new index.
 */
export async function getOrCreateWalletForChild(params: {
  childId: number;
  network: string;
  deriveAddress: (derivationIndex: number) => string;
}): Promise<ChildOnchainWallet> {
  let wallet = await getWalletByChildId(params.childId);
  if (wallet) return wallet;

  const supabase = getSupabaseClient();
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    wallet = await getWalletByChildId(params.childId);
    if (wallet) return wallet;

    const index = await getNextDerivationIndex();
    const receiveAddress = params.deriveAddress(index);

    const { data, error } = await supabase
      .from('child_onchain_wallets')
      .insert({
        child_id: params.childId,
        derivation_index: index,
        receive_address: receiveAddress,
        network: params.network,
      })
      .select()
      .single();

    if (!error && data) {
      return data as ChildOnchainWallet;
    }

    if (isUniqueViolation(error)) {
      wallet = await getWalletByChildId(params.childId);
      if (wallet) return wallet;
      continue;
    }

    throw new Error(`Failed to create onchain wallet: ${error?.message || 'Unknown'}`);
  }

  throw new Error('Failed to allocate onchain wallet after concurrent create attempts');
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
