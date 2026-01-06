/**
 * Client-side chart data cache service
 * Provides efficient caching, request deduplication, and smart invalidation
 * for chart data to minimize API calls and improve performance.
 */

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

interface PricePoint {
  timestamp: string;
  price: number;
  value?: number;
}

interface AssetPriceHistory {
  ticker: string;
  current_price: number | null;
  granularity: string;
  series: PricePoint[];
}

interface CacheEntry {
  data: AssetPriceHistory;
  timestamp: number; // When the data was fetched (milliseconds since epoch)
  expiresAt: number; // When the cache entry expires
}

interface PendingRequest {
  promise: Promise<AssetPriceHistory>;
  timestamp: number;
}

class ChartDataCache {
  private cache: Map<string, CacheEntry> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  
  // Cache expiration times (in milliseconds)
  private readonly CACHE_TTL: Record<TimeRange, number> = {
    '1W': 5 * 60 * 1000,      // 5 minutes for 1W (most volatile)
    '1M': 10 * 60 * 1000,     // 10 minutes for 1M
    '3M': 15 * 60 * 1000,     // 15 minutes for 3M
    '1Y': 30 * 60 * 1000,     // 30 minutes for 1Y
    'ALL': 60 * 60 * 1000,    // 1 hour for ALL (least volatile)
  };

  // Maximum cache size (number of entries)
  private readonly MAX_CACHE_SIZE = 50;

  /**
   * Generate cache key from ticker and time range
   */
  private getCacheKey(ticker: string, timeRange: TimeRange): string {
    return `${ticker.toUpperCase()}:${timeRange}`;
  }

  /**
   * Check if cache entry is valid (not expired)
   */
  private isValid(entry: CacheEntry): boolean {
    return Date.now() < entry.expiresAt;
  }

  /**
   * Get cached data if available and valid
   */
  get(ticker: string, timeRange: TimeRange): AssetPriceHistory | null {
    const key = this.getCacheKey(ticker, timeRange);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (!this.isValid(entry)) {
      // Expired entry - remove it
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in cache
   */
  set(ticker: string, timeRange: TimeRange, data: AssetPriceHistory): void {
    const key = this.getCacheKey(ticker, timeRange);
    const ttl = this.CACHE_TTL[timeRange];
    
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    };

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, entry);
  }

  /**
   * Evict the oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Invalidate cache entry for a specific ticker and time range
   */
  invalidate(ticker: string, timeRange?: TimeRange): void {
    if (timeRange) {
      const key = this.getCacheKey(ticker, timeRange);
      this.cache.delete(key);
    } else {
      // Invalidate all time ranges for this ticker
      const tickerUpper = ticker.toUpperCase();
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${tickerUpper}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: Array<{ key: string; age: number; expiresIn: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      expiresIn: entry.expiresAt - now,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Register a pending request to prevent duplicate API calls
   */
  registerPendingRequest(
    ticker: string,
    timeRange: TimeRange,
    promise: Promise<AssetPriceHistory>
  ): Promise<AssetPriceHistory> {
    const key = this.getCacheKey(ticker, timeRange);
    
    // Check if there's already a pending request
    const existing = this.pendingRequests.get(key);
    if (existing) {
      // Return existing promise if it's recent (within 5 seconds)
      const age = Date.now() - existing.timestamp;
      if (age < 5000) {
        return existing.promise;
      }
      // Otherwise, the previous request is stale, replace it
    }

    // Register new pending request
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
    });

    // Clean up pending request when it completes
    promise
      .then(() => {
        this.pendingRequests.delete(key);
      })
      .catch(() => {
        this.pendingRequests.delete(key);
      });

    return promise;
  }

  /**
   * Check if there's a pending request for this key
   */
  hasPendingRequest(ticker: string, timeRange: TimeRange): boolean {
    const key = this.getCacheKey(ticker, timeRange);
    const pending = this.pendingRequests.get(key);
    
    if (!pending) {
      return false;
    }

    // Check if pending request is still valid (within 10 seconds)
    const age = Date.now() - pending.timestamp;
    if (age > 10000) {
      this.pendingRequests.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired entries and stale pending requests
   */
  cleanup(): void {
    const now = Date.now();
    
    // Remove expired cache entries
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
      }
    }

    // Remove stale pending requests (older than 30 seconds)
    for (const [key, pending] of this.pendingRequests.entries()) {
      const age = now - pending.timestamp;
      if (age > 30000) {
        this.pendingRequests.delete(key);
      }
    }
  }
}

// Export singleton instance
export const chartDataCache = new ChartDataCache();

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    chartDataCache.cleanup();
  }, 5 * 60 * 1000);
}

