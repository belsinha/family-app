import { getLatestPrice, savePrice } from '../db/queries/bitcoin.js';

const COINGECKO_API_URL = process.env.BITCOIN_PRICE_API_URL || 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

export interface BitcoinPriceData {
  price_usd: number;
  fetched_at: Date;
}

/**
 * Fetch Bitcoin price from CoinGecko API
 */
export async function fetchBitcoinPrice(): Promise<BitcoinPriceData> {
  try {
    const response = await fetch(COINGECKO_API_URL);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.bitcoin || typeof data.bitcoin.usd !== 'number') {
      throw new Error('Invalid response format from CoinGecko API');
    }
    
    const priceUsd = data.bitcoin.usd;
    const fetchedAt = new Date();
    
    return {
      price_usd: priceUsd,
      fetched_at: fetchedAt,
    };
  } catch (error) {
    throw new Error(`Failed to fetch Bitcoin price: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get cached price from database
 */
export async function getCachedPrice() {
  return await getLatestPrice();
}

/**
 * Update price cache in database
 */
export async function updatePriceCache(priceData: BitcoinPriceData): Promise<void> {
  await savePrice(priceData.price_usd, priceData.fetched_at);
}

/**
 * Get cached price or fetch new one if stale/empty
 * Returns null if fetch fails and no cache exists
 */
export async function getOrFetchPrice(): Promise<BitcoinPriceData | null> {
  try {
    // Try to fetch fresh price
    const priceData = await fetchBitcoinPrice();
    await updatePriceCache(priceData);
    return priceData;
  } catch (error) {
    // If fetch fails, try to use cached price
    console.warn('Failed to fetch Bitcoin price, using cached value if available:', error);
    const cached = await getCachedPrice();
    
    if (cached) {
      return {
        price_usd: Number(cached.price_usd),
        fetched_at: new Date(cached.fetched_at),
      };
    }
    
    // No cache available
    return null;
  }
}

/**
 * Refresh price cache (fetch and update)
 */
export async function refreshPriceCache(): Promise<BitcoinPriceData> {
  const priceData = await fetchBitcoinPrice();
  await updatePriceCache(priceData);
  return priceData;
}

