import { format } from "date-fns";
import type { AssetId, PricesByAsset, PricePoint } from "./types";

// Client-side Alchemy integration that calls our secure backend API
// This ensures the API key is never exposed to the frontend

// Fetch historical prices for backtesting using secure backend API
export async function fetchPricesForBacktest(
  assetIds: AssetId[],
  startDate: string,
  endDate: string,
  apiKey?: string, // Keep for compatibility but ignored (API key is on backend)
  onProgress?: (assetId: AssetId, progress: number) => void
): Promise<PricesByAsset> {
  const unique = Array.from(new Set(assetIds)).filter(Boolean);
  
  console.log(`Fetching Alchemy historical prices for ${unique.length} assets from ${startDate} to ${endDate} via backend API`);
  
  try {
    // Call our secure backend API
    const response = await fetch('/api/alchemy/prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetIds: unique,
        startDate,
        endDate,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Backend API error: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log(`Backend API returned data for ${Object.keys(result).length} assets`);
    console.log(`Result summary:`, Object.entries(result).map(([key, value]) => `${key}: ${(value as PricePoint[]).length} points`));
    
    return result;
  } catch (error) {
    console.error('Failed to fetch prices via backend API:', error);
    throw error;
  }
}

// Fetch current prices in USD using secure backend API
export async function fetchCurrentPricesUSD(assetIds: AssetId[], apiKey?: string): Promise<Record<string, number>> {
  console.log(`Fetching current prices for: ${assetIds.join(', ')} via backend API`);
  
  // Get current date and 7 days ago for recent price data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  try {
    const response = await fetch('/api/alchemy/prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetIds,
        startDate: startDateStr,
        endDate: endDateStr,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Backend API error: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const priceData = await response.json();
    const result: Record<string, number> = {};
    
    // Extract the most recent price for each asset
    for (const [assetId, prices] of Object.entries(priceData)) {
      if (Array.isArray(prices) && prices.length > 0) {
        const latestPrice = prices[prices.length - 1];
        result[assetId] = latestPrice.price;
        console.log(`Current price for ${assetId}: $${latestPrice.price}`);
      }
    }
    
    return result;
  } catch (error) {
    console.error('Failed to fetch current prices via backend API:', error);
    throw error;
  }
}

// Check price data availability using secure backend API
export async function checkPriceDataAvailability(
  ids: AssetId[], 
  apiKey?: string, 
  startDate?: string, 
  endDate?: string
): Promise<{ available: boolean; error?: string }> {
  const validIds = ids.filter(Boolean);
  if (validIds.length === 0) {
    return { available: false, error: "No valid asset IDs provided" };
  }

  try {
    // Test with a small date range
    const testStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 7 days ago
    const testEndDate = endDate || new Date().toISOString().split('T')[0];
    
    console.log(`Checking Alchemy price data availability for ${validIds.join(', ')} via backend API`);
    
    const response = await fetch('/api/alchemy/prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetIds: validIds,
        startDate: testStartDate,
        endDate: testEndDate,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { available: false, error: `Backend API error: ${errorData.error || 'Unknown error'}` };
    }

    const priceData = await response.json();
    
    // Check if we got data for at least one asset
    const hasData = Object.values(priceData).some((prices: any) => Array.isArray(prices) && prices.length > 0);
    
    if (!hasData) {
      return { available: false, error: `No price data available for any asset in the selected date range` };
    }
    
    return { available: true };
  } catch (error) {
    console.error(`Alchemy price data availability check failed:`, error);
    return { available: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Legacy function for backward compatibility
export async function fetchPrices(
  assetIds: AssetId[],
  start: string,
  end: string,
  opts?: { coingeckoApiKey?: string }
): Promise<PricesByAsset> {
  console.log(`Legacy fetchPrices called - using secure backend API for ${assetIds.length} assets from ${start} to ${end}`);
  return fetchPricesForBacktest(assetIds, start, end, opts?.coingeckoApiKey);
}

// Placeholder functions for compatibility (these would need to be implemented if needed)
export async function fetchCoinLogos(assetIds: AssetId[], apiKey?: string): Promise<Record<string, string>> {
  console.warn("fetchCoinLogos not implemented for Alchemy - returning empty object");
  return {};
}

export async function fetchCoinData(coinId: string, apiKey?: string): Promise<any> {
  throw new Error("fetchCoinData not implemented for Alchemy API");
}

export async function fetchMarketData(coinIds: string[], apiKey?: string): Promise<any[]> {
  throw new Error("fetchMarketData not implemented for Alchemy API");
}

export async function fetchTrendingCoins(apiKey?: string): Promise<any> {
  throw new Error("fetchTrendingCoins not implemented for Alchemy API");
}

export async function searchCoins(query: string, apiKey?: string): Promise<any> {
  throw new Error("searchCoins not implemented for Alchemy API");
}

export async function fetchGlobalData(apiKey?: string): Promise<any> {
  throw new Error("fetchGlobalData not implemented for Alchemy API");
}

export async function fetchOHLCData(coinId: string, days: number, apiKey?: string): Promise<any> {
  throw new Error("fetchOHLCData not implemented for Alchemy API");
}

// Rate limiting functions for compatibility (no-op since backend handles rate limiting)
export async function globalRateLimit(apiKey?: string): Promise<void> {
  // No-op: rate limiting is handled on the backend
  return Promise.resolve();
}

export function resetRateLimitState(): void {
  // No-op: rate limiting is handled on the backend
  console.log('Rate limiting is handled on the backend');
}

export function getRateLimitStatus(): { requestsUsed: number; requestsRemaining: number; timeUntilReset: number } {
  // Return optimistic values since backend handles rate limiting
  return {
    requestsUsed: 0,
    requestsRemaining: 1000,
    timeUntilReset: 0
  };
}

export async function waitForRateLimitReset(): Promise<void> {
  // No-op: rate limiting is handled on the backend
  return Promise.resolve();
}

// Type exports for backward compatibility
export type CoinGeckoMarketData = any;
export type CoinGeckoGlobalData = any;
export type CoinGeckoCoin = any;