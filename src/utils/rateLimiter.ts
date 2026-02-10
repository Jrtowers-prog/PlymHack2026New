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
    return fn();
  }

  /** Check if a call can be made right now without waiting */
  canProceed(): boolean {
    this.cleanup();
    return this.timestamps.length < this.maxCalls;
  }

  /** How many calls have been made in the current window */
  get currentCount(): number {
    this.cleanup();
    return this.timestamps.length;
  }

  private async waitForSlot(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.cleanup();
      if (this.timestamps.length < this.maxCalls) {
        return;
      }
      // Wait until the oldest timestamp expires
      const oldestTimestamp = this.timestamps[0];
      const waitTime = oldestTimestamp + this.windowMs - Date.now() + 10;
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      this.cleanup();
      if (this.timestamps.length < this.maxCalls) {
        return;
      }
    }
  }

