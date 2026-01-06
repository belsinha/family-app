import { getLatestPrice, savePrice } from '../db/queries/bitcoin.js';

const COINGECKO_API_URL = process.env.BITCOIN_PRICE_API_URL || 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

export interface BitcoinPriceData {
  price_usd: number;
  fetched_at: Date;
}

interface CoinGeckoResponse {
  bitcoin?: {
    usd?: number;
  };
}

/**
 * Fetch Bitcoin price from CoinGecko API
 */
export async function fetchBitcoinPrice(): Promise<BitcoinPriceData> {
  try {
    console.log(`Fetching Bitcoin price from CoinGecko: ${COINGECKO_API_URL}`);
    const response = await fetch(COINGECKO_API_URL, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      console.error(`CoinGecko API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as CoinGeckoResponse;
    
    if (!data.bitcoin || typeof data.bitcoin.usd !== 'number') {
      console.error('Invalid CoinGecko response format:', JSON.stringify(data));
      throw new Error('Invalid response format from CoinGecko API');
    }
    
    const priceUsd = data.bitcoin.usd;
    const fetchedAt = new Date();
    
    console.log(`Successfully fetched Bitcoin price: $${priceUsd} at ${fetchedAt.toISOString()}`);
    
    return {
      price_usd: priceUsd,
      fetched_at: fetchedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to fetch Bitcoin price: ${errorMessage}`, error);
    throw new Error(`Failed to fetch Bitcoin price: ${errorMessage}`);
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
  // First, check if we have a cached price (even if stale, it's better than nothing)
  const cached = await getCachedPrice();
  
  try {
    // Try to fetch fresh price
    const priceData = await fetchBitcoinPrice();
    await updatePriceCache(priceData);
    console.log(`✓ Successfully fetched fresh Bitcoin price: $${priceData.price_usd}`);
    return priceData;
  } catch (error) {
    // If fetch fails (e.g., rate limit), use cached price if available
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (cached) {
      const cachedPrice = {
        price_usd: Number(cached.price_usd),
        fetched_at: new Date(cached.fetched_at),
      };
      const ageMinutes = (Date.now() - cachedPrice.fetched_at.getTime()) / (1000 * 60);
      console.warn(`⚠️ Failed to fetch Bitcoin price (${errorMessage}), using cached price from ${ageMinutes.toFixed(1)} minutes ago: $${cachedPrice.price_usd}`);
      return cachedPrice;
    }
    
    // No cache available
    console.error(`❌ No Bitcoin price available: API failed (${errorMessage}) and no cached price exists`);
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

