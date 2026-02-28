import { getLatestPrice, savePrice } from '../db/queries/bitcoin.js';

const COINGECKO_API_URL = process.env.BITCOIN_PRICE_API_URL || 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

/** Only fetch from CoinGecko if cache is older than this (minutes). Reduces 429 rate limits. */
const CACHE_TTL_MINUTES = Number(process.env.BITCOIN_PRICE_CACHE_TTL_MINUTES) || 5;

export interface BitcoinPriceData {
  price_usd: number;
  fetched_at: Date;
}

let inFlightFetch: Promise<BitcoinPriceData> | null = null;

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
 * Get cached price or fetch new one if stale/empty.
 * Respects CACHE_TTL_MINUTES to avoid CoinGecko rate limits (429).
 * Deduplicates in-flight requests so concurrent callers share one API call.
 * Returns null if fetch fails and no cache exists.
 */
export async function getOrFetchPrice(): Promise<BitcoinPriceData | null> {
  const cached = await getCachedPrice();
  let cachedPrice: BitcoinPriceData | null = null;
  if (cached) {
    cachedPrice = {
      price_usd: Number(cached.price_usd),
      fetched_at: new Date(cached.fetched_at),
    };
    const ageMinutes = (Date.now() - cachedPrice.fetched_at.getTime()) / (1000 * 60);
    console.log(`[PRICE] Found cached Bitcoin price: $${cachedPrice.price_usd} (${ageMinutes.toFixed(1)} minutes old)`);
    if (ageMinutes < CACHE_TTL_MINUTES) {
      return cachedPrice;
    }
  }

  const doFetch = async (): Promise<BitcoinPriceData> => {
    const priceData = await fetchBitcoinPrice();
    await updatePriceCache(priceData);
    return priceData;
  };

  try {
    if (inFlightFetch) {
      const priceData = await inFlightFetch;
      console.log(`✓ [PRICE] Using in-flight Bitcoin price: $${priceData.price_usd}`);
      return priceData;
    }
    inFlightFetch = doFetch();
    const priceData = await inFlightFetch;
    console.log(`✓ [PRICE] Successfully fetched fresh Bitcoin price: $${priceData.price_usd}`);
    return priceData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (cachedPrice) {
      const ageMinutes = (Date.now() - cachedPrice.fetched_at.getTime()) / (1000 * 60);
      console.warn(`⚠️ [PRICE] Failed to fetch Bitcoin price (${errorMessage}), using cached price from ${ageMinutes.toFixed(1)} minutes ago: $${cachedPrice.price_usd}`);
      return cachedPrice;
    }
    console.error(`❌ [PRICE] No Bitcoin price available: API failed (${errorMessage}) and no cached price exists`);
    return null;
  } finally {
    inFlightFetch = null;
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

