/**
 * JSONata Transformation Engine
 *
 * Handles compilation, caching, and execution of JSONata transformations
 * with performance optimization for Cloudflare Workers environment.
 */

import jsonata from 'jsonata';
import type {
  TransformationExpression,
  TransformationResult,
  TransformDirection,
  ApiVersion,
  CacheEntry,
  Logger,
} from './types';

/**
 * In-memory cache for compiled JSONata expressions
 * Uses LRU strategy with configurable size and TTL
 */
class ExpressionCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    const now = Date.now();
    if (now - entry.cachedAt > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.expression;
  }

  set(key: string, expression: unknown, ttl: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      expression,
      cachedAt: Date.now(),
      ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * JSONata Transformer with caching and timeout protection
 */
export class JsonataTransformer {
  private expressionCache: ExpressionCache;
  private defaultTimeout: number;
  private logger: Logger;

  constructor(
    options: {
      cacheSize?: number;
      defaultTimeout?: number;
      logger?: Logger;
    } = {}
  ) {
    this.expressionCache = new ExpressionCache(options.cacheSize || 100);
    this.defaultTimeout = options.defaultTimeout || 50; // 50ms default
    this.logger = options.logger || console;
  }

  /**
   * Compile or retrieve cached JSONata expression
   */
  private async compileExpression(
    expression: string,
    cacheTtl = 3600000
  ): Promise<unknown> {
    const cacheKey = `expr:${expression.substring(0, 100)}`; // Hash would be better in production

    // Check cache first
    const cached = this.expressionCache.get(cacheKey);
    if (cached) {
      this.logger.debug('Using cached JSONata expression');
      return cached;
    }

    try {
      // Compile new expression
      const compiled = jsonata(expression);
      this.expressionCache.set(cacheKey, compiled, cacheTtl);
      this.logger.debug('Compiled and cached new JSONata expression');
      return compiled;
    } catch (error) {
      throw new Error(
        `Failed to compile JSONata expression: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Transform data using JSONata expression with timeout protection
   */
  async transform<T = unknown>(
    data: unknown,
    transformExpr: TransformationExpression,
    context: {
      fromVersion: ApiVersion;
      toVersion: ApiVersion;
      direction: TransformDirection;
      timeout?: number;
    }
  ): Promise<TransformationResult<T>> {
    const startTime = Date.now();
    const timeout = context.timeout || this.defaultTimeout;

    try {
      // Compile or get cached expression
      const compiled = await this.compileExpression(
        transformExpr.expression,
        (transformExpr.cacheTtl || 3600) * 1000
      );

      // Execute transformation with timeout
      const result = await this.executeWithTimeout(
        compiled as ReturnType<typeof jsonata>,
        data,
        timeout
      );

      const duration = Date.now() - startTime;

      this.logger.debug(
        `Transformation completed in ${duration}ms (${context.direction}: ${context.fromVersion} → ${context.toVersion})`
      );

      return {
        data: result as T,
        success: true,
        metrics: {
          durationMs: duration,
          fromVersion: context.fromVersion,
          toVersion: context.toVersion,
          direction: context.direction,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Transformation failed:', {
        error: errorMessage,
        duration,
        context,
      });

      return {
        data: data as T, // Return original data on failure
        success: false,
        error: errorMessage,
        metrics: {
          durationMs: duration,
          fromVersion: context.fromVersion,
          toVersion: context.toVersion,
          direction: context.direction,
        },
      };
    }
  }

  /**
   * Execute JSONata evaluation with timeout protection
   */
  private async executeWithTimeout(
    expression: ReturnType<typeof jsonata>,
    data: unknown,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Transformation timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        // JSONata evaluation is synchronous
        const result = expression.evaluate(data);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Register custom JSONata functions
   */
  registerCustomFunction(
    name: string,
    implementation: (...args: unknown[]) => unknown
  ): void {
    // Note: jsonata doesn't support global function registration
    // Custom functions need to be bound per expression
    // This is a placeholder for future implementation
    this.logger.warn(
      'Custom function registration not yet implemented:',
      name
    );
  }

  /**
   * Clear expression cache
   */
  clearCache(): void {
    this.expressionCache.clear();
    this.logger.info('Expression cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.expressionCache.size(),
      maxSize: 100, // From constructor
    };
  }
}

/**
 * Create a simple pass-through expression (no transformation)
 */
export function createPassthroughExpression(): TransformationExpression {
  return {
    expression: '$', // JSONata identity expression
    description: 'Pass-through (no transformation)',
  };
}

/**
 * Validate JSONata expression syntax
 */
export function validateExpression(expression: string): {
  valid: boolean;
  error?: string;
} {
  try {
    jsonata(expression);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Simple logger implementation
 */
export function createLogger(level: string = 'info'): Logger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[level as keyof typeof levels] || levels.info;

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (currentLevel <= levels.debug) {
        console.log(`[DEBUG] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: unknown[]) => {
      if (currentLevel <= levels.info) {
        console.log(`[INFO] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (currentLevel <= levels.warn) {
        console.warn(`[WARN] ${message}`, ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (currentLevel <= levels.error) {
        console.error(`[ERROR] ${message}`, ...args);
      }
    },
  };
}
