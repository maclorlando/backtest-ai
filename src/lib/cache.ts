// Global cache for API data to avoid duplicate requests
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class GlobalCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      } else {
        valid++;
      }
    }

    return { valid, expired, total: this.cache.size };
  }
}

// Global cache instance
export const globalCache = new GlobalCache();

// Cache keys
export const CACHE_KEYS = {
  CURRENT_PRICES: 'current_prices',
  TOKEN_LOGOS: 'token_logos',
  HISTORICAL_PRICES: (assetId: string, start: string, end: string) => 
    `historical_prices_${assetId}_${start}_${end}`,
} as const;

// Cache TTL constants
export const CACHE_TTL = {
  CURRENT_PRICES: 5 * 60 * 1000, // 5 minutes
  TOKEN_LOGOS: 24 * 60 * 60 * 1000, // 24 hours
  HISTORICAL_PRICES: 60 * 60 * 1000, // 1 hour
} as const;
