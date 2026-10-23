import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

/**
 * CacheService
 * ------------
 * Caches arbitrary JSON-serialisable values in Redis with a TTL. The
 * interesting part is the in-process **single-flight** layer: when N
 * concurrent requests arrive for the same `key`, only one loader
 * invocation runs and the rest await the same promise. This prevents
 * the cache-stampede the API was hitting under read-heavy load (#107).
 *
 * Failure semantics (best-effort cache, reliable data path):
 *   - If Redis READ fails → bypass cache, run loader, do not throw.
 *   - If loader throws → propagate the error to every waiter; do NOT
 *     cache the failure.
 *   - If Redis WRITE fails → log warning, still return the fresh value.
 *   - If Redis is unreachable → each request becomes a direct DB call,
 *     which is the same behaviour as before this PR (#107).
 */
@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly logger = new Logger(CacheService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly namespace =
    process.env.CACHE_NAMESPACE?.trim() || 'stellarhunts';
  private hits = 0;
  private misses = 0;
  private invalidationVersion = 0;

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Get a cached value, or compute it via `loader` and store the result.
   *
   * @param key             cache key (use a namespace prefix per feature).
   * @param baseTtlSeconds  TTL before expiration; small randomised jitter
   *                        is added to avoid synchronized stampedes.
   * @param jitterSeconds   additional random TTL on top of `baseTtlSeconds`.
   * @param loader          function that returns the fresh value.
   */
  async getOrSet<T>(
    key: string,
    baseTtlSeconds: number,
    loader: () => Promise<T>,
    jitterSeconds: number = 10,
  ): Promise<T> {
    const scopedKey = `${this.namespace}:${key}`;
    const invalidationVersion = this.invalidationVersion;

    // 1. Try Redis first.
    let cached: string | null = null;
    try {
      cached = await this.redis.get(scopedKey);
    } catch (err) {
      this.logger.warn(
        `Redis READ failed for key "${key}": ${(err as Error).message}. Falling through to loader.`,
      );
    }
    if (cached !== null) {
      try {
        const value = JSON.parse(cached) as T;
        this.hits += 1;
        return value;
      } catch (err) {
        // Corrupt cache entry — drop it and fall through to the loader.
        this.logger.warn(
          `Redis returned non-JSON for key "${key}": ${(err as Error).message}.`,
        );
      }
    }
    this.misses += 1;

    // 2. Single-flight: piggyback on the in-flight promise if one exists.
    const existing = this.inFlight.get(scopedKey);
    if (existing) {
      return existing as Promise<T>;
    }

    // 3. We're the chosen loader for this key. Wrap loader() so that:
    //    - errors propagate cleanly to every waiter (#107);
    //    - on success, we write to Redis (best-effort) and then return;
    //    - the key always leaves `inFlight`, success or failure.
    const promise = (async () => {
      try {
        const fresh = await loader();
        try {
          const ttl =
            baseTtlSeconds +
            Math.floor(Math.random() * Math.max(1, jitterSeconds));
          if (invalidationVersion === this.invalidationVersion) {
            await this.redis.set(scopedKey, JSON.stringify(fresh), 'EX', ttl);
          }
        } catch (err) {
          this.logger.warn(
            `Redis WRITE failed for key "${key}": ${(err as Error).message}. Returning value without caching.`,
          );
        }
        return fresh;
      } finally {
        this.inFlight.delete(scopedKey);
      }
    })();

    this.inFlight.set(scopedKey, promise);
    return promise as Promise<T>;
  }

  /** Invalidate one or more namespaced cache keys. */
  async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    this.invalidationVersion += 1;
    try {
      await this.redis.del(...keys.map((key) => `${this.namespace}:${key}`));
    } catch (err) {
      this.logger.warn(`Redis DEL failed: ${(err as Error).message}.`);
    }
  }

  /** Invalidate all keys whose feature-specific key starts with `prefix`. */
  async invalidatePrefix(prefix: string): Promise<void> {
    this.invalidationVersion += 1;
    try {
      const keys = await this.redis.keys(`${this.namespace}:${prefix}*`);
      if (keys.length > 0) await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(`Redis prefix invalidation failed: ${(err as Error).message}.`);
    }
  }

  /** Snapshot suitable for a metrics endpoint or periodic metrics exporter. */
  getMetrics(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  /** Test/observability helper: number of in-flight loaders right now. */
  inflightCount(): number {
    return this.inFlight.size;
  }

  /**
   * Graceful shutdown hook — release the Redis connection so the event
   * loop can drain and the process can exit. The underlying client uses
   * `lazyConnect`, so it may be in the `wait` (never connected) or `end`
   * (already closed) state; in those cases there is nothing to quit.
   */
  async onApplicationShutdown(): Promise<void> {
    const status = this.redis.status;
    try {
      if (status === 'ready') {
        await this.redis.quit();
      } else if (status !== 'end') {
        // 'wait' | 'connecting' | 'reconnecting' — tear down without a
        // round-trip to a server we never fully connected to.
        this.redis.disconnect();
      }
      this.logger.log(`Redis connection closed (status was "${status}").`);
    } catch (err) {
      this.logger.warn(
        `Redis disconnect failed (status "${status}"): ${(err as Error).message}`,
      );
    }
  }
}
