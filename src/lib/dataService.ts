import { globalCache, CACHE_KEYS, CACHE_TTL } from './cache';
import type { AssetId } from './types';

// Centralized data service to manage all API calls and caching
export class DataService {
  private static instance: DataService;
  private loadingPromises = new Map<string, Promise<any>>();

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  // Get current prices with global caching
  async getCurrentPrices(assetIds: AssetId[]): Promise<Record<string, number>> {
    // Use the same cache key as the API route for consistency
    const cacheKey = CACHE_KEYS.CURRENT_PRICES;
    
    // Check cache first
    const cached = globalCache.get<Record<string, number>>(cacheKey);
    if (cached) {
      console.log(`Using cached current prices for ${assetIds.length} assets`);
      // Return only the requested assets from cache
      const result: Record<string, number> = {};
      for (const assetId of assetIds) {
        if (cached[assetId] !== undefined) {
          result[assetId] = cached[assetId];
        }
      }
      return result;
    }

    // Check if already loading
    if (this.loadingPromises.has(cacheKey)) {
      console.log(`Waiting for ongoing price fetch for ${assetIds.length} assets`);
      return this.loadingPromises.get(cacheKey)!;
    }

    // Start loading
    const loadingPromise = this.fetchCurrentPricesFromAPI(assetIds);
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const result = await loadingPromise;
      // The API route will handle caching, so we don't need to cache here
      return result;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  // Get token logos with global caching
  async getTokenLogos(assetIds: AssetId[]): Promise<Record<string, string>> {
    // Use a consistent cache key for logos
    const cacheKey = `${CACHE_KEYS.TOKEN_LOGOS}_${assetIds.sort().join('_')}`;
    
    // Check cache first
    const cached = globalCache.get<Record<string, string>>(cacheKey);
    if (cached) {
      console.log(`Using cached logos for ${assetIds.length} assets`);
      return cached;
    }

    // Check if already loading
    if (this.loadingPromises.has(cacheKey)) {
      console.log(`Waiting for ongoing logo fetch for ${assetIds.length} assets`);
      return this.loadingPromises.get(cacheKey)!;
    }

    // Start loading
    const loadingPromise = this.fetchTokenLogosFromAPI(assetIds);
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const result = await loadingPromise;
      globalCache.set(cacheKey, result, CACHE_TTL.TOKEN_LOGOS);
      return result;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  // Preload all common assets data
  async preloadCommonAssets(): Promise<void> {
    const commonAssets: AssetId[] = [
      'bitcoin', 'ethereum', 'usd-coin', 'tether', 'solana',
      'pepe', 'polkadot', 'aave', 'chainlink', 'fartcoin'
    ];

    console.log('Preloading data for common assets...');
    
    // Load prices and logos in parallel
    await Promise.all([
      this.getCurrentPrices(commonAssets),
      this.getTokenLogos(commonAssets)
    ]);

    console.log('Common assets data preloaded successfully');
  }

  // Private methods to fetch from APIs
  private async fetchCurrentPricesFromAPI(assetIds: AssetId[]): Promise<Record<string, number>> {
    // Use the working CoinGecko-based API instead of the broken Alchemy current-prices endpoint
    const response = await fetch('/api/alchemy/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        assetIds,
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
        endDate: new Date().toISOString().split('T')[0] // today
      })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch current prices');
    }

    const priceData = await response.json();
    const result: Record<string, number> = {};
    
    // Extract the most recent price for each asset
    for (const [assetId, prices] of Object.entries(priceData)) {
      if (Array.isArray(prices) && prices.length > 0) {
        const latestPrice = prices[prices.length - 1] as { price: number };
        result[assetId] = latestPrice.price;
      }
    }
    
    return result;
  }

  private async fetchTokenLogosFromAPI(assetIds: AssetId[]): Promise<Record<string, string>> {
    const response = await fetch('/api/alchemy/token-metadata-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetIds })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch token logos');
    }

    return response.json();
  }

  // Get cache statistics
  getCacheStats() {
    return globalCache.getStats();
  }

  // Clear cache (useful for testing or manual refresh)
  clearCache() {
    globalCache.clear();
    this.loadingPromises.clear();
  }
}

// Export singleton instance
export const dataService = DataService.getInstance();
