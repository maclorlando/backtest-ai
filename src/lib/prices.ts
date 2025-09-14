import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { AssetId, PricesByAsset, PricePoint } from "./types";

// Rate limiting and retry configuration
const RATE_LIMIT_DELAY = 1000; // Base delay in ms for pro keys
const DEMO_RATE_LIMIT_DELAY = 10000; // 10 seconds for demo keys (extremely conservative to avoid rate limits)
const MAX_RETRIES = 5;
const EXPONENTIAL_BACKOFF_FACTOR = 2;

// Rate limiting state
let lastRequestTime = 0;
let consecutiveRateLimits = 0;
let requestQueue: Array<() => Promise<any>> = [];
let isProcessingQueue = false;

// Global rate limiter for all CoinGecko API calls
let globalLastRequestTime = 0;

// Global rate limiting function that can be used by other files
export async function globalRateLimit(apiKey?: string): Promise<void> {
  const isDemoKey = apiKey && (apiKey.toLowerCase().includes('demo') || apiKey.length < 20);
  const delay = isDemoKey ? DEMO_RATE_LIMIT_DELAY : RATE_LIMIT_DELAY;
  
  const now = Date.now();
  const timeSinceLastRequest = now - globalLastRequestTime;
  const minDelay = Math.max(0, delay - timeSinceLastRequest);
  
  if (minDelay > 0) {
    console.log(`Global rate limiting: waiting ${minDelay}ms before next CoinGecko request`);
    await new Promise(resolve => setTimeout(resolve, minDelay));
  }
  
  globalLastRequestTime = Date.now();
}

// Helper function to determine CoinGecko API endpoint and headers
function getCoinGeckoConfig(apiKey?: string): { baseUrl: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { accept: "application/json" };
  
  if (!apiKey) {
    // No API key - use free endpoint
    return {
      baseUrl: "https://api.coingecko.com/api/v3",
      headers
    };
  }
  
  // Check if it's a demo API key (demo keys typically start with "demo" or are shorter)
  // Demo keys should use the regular endpoint, not the pro endpoint
  const isDemoKey = apiKey.toLowerCase().includes('demo') || apiKey.length < 20;
  
  if (isDemoKey) {
    // Demo API key - use regular endpoint with demo key
    return {
      baseUrl: "https://api.coingecko.com/api/v3",
      headers: { ...headers, "x-cg-demo-api-key": apiKey }
    };
  } else {
    // Pro API key - use pro endpoint
    return {
      baseUrl: "https://pro-api.coingecko.com/api/v3",
      headers: { ...headers, "x-cg-pro-api-key": apiKey }
    };
  }
}

// Helper function to determine the appropriate delay based on API key type
function getRateLimitDelay(apiKey?: string): number {
  if (!apiKey) return RATE_LIMIT_DELAY;
  
  const isDemoKey = apiKey.toLowerCase().includes('demo') || apiKey.length < 20;
  const delay = isDemoKey ? DEMO_RATE_LIMIT_DELAY : RATE_LIMIT_DELAY;
  
  if (isDemoKey) {
    console.log(`Using demo API key with ${delay}ms delay between requests (rate limit: 5 requests/minute)`);
  }
  
  return delay;
}

// Request queue processor to ensure sequential requests
async function processRequestQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const requestFn = requestQueue.shift();
    if (requestFn) {
      try {
        await requestFn();
      } catch (error) {
        console.error('Request in queue failed:', error);
      }
    }
  }
  
  isProcessingQueue = false;
}

// Helper function to handle rate limiting with exponential backoff
async function makeRateLimitedRequest<T>(
  requestFn: () => Promise<T>,
  retryCount = 0,
  apiKey?: string
): Promise<T> {
  try {
    // Use global rate limiting to ensure all CoinGecko requests are coordinated
    await globalRateLimit(apiKey);
    const result = await requestFn();
    
    // Reset consecutive rate limits on success
    consecutiveRateLimits = 0;
    return result;
    
  } catch (error: any) {
    // Check if it's a rate limit error (429 or specific error message)
    const isRateLimit = error.status === 429 || 
                       error.message?.includes('rate limit') ||
                       error.message?.includes('too many requests') ||
                       error.message?.includes('Too Many Requests');
    
    if (isRateLimit && retryCount < MAX_RETRIES) {
      consecutiveRateLimits++;
      
      // Calculate delay with exponential backoff based on API key type
      const baseDelay = getRateLimitDelay(apiKey) * Math.pow(EXPONENTIAL_BACKOFF_FACTOR, retryCount);
      const jitter = Math.random() * 1000; // Add some randomness
      const delay = baseDelay + jitter;
      
      console.warn(`Rate limit hit (${error.status}), retrying in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return makeRateLimitedRequest(requestFn, retryCount + 1, apiKey);
    }
    
    throw error;
  }
}

// Enhanced CoinGecko API types
export interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  image: {
    thumb: string;
    small: string;
    large: string;
  };
  market_data: {
    current_price: { usd: number };
    market_cap: { usd: number };
    total_volume: { usd: number };
    circulating_supply: number;
    total_supply: number;
    max_supply: number;
    price_change_24h: number;
    price_change_percentage_24h: number;
    market_cap_change_24h: number;
    market_cap_change_percentage_24h: number;
  };
  community_data: {
    reddit_subscribers: number;
    twitter_followers: number;
  };
  links: {
    homepage: string[];
    blockchain_site: string[];
    official_forum_url: string[];
    chat_url: string[];
    announcement_url: string[];
    repos_url: {
      github: string[];
      bitbucket: string[];
    };
  };
  description: {
    en: string;
  };
  genesis_date: string;
  sentiment_votes_up_percentage: number;
  sentiment_votes_down_percentage: number;
}

export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: {
    currency: string;
    percentage: number;
    times: number;
  } | null;
  last_updated: string;
}

export interface CoinGeckoGlobalData {
  active_cryptocurrencies: number;
  total_market_cap: { usd: number };
  total_volume: { usd: number };
  market_cap_percentage: { btc: number; eth: number };
  market_cap_change_percentage_24h_usd: number;
  updated: number;
}

export interface CoinGeckoTrending {
  coins: Array<{
    item: {
      id: string;
      coin_id: number;
      name: string;
      symbol: string;
      market_cap_rank: number;
      thumb: string;
      small: string;
      large: string;
      slug: string;
      price_btc: number;
      score: number;
    };
  }>;
}

// Simple Coingecko daily close fetcher (free). For production, consider caching and retries.
// Coingecko: /coins/{id}/market_chart?vs_currency=usd&days=max

async function fetchCoingeckoDailyPrices(
  assetId: AssetId,
  from: Date,
  to: Date,
  apiKey?: string
): Promise<PricePoint[]> {
  const config = getCoinGeckoConfig(apiKey);
  const url = `${config.baseUrl}/coins/${assetId}/market_chart?vs_currency=usd&days=max`;

  const res = await makeRateLimitedRequest(async () => fetch(url, { headers: config.headers, cache: "no-store" }), 0, apiKey);
  if (!res.ok) {
    throw new Error(`Failed to fetch prices for ${assetId}: ${res.status}`);
  }
  const data = await res.json();

  const startMs = from.getTime();
  const endMs = to.getTime();

  const byDay = new Map<string, number>();
  for (const [ts, price] of data.prices as [number, number][]) {
    if (ts < startMs || ts > endMs) continue;
    const day = format(new Date(ts), "yyyy-MM-dd");
    byDay.set(day, price);
  }
  const points: PricePoint[] = Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, price]) => ({ date, price }));
  return points;
}

async function fetchBinanceDailyPrices(
  assetId: AssetId,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  const symbolMap: Partial<Record<AssetId, string>> = {
    bitcoin: "BTCUSDT",
    ethereum: "ETHUSDT",
    solana: "SOLUSDT",
    polkadot: "DOTUSDT",
    aave: "AAVEUSDT",
    chainlink: "LINKUSDT",
    pepe: "PEPEUSDT",
  };
  const symbol = symbolMap[assetId];
  if (!symbol) return [];

  const limit = 1000; // max per request
  const points: PricePoint[] = [];
  let cursor = from.getTime();
  const endMs = to.getTime();
  while (cursor <= endMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${cursor}&endTime=${endMs}&limit=${limit}`;
    const res = await makeRateLimitedRequest(async () => fetch(url, { headers: { accept: "application/json" }, cache: "no-store" }));
    if (!res.ok) throw new Error(`Binance ${assetId}: ${res.status}`);
    const data = (await res.json()) as unknown as Array<[
      number,
      string,
      string,
      string,
      string,
      string,
      number,
      string,
      number,
      string,
      string,
      string
    ]>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) {
      const openTime = row[0] as number; // ms
      const close = Number(row[4]);
      const date = format(new Date(openTime), "yyyy-MM-dd");
      points.push({ date, price: close });
    }
    const lastOpenTime = data[data.length - 1][0] as number;
    const next = lastOpenTime + 24 * 60 * 60 * 1000;
    if (next <= cursor) break;
    cursor = next;
  }
  // Deduplicate by date, last wins
  const byDay = new Map<string, number>();
  for (const p of points) byDay.set(p.date, p.price);
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, price]) => ({ date, price }));
}

async function fetchCoinPaprikaDailyPrices(
  assetId: AssetId,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  const idMap: Record<AssetId, string> = {
    bitcoin: "btc-bitcoin",
    ethereum: "eth-ethereum",
    solana: "sol-solana",
    "usd-coin": "usdc-usd-coin",
    tether: "usdt-tether",
    pepe: "pepe-pepe",
    polkadot: "dot-polkadot",
    aave: "aave-aave",
    chainlink: "link-chainlink",
    fartcoin: "fart-fartcoin",
    "wrapped-staked-ether": "wsteth-wrapped-staked-ether",
    "euro-coin": "euro-euro-coin",
  };
  const paprikaId = idMap[assetId];
  if (!paprikaId) throw new Error(`No CoinPaprika mapping for ${assetId}`);
  // Paprika may reject long ranges; fetch in ~180-day chunks
  const chunkDays = 180;
  const chunks: PricePoint[] = [];
  let cursor = new Date(from);
  while (cursor <= to) {
    const chunkStart = new Date(cursor);
    const chunkEnd = addDays(cursor, chunkDays);
    if (chunkEnd > to) {
      chunkEnd.setTime(to.getTime());
    }
    const start = format(chunkStart, "yyyy-MM-dd");
    const end = format(chunkEnd, "yyyy-MM-dd");
    const url = `https://api.coinpaprika.com/v1/tickers/${paprikaId}/historical?start=${start}&end=${end}&interval=1d`;
    const res = await makeRateLimitedRequest(async () => fetch(url, { headers: { accept: "application/json" }, cache: "no-store" }));
    if (!res.ok) {
      throw new Error(`Paprika ${assetId}: ${res.status}`);
    }
    type PaprikaRow = {
      time_open?: string;
      time_close?: string;
      timestamp?: string;
      open?: number;
      close?: number;
      price?: number;
    };
    const data = (await res.json()) as PaprikaRow[];
    for (const row of data) {
      const ts = row.time_close ?? row.timestamp ?? row.time_open;
      const dateObj = ts ? new Date(ts) : chunkEnd;
      const date = format(dateObj, "yyyy-MM-dd");
      const price = Number(row.close ?? row.price ?? row.open ?? 1);
      chunks.push({ date, price });
    }
    cursor = addDays(chunkEnd, 1);
  }
  // Deduplicate by date, last-value wins
  const byDay = new Map<string, number>();
  for (const p of chunks) byDay.set(p.date, p.price);
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, price]) => ({ date, price }));
}

function synthesizeStablecoin(from: Date, to: Date): PricePoint[] {
  const days = Math.max(0, differenceInCalendarDays(to, from));
  const out: PricePoint[] = [];
  for (let i = 0; i <= days; i++) {
    const d = addDays(from, i);
    out.push({ date: format(d, "yyyy-MM-dd"), price: 1 });
  }
  return out;
}

export async function fetchPrices(
  assetIds: AssetId[],
  start: string,
  end: string,
  opts?: { coingeckoApiKey?: string }
): Promise<PricesByAsset> {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const unique = Array.from(new Set(assetIds)).filter(Boolean);
  const apiKey = opts?.coingeckoApiKey;

  // Check if we should use sequential requests for demo API keys
  const isDemoKey = apiKey && (apiKey.toLowerCase().includes('demo') || apiKey.length < 20);
  
  const fetchAssetPrices = async (id: AssetId) => {
    // Try CoinGecko (with or without key)
    try {
      const cg = await fetchCoingeckoDailyPrices(id, startDate, endDate, apiKey);
      if (cg.length > 0) return cg;
    } catch {
      // swallow and try fallback
    }
    // Try Binance for major pairs
    try {
      const bin = await fetchBinanceDailyPrices(id, startDate, endDate);
      if (bin.length > 0) return bin;
    } catch {
      // swallow and try fallback
    }
    // Stablecoin fallback
    if (id === "usd-coin" || id === "tether") {
      return synthesizeStablecoin(startDate, endDate);
    }
    // Try CoinPaprika
    try {
      const paprika = await fetchCoinPaprikaDailyPrices(id, startDate, endDate);
      return paprika;
    } catch {
      // If all providers fail, return empty series to avoid crashing the whole request
      return [];
    }
  };

  let results: PricePoint[][];
  
  if (isDemoKey) {
    // For demo keys, make requests sequentially to avoid rate limits
    console.log(`Using sequential requests for demo API key (${unique.length} assets)`);
    results = [];
    for (const id of unique) {
      const result = await fetchAssetPrices(id);
      results.push(result);
    }
  } else {
    // For pro keys or no key, use concurrent requests for better performance
    results = await Promise.all(unique.map(fetchAssetPrices));
  }

  const out: PricesByAsset = {};
  unique.forEach((id, i) => (out[id] = results[i]));
  return out;
}

export async function fetchCoinLogos(ids: AssetId[], apiKey?: string): Promise<Record<string, string>> {
  const config = getCoinGeckoConfig(apiKey);
  const res: Record<string, string> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/coins/${id}`, { headers: config.headers, cache: "force-cache" }), 0, apiKey);
        if (!r.ok) return;
        const data = await r.json();
        const url = data?.image?.small || data?.image?.thumb;
        if (url) res[id] = url;
      } catch {}
    })
  );
  return res;
}

export async function fetchCurrentPricesUSD(ids: AssetId[], apiKey?: string): Promise<Record<string, number>> {
  const config = getCoinGeckoConfig(apiKey);
  const result: Record<string, number> = {};
  
  // Filter out invalid IDs (like contract addresses)
  const validIds = ids.filter(id => {
    // Only allow valid CoinGecko IDs (no contract addresses)
    return !id.startsWith('0x') && !id.includes('0x') && id.length < 50;
  });
  
  if (validIds.length === 0) {
    console.warn("No valid CoinGecko IDs found for price fetching");
    return result;
  }

  // Fallback prices for common tokens when API fails
  const fallbackPrices: Record<string, number> = {
    'bitcoin': 45000.0,
    'ethereum': 3000.0,
    'solana': 100.0,
    'usd-coin': 1.0,
    'tether': 1.0,
    'pepe': 0.00001,
    'polkadot': 7.0,
    'aave': 300.0,
    'chainlink': 15.0,
    'fartcoin': 0.001,
    // Additional fallbacks for other common tokens
    'usdc': 1.0,
    'usdt': 1.0,
    'dai': 1.0,
    'weth': 3000.0,
    'native': 3000.0, // ETH price
    'wbtc': 45000.0,
    'link': 15.0,
    'uni': 8.0,
    'matic': 0.8,
    'bnb': 300.0,
    'ada': 0.5,
    'dot': 7.0,
    'sol': 100.0,
    'avax': 30.0,
    'atom': 10.0,
    'ltc': 70.0,
    'bch': 250.0,
    'xrp': 0.6,
    'doge': 0.08,
  };

  // Check if we're running on the client side
  const isClient = typeof window !== 'undefined';
  
  if (isClient) {
    // Use API endpoint to avoid CORS issues
    try {
      const response = await makeRateLimitedRequest(async () => fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: validIds, apiKey: apiKey })
      }));
      
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        console.warn('API endpoint failed, using fallback prices');
        // Fall back to fallback prices
        validIds.forEach(id => {
          result[id] = fallbackPrices[id.toLowerCase()] || 1.0;
        });
        return result;
      }
    } catch (error) {
      console.warn('Failed to fetch prices via API endpoint, using fallback prices:', error);
      // Fall back to fallback prices
      validIds.forEach(id => {
        result[id] = fallbackPrices[id.toLowerCase()] || 1.0;
      });
      return result;
    }
  }

  // Server-side: Try to fetch from API with better error handling
  for (const id of validIds) {
    try {
      const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/simple/price?ids=${id}&vs_currencies=usd`, { 
        headers: config.headers, 
        cache: "no-store"
      }), 0, apiKey);
      
      if (!r.ok) {
        if (r.status === 429) {
          console.warn(`Rate limited for ${id}, using fallback price`);
          result[id] = fallbackPrices[id.toLowerCase()] || 1.0;
        } else {
          console.warn(`API error for ${id}: ${r.status}, using fallback price`);
          result[id] = fallbackPrices[id.toLowerCase()] || 1.0;
        }
        continue;
      }
      
      const data = await r.json();
      const usd = Number(data?.[id]?.usd);
      if (Number.isFinite(usd)) {
        result[id] = usd;
      } else {
        console.warn(`Invalid price data for ${id}, using fallback`);
        result[id] = fallbackPrices[id.toLowerCase()] || 1.0;
      }
    } catch (error) {
      console.warn(`Failed to fetch price for ${id}:`, error);
      // Use fallback price on any error
      result[id] = fallbackPrices[id.toLowerCase()] || 1.0;
    }
  }
  
  return result;
}

// NEW: Enhanced CoinGecko API functions

/**
 * Fetch comprehensive coin data including images, market data, and social links
 */
export async function fetchCoinData(coinId: string, apiKey?: string): Promise<CoinGeckoCoin | null> {
  const config = getCoinGeckoConfig(apiKey);

  try {
    const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=false&sparkline=false`, { 
      headers: config.headers, 
      cache: "force-cache" // Cache for 1 hour
    }), 0, apiKey);
    
    if (!r.ok) {
      console.warn(`Failed to fetch coin data for ${coinId}: ${r.status}`);
      return null;
    }
    
    const data = await r.json();
    return data as CoinGeckoCoin;
  } catch (error) {
    console.warn(`Error fetching coin data for ${coinId}:`, error);
    return null;
  }
}

/**
 * Fetch market data for multiple coins with rankings and statistics
 */
export async function fetchMarketData(
  coinIds: string[], 
  apiKey?: string,
  options?: {
    order?: 'market_cap_desc' | 'market_cap_asc' | 'volume_desc' | 'volume_asc' | 'id_desc' | 'id_asc';
    per_page?: number;
    page?: number;
    sparkline?: boolean;
    price_change_percentage?: string;
  }
): Promise<CoinGeckoMarketData[]> {
  const config = getCoinGeckoConfig(apiKey);

  const params = new URLSearchParams({
    vs_currency: 'usd',
    ids: coinIds.join(','),
    order: options?.order || 'market_cap_desc',
    per_page: (options?.per_page || 100).toString(),
    page: (options?.page || 1).toString(),
    sparkline: (options?.sparkline || false).toString(),
    price_change_percentage: options?.price_change_percentage || '24h,7d,30d'
  });

  try {
    const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/coins/markets?${params}`, { 
      headers: config.headers, 
      cache: "no-store"
    }), 0, apiKey);
    
    if (!r.ok) {
      console.warn(`Failed to fetch market data: ${r.status}`);
      return [];
    }
    
    const data = await r.json();
    return data as CoinGeckoMarketData[];
  } catch (error) {
    console.warn('Error fetching market data:', error);
    return [];
  }
}

/**
 * Fetch global cryptocurrency market statistics
 */
export async function fetchGlobalData(apiKey?: string): Promise<CoinGeckoGlobalData | null> {
  const config = getCoinGeckoConfig(apiKey);

  try {
    const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/global`, { 
      headers: config.headers, 
      cache: "no-store"
    }), 0, apiKey);
    
    if (!r.ok) {
      console.warn(`Failed to fetch global data: ${r.status}`);
      return null;
    }
    
    const data = await r.json();
    return data.data as CoinGeckoGlobalData;
  } catch (error) {
    console.warn('Error fetching global data:', error);
    return null;
  }
}

/**
 * Fetch trending coins in the last 24 hours
 */
export async function fetchTrendingCoins(apiKey?: string): Promise<CoinGeckoTrending | null> {
  const config = getCoinGeckoConfig(apiKey);

  try {
    const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/search/trending`, { 
      headers: config.headers, 
      cache: "no-store"
    }), 0, apiKey);
    
    if (!r.ok) {
      console.warn(`Failed to fetch trending coins: ${r.status}`);
      return null;
    }
    
    const data = await r.json();
    return data as CoinGeckoTrending;
  } catch (error) {
    console.warn('Error fetching trending coins:', error);
    return null;
  }
}

/**
 * Search for coins, categories, and markets
 */
export async function searchCoins(
  query: string, 
  apiKey?: string
): Promise<Array<{ id: string; name: string; symbol: string; market_cap_rank: number; thumb: string; large: string }>> {
  const config = getCoinGeckoConfig(apiKey);

  try {
    const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/search?query=${encodeURIComponent(query)}`, { 
      headers: config.headers, 
      cache: "no-store"
    }), 0, apiKey);
    
    if (!r.ok) {
      console.warn(`Failed to search coins: ${r.status}`);
      return [];
    }
    
    const data = await r.json();
    return data.coins || [];
  } catch (error) {
    console.warn('Error searching coins:', error);
    return [];
  }
}

/**
 * Fetch OHLC (Open, High, Low, Close) data for technical analysis
 */
export async function fetchOHLCData(
  coinId: string,
  days: number = 7,
  apiKey?: string
): Promise<Array<[number, number, number, number, number]>> {
  const config = getCoinGeckoConfig(apiKey);

  try {
    const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`, { 
      headers: config.headers, 
      cache: "no-store"
    }), 0, apiKey);
    
    if (!r.ok) {
      console.warn(`Failed to fetch OHLC data for ${coinId}: ${r.status}`);
      return [];
    }
    
    const data = await r.json();
    return data as Array<[number, number, number, number, number]>;
  } catch (error) {
    console.warn(`Error fetching OHLC data for ${coinId}:`, error);
    return [];
  }
}

/**
 * Get all supported coins list for autocomplete and discovery
 */
export async function fetchAllCoins(apiKey?: string): Promise<Array<{ id: string; symbol: string; name: string }>> {
  const config = getCoinGeckoConfig(apiKey);

  try {
    const r = await makeRateLimitedRequest(async () => fetch(`${config.baseUrl}/coins/list`, { 
      headers: config.headers, 
      cache: "force-cache" // Cache for 24 hours
    }), 0, apiKey);
    
    if (!r.ok) {
      console.warn(`Failed to fetch all coins: ${r.status}`);
      return [];
    }
    
    const data = await r.json();
    return data as Array<{ id: string; symbol: string; name: string }>;
  } catch (error) {
    console.warn('Error fetching all coins:', error);
    return [];
  }
}


