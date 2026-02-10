/**
 * rateLimiter.ts
 *
 * Simple token-bucket rate limiter for API calls.
 * Ensures we don't exceed a maximum number of calls per time window.
 *
 * Usage:
 *   const limiter = new RateLimiter({ maxCalls: 10, windowMs: 60_000 });
 *   const result = await limiter.execute(() => fetch(url));
 */

interface RateLimiterConfig {
  /** Maximum number of calls allowed per window */
  maxCalls: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxCalls: number;
  private readonly windowMs: number;

  constructor(config: RateLimiterConfig) {
    this.maxCalls = config.maxCalls;
    this.windowMs = config.windowMs;
  }

  /**
   * Wait until a slot is available, then execute the function.
   * Ensures no more than `maxCalls` are made within `windowMs`.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot();
    this.timestamps.push(Date.now());
