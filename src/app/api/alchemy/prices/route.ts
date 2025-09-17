import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AssetId, PricePoint } from "@/lib/types";
import { globalCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";

// Schema for the request body
const schema = z.object({
  assetIds: z.array(z.enum([
    "bitcoin",
    "ethereum", 
    "solana",
    "usd-coin",
    "tether",
    "pepe",
    "polkadot",
    "aave",
    "chainlink",
    "fartcoin",
    "wrapped-staked-ether",
    "euro-coin",
  ]) as z.ZodType<AssetId>),
  startDate: z.string(),
  endDate: z.string(),
});

// Map AssetId to symbol for Alchemy API
const ASSET_ID_TO_SYMBOL_MAP: Record<AssetId, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  "usd-coin": "USDC",
  tether: "USDT",
  pepe: "PEPE",
  polkadot: "DOT",
  aave: "AAVE",
  chainlink: "LINK",
  fartcoin: "FART",
  "wrapped-staked-ether": "wstETH",
  "euro-coin": "EURC",
};

// Alchemy API configuration
const ALCHEMY_BASE_URL = "https://api.g.alchemy.com/prices/v1";

// Rate limiting configuration
const ALCHEMY_RATE_LIMIT_DELAY = 100;
const MAX_RETRIES = 3;
const EXPONENTIAL_BACKOFF_FACTOR = 2;

// Global rate limiter
let globalLastRequestTime = 0;

// Get Alchemy API key from server environment
function getAlchemyApiKey(): string {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error("ALCHEMY_API_KEY environment variable is required on the server");
  }
  return apiKey;
}

// Rate limiting function
async function alchemyRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - globalLastRequestTime;
  const minDelay = Math.max(0, ALCHEMY_RATE_LIMIT_DELAY - timeSinceLastRequest);
  
  if (minDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, minDelay));
  }
  
  globalLastRequestTime = Date.now();
}

// Make a rate-limited request with retry logic
async function makeAlchemyRequest<T>(
  requestFn: () => Promise<T>,
  retryCount: number = 0
): Promise<T> {
  await alchemyRateLimit();
  
  try {
    return await requestFn();
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(EXPONENTIAL_BACKOFF_FACTOR, retryCount) * 1000;
      console.log(`Alchemy request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return makeAlchemyRequest(requestFn, retryCount + 1);
    }
    throw error;
  }
}

// Fetch historical prices for a single token using Alchemy API
async function fetchAlchemyHistoricalPrices(
  assetId: AssetId,
  startDate: Date,
  endDate: Date
): Promise<PricePoint[]> {
  const apiKey = getAlchemyApiKey();
  const symbol = ASSET_ID_TO_SYMBOL_MAP[assetId];
  
  if (!symbol) {
    throw new Error(`Unsupported asset ID: ${assetId}`);
  }

  const url = `${ALCHEMY_BASE_URL}/${apiKey}/tokens/historical`;
  
  const payload = {
    symbol: symbol,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString()
  };

  console.log(`Fetching Alchemy historical prices for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const response = await makeAlchemyRequest(async () => {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Alchemy API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`Received Alchemy data for ${symbol}: ${data.data?.length || 0} price points`);

  // Check for the correct Alchemy response format
  if (!data.data || !Array.isArray(data.data)) {
    console.warn(`No price data in Alchemy response for ${symbol}:`, data);
    return [];
  }

  // Convert Alchemy format to our format
  const prices: PricePoint[] = data.data
    .map((priceData: any) => ({
      date: new Date(priceData.timestamp).toISOString().split('T')[0], // Format as YYYY-MM-DD
      price: parseFloat(priceData.value),
    }))
    .filter((point: PricePoint) => {
      const pointDate = new Date(point.date);
      return pointDate >= startDate && pointDate <= endDate;
    });

  console.log(`Filtered ${prices.length} price points for ${symbol} in range ${startDate.toISOString()} to ${endDate.toISOString()}`);
  return prices;
}

// Fetch historical prices using chunked approach
async function fetchAlchemyHistoricalPricesChunked(
  assetId: AssetId,
  startDate: Date,
  endDate: Date
): Promise<PricePoint[]> {
  const symbol = ASSET_ID_TO_SYMBOL_MAP[assetId];
  
  if (!symbol) {
    throw new Error(`Unsupported asset ID: ${assetId}`);
  }

  const allPrices: PricePoint[] = [];
  const chunkSize = 365; // 365 days per chunk
  const chunkSizeMs = chunkSize * 24 * 60 * 60 * 1000; // Convert to milliseconds
  
  let currentStart = new Date(startDate);
  let chunkIndex = 0;
  
  console.log(`Fetching chunked data for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  while (currentStart < endDate) {
    chunkIndex++;
    
    // Calculate chunk end date (365 days later, but not beyond the final end date)
    const chunkEnd = new Date(Math.min(
      currentStart.getTime() + chunkSizeMs,
      endDate.getTime()
    ));
    
    console.log(`Fetching chunk ${chunkIndex} for ${symbol}: ${currentStart.toISOString()} to ${chunkEnd.toISOString()}`);
    
    try {
      const chunkPrices = await fetchAlchemyHistoricalPrices(assetId, currentStart, chunkEnd);
      allPrices.push(...chunkPrices);
      console.log(`Chunk ${chunkIndex} returned ${chunkPrices.length} price points`);
      
      // Move to next chunk (start from the day after the last chunk)
      currentStart = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000);
      
      // Add a small delay between chunks to be respectful to the API
      if (currentStart < endDate) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Failed to fetch chunk ${chunkIndex} for ${symbol}:`, error);
      // Continue with next chunk instead of failing completely
      currentStart = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000);
    }
  }
  
  // Sort and deduplicate by date (in case of overlaps)
  const uniquePrices = allPrices
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((price, index, array) => 
      index === 0 || price.date !== array[index - 1].date
    );
  
  console.log(`Total consolidated price points for ${symbol}: ${uniquePrices.length}`);
  return uniquePrices;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);

    console.log('🔍 Alchemy prices API request:', {
      assetIds: parsed.assetIds,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      requestId: Math.random().toString(36).substr(2, 9)
    });

    const start = new Date(parsed.startDate);
    const end = new Date(parsed.endDate);
    const result: Record<string, PricePoint[]> = {};
    
    // Process assets sequentially with caching
    for (let i = 0; i < parsed.assetIds.length; i++) {
      const assetId = parsed.assetIds[i];
      console.log(`Processing ${assetId} (${i + 1}/${parsed.assetIds.length})`);
      
      // Check cache first
      const cacheKey = CACHE_KEYS.HISTORICAL_PRICES(assetId, parsed.startDate, parsed.endDate);
      console.log(`Cache key for ${assetId}: ${cacheKey}`);
      const cachedData = globalCache.get<PricePoint[]>(cacheKey);
      
      if (cachedData) {
        console.log(`✅ Cache HIT for ${assetId}: ${cachedData.length} price points`);
        result[assetId] = cachedData;
        continue;
      }
      
      console.log(`❌ Cache MISS for ${assetId}, fetching from Alchemy API`);
      
      try {
        const prices = await fetchAlchemyHistoricalPricesChunked(assetId, start, end);
        result[assetId] = prices;
        
        // Cache the result
        globalCache.set(cacheKey, prices, CACHE_TTL.HISTORICAL_PRICES);
        console.log(`Cached ${prices.length} price points for ${assetId} (TTL: ${CACHE_TTL.HISTORICAL_PRICES}ms)`);
        
        console.log(`Successfully fetched ${prices.length} price points for ${assetId}`);
      } catch (error) {
        console.error(`Failed to fetch data for ${assetId}:`, error);
        result[assetId] = []; // Empty array for failed assets
      }
    }
    
    console.log(`Final result summary:`, Object.entries(result).map(([key, value]) => `${key}: ${value.length} points`));
    
    // Log cache statistics
    const cacheStats = globalCache.getStats();
    console.log(`📊 Cache stats: ${cacheStats.valid} valid, ${cacheStats.expired} expired, ${cacheStats.total} total entries`);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Alchemy prices API error:', error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
