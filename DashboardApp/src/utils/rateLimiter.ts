/**
 * Rate limiter utility for preventing excessive API calls
 */
class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is allowed and record it if so
   * @returns true if request is allowed, false if rate limited
   */
  canMakeRequest(): boolean {
    const now = Date.now();
    
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    // Check if we've exceeded the limit
    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    // Record this request
    this.timestamps.push(now);
    return true;
  }

  /**
   * Get the time until the next request is allowed (in milliseconds)
   * @returns milliseconds until next request allowed, or 0 if allowed now
   */
  getTimeUntilNextRequest(): number {
    const now = Date.now();
    
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    if (this.timestamps.length < this.maxRequests) {
      return 0; // Can make request now
    }

    // Find the oldest timestamp in the window
    const oldestTimestamp = Math.min(...this.timestamps);
    const timeUntilOldestExpires = this.windowMs - (now - oldestTimestamp);
    
    return Math.max(0, timeUntilOldestExpires);
  }

  /**
   * Reset the rate limiter (clear all timestamps)
   */
  reset(): void {
    this.timestamps = [];
  }
}

/**
 * Create a rate limiter instance for refresh operations
 * Max 3 requests per 15 seconds
 */
export const refreshRateLimiter = new RateLimiter(3, 15000);

