import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AssetId } from "@/lib/types";
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
});

// Map AssetId to symbol for Alchemy API (using original assets for backtesting)
const ASSET_ID_TO_SYMBOL_MAP: Record<AssetId, string> = {
  bitcoin: "BTC",           // Original Bitcoin for backtesting
  ethereum: "ETH",          // Original Ethereum for backtesting
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

// Get Alchemy API key from server environment
function getAlchemyApiKey(): string {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error("ALCHEMY_API_KEY environment variable is required on the server");
  }
  return apiKey;
}

// Simple cache for prices to avoid repeated API calls
const priceCache = new Map<string, { price: number; timestamp: number }>();
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Global rate limiter
let globalLastRequestTime = 0;
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

// Rate limiting function
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - globalLastRequestTime;
  const minDelay = Math.max(0, RATE_LIMIT_DELAY - timeSinceLastRequest);
  
  if (minDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, minDelay));
  }
  
  globalLastRequestTime = Date.now();
}

// Fetch current prices for multiple tokens with caching and rate limiting
async function fetchCurrentPrices(assetIds: AssetId[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  
  // Check global cache first for all assets
  const cacheKey = CACHE_KEYS.CURRENT_PRICES;
  const cachedPrices = globalCache.get<Record<string, number>>(cacheKey);
  
  if (cachedPrices) {
    console.log(`Using cached current prices for ${Object.keys(cachedPrices).length} assets`);
    // Return only the requested assets from cache
    for (const assetId of assetIds) {
      if (cachedPrices[assetId] !== undefined) {
        result[assetId] = cachedPrices[assetId];
      }
    }
    
    // If we have all requested assets in cache, return early
    if (Object.keys(result).length === assetIds.length) {
      return result;
    }
  }
  
  // Process assets sequentially to respect rate limits
  for (const assetId of assetIds) {
    // Skip if we already have this asset from cache
    if (result[assetId] !== undefined) {
      continue;
    }
    const symbol = ASSET_ID_TO_SYMBOL_MAP[assetId];
    
    if (!symbol) {
      console.warn(`Unsupported asset ID: ${assetId}`);
      continue;
    }

    // Check local cache as fallback
    const localCacheKey = `price_${symbol}`;
    const cached = priceCache.get(localCacheKey);
    if (cached && (Date.now() - cached.timestamp) < PRICE_CACHE_DURATION) {
      console.log(`Using local cached price for ${symbol}: $${cached.price}`);
      result[assetId] = cached.price;
      continue;
    }

    try {
      // Apply rate limiting
      await rateLimit();
      
      const apiKey = getAlchemyApiKey();
      const url = `${ALCHEMY_BASE_URL}/${apiKey}/tokens/current`;
      
      const payload = {
        symbol: symbol
      };

      console.log(`Fetching current price for ${symbol}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Alchemy API error for ${symbol}: ${response.status} - ${errorText}`);
        continue;
      }

      const data = await response.json();
      
      if (data.data && data.data.value) {
        const price = parseFloat(data.data.value);
        result[assetId] = price;
        
        // Cache the result
        priceCache.set(localCacheKey, { price, timestamp: Date.now() });
        
        console.log(`Current price for ${symbol}: $${price}`);
      } else {
        console.warn(`No price data in response for ${symbol}:`, data);
      }
      
    } catch (error) {
      console.error(`Failed to fetch current price for ${symbol}:`, error);
    }
  }
  
  // Cache the results globally
  if (Object.keys(result).length > 0) {
    globalCache.set(cacheKey, result, CACHE_TTL.CURRENT_PRICES);
    console.log(`Cached current prices for ${Object.keys(result).length} assets (TTL: ${CACHE_TTL.CURRENT_PRICES}ms)`);
  }
  
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);

    console.log('Alchemy current prices API request:', {
      assetIds: parsed.assetIds
    });

    const prices = await fetchCurrentPrices(parsed.assetIds);
    
    console.log(`Successfully fetched current prices for ${Object.keys(prices).length} assets`);
    
    return NextResponse.json(prices);
  } catch (error) {
    console.error('Alchemy current prices API error:', error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
