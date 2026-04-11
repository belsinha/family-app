import { config } from '../config.js';

const BASE = config.bitcoin.esploraBaseUrl;

interface EsploraAddressStats {
  funded_txo_count: number;
  funded_txo_sum: number;
  spent_txo_count: number;
  spent_txo_sum: number;
}

interface EsploraAddressInfo {
  address: string;
  chain_stats: EsploraAddressStats;
  mempool_stats: EsploraAddressStats;
}

export interface Utxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number };
}

export interface AddressBalance {
  confirmedSat: number;
  unconfirmedSat: number;
}

export interface FeeEstimates {
  [blocks: string]: number;
}

async function esploraGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Esplora ${path} returned ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getAddressBalance(address: string): Promise<AddressBalance> {
  const info = await esploraGet<EsploraAddressInfo>(`/address/${address}`);
  const confirmedSat =
    info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;
  const unconfirmedSat =
    info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;
  return { confirmedSat, unconfirmedSat };
}

export async function getUtxos(address: string): Promise<Utxo[]> {
  return esploraGet<Utxo[]>(`/address/${address}/utxo`);
}

export async function broadcastTx(hexString: string): Promise<string> {
  const res = await fetch(`${BASE}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: hexString,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Broadcast failed (${res.status}): ${text}`);
  }
  // Esplora returns the txid as plain text
  return (await res.text()).trim();
}

export async function getFeeEstimates(): Promise<FeeEstimates> {
  return esploraGet<FeeEstimates>('/fee-estimates');
}

/**
 * Get a reasonable fee rate (sat/vbyte) for ~6-block confirmation target.
 * Falls back to 2 sat/vbyte if the API doesn't return the target.
 */
export async function getRecommendedFeeRate(): Promise<number> {
  try {
    const estimates = await getFeeEstimates();
    return estimates['6'] ?? estimates['3'] ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Fetch the raw transaction hex for a given txid (needed for non-segwit input signing).
 */
export async function getRawTxHex(txid: string): Promise<string> {
  const res = await fetch(`${BASE}/tx/${txid}/hex`);
  if (!res.ok) throw new Error(`Failed to fetch raw tx ${txid}`);
  return (await res.text()).trim();
}
