/**
 * Configuration Loader
 *
 * Handles loading transformation configurations from Cloudflare KV
 * with fallback to inline/default configurations.
 */

import type {
  TransformationConfig,
  VersionTransformation,
  ApiVersion,
  Logger,
  Env,
} from './types';

/**
 * Configuration cache with TTL
 */
interface ConfigCache {
  config: TransformationConfig;
  cachedAt: number;
  ttl: number;
}

/**
 * Configuration loader with KV integration
 */
export class ConfigLoader {
  private cache: ConfigCache | null = null;
  private logger: Logger;
  private env: Env;

  constructor(env: Env, logger: Logger) {
    this.env = env;
    this.logger = logger;
  }

  /**
   * Load transformation configuration
   * Priority: Cache → KV → Inline Default
   */
  async loadConfig(): Promise<TransformationConfig> {
    // Check cache first
    if (this.cache && this.isCacheValid(this.cache)) {
      this.logger.debug('Using cached configuration');
      return this.cache.config;
    }

    try {
      // Try loading from KV
      const kvConfig = await this.loadFromKV();
      if (kvConfig) {
        this.cacheConfig(kvConfig);
        this.logger.info('Loaded configuration from KV');
        return kvConfig;
      }
    } catch (error) {
      this.logger.warn('Failed to load from KV, using default config:', error);
    }

    // Fallback to default configuration
    const defaultConfig = this.getDefaultConfig();
    this.cacheConfig(defaultConfig);
    this.logger.info('Using default configuration');
    return defaultConfig;
  }

  /**
   * Load configuration from Cloudflare KV
   */
  private async loadFromKV(): Promise<TransformationConfig | null> {
    const configKey = 'config:main';

    try {
      const configJson = await this.env.TRANSFORMATIONS.get(configKey, 'text');

      if (!configJson) {
        this.logger.debug('No configuration found in KV');
        return null;
      }

      const config = JSON.parse(configJson) as TransformationConfig;
      this.validateConfig(config);
      return config;
    } catch (error) {
      this.logger.error('Error loading from KV:', error);
      return null;
    }
  }

  /**
   * Load specific transformation expression from KV
   */
  async loadExpression(key: string): Promise<string | null> {
    try {
      const expression = await this.env.TRANSFORMATIONS.get(key, 'text');
      if (expression) {
        this.logger.debug(`Loaded expression from KV: ${key}`);
      }
      return expression;
    } catch (error) {
      this.logger.error(`Failed to load expression ${key}:`, error);
      return null;
    }
  }

  /**
   * Get transformation for a specific version
   */
  async getVersionTransformation(
    version: ApiVersion
  ): Promise<VersionTransformation | null> {
    const config = await this.loadConfig();
    const transformation = config.transformations[version];

    if (!transformation) {
      this.logger.warn(`No transformation found for version: ${version}`);
      return null;
    }

    // Load expression content from KV if it's a reference
    if (transformation.request.expression.startsWith('kv:')) {
      const key = transformation.request.expression.replace('kv:', '');
      const expression = await this.loadExpression(key);
      if (expression) {
        transformation.request.expression = expression;
      }
    }

    if (transformation.response.expression.startsWith('kv:')) {
      const key = transformation.response.expression.replace('kv:', '');
      const expression = await this.loadExpression(key);
      if (expression) {
        transformation.response.expression = expression;
      }
    }

    return transformation;
  }

  /**
   * Check if version is supported
   */
  async isSupportedVersion(version: ApiVersion): Promise<boolean> {
    const config = await this.loadConfig();
    return version in config.transformations;
  }

  /**
   * Get supported versions for a specific route
   */
  async getSupportedVersions(path: string): Promise<ApiVersion[]> {
    const config = await this.loadConfig();

    // Check route-specific configuration
    if (config.routing && config.routing[path]) {
      return config.routing[path];
    }

    // Return all available versions
    return Object.keys(config.transformations);
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: TransformationConfig): void {
    if (!config.version) {
      throw new Error('Configuration missing version field');
    }

    if (!config.defaultVersion) {
      throw new Error('Configuration missing defaultVersion field');
    }

    if (!config.transformations || typeof config.transformations !== 'object') {
      throw new Error('Configuration missing transformations object');
    }

    // Validate each transformation
    for (const [version, transformation] of Object.entries(
      config.transformations
    )) {
      if (!transformation.request || !transformation.response) {
        throw new Error(
          `Invalid transformation for version ${version}: missing request or response`
        );
      }

      if (
        !transformation.request.expression ||
        !transformation.response.expression
      ) {
        throw new Error(
          `Invalid transformation for version ${version}: missing expressions`
        );
      }
    }
  }

  /**
   * Cache configuration
   */
  private cacheConfig(config: TransformationConfig): void {
    const ttl = parseInt(this.env.CACHE_TTL_SECONDS || '3600', 10) * 1000;

    this.cache = {
      config,
      cachedAt: Date.now(),
      ttl,
    };
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(cache: ConfigCache): boolean {
    const now = Date.now();
    return now - cache.cachedAt < cache.ttl;
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.cache = null;
    this.logger.info('Configuration cache cleared');
  }

  /**
   * Get default/fallback configuration
   */
  private getDefaultConfig(): TransformationConfig {
    return {
      version: '1.0.0',
      defaultVersion: 'v2',
      upstreamVersion: 'v2',
      transformations: {
        v1: {
          request: {
            expression: `{
              "id": user_id,
              "name": full_name,
              "username": user_name,
              "email": email_address
            }`,
            description: 'Transform v1 request to v2 format',
            cacheTtl: 3600,
          },
          response: {
            expression: `{
              "user_id": id,
              "full_name": name,
              "user_name": username,
              "email_address": email,
              "location": address
            }`,
            description: 'Transform v2 response back to v1 format',
            cacheTtl: 3600,
          },
          targetVersion: 'v2',
        },
        v2: {
          request: {
            expression: '$', // Pass-through
            description: 'No transformation (current version)',
          },
          response: {
            expression: '$', // Pass-through
            description: 'No transformation (current version)',
          },
          targetVersion: 'v2',
        },
      },
      routing: {
        '/users': ['v1', 'v2'],
        '/posts': ['v1', 'v2'],
        '/comments': ['v1', 'v2'],
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'default-config',
      },
    };
  }

  /**
   * Hot reload configuration from KV
   */
  async reload(): Promise<TransformationConfig> {
    this.clearCache();
    return this.loadConfig();
  }
}

/**
 * Create a configuration loader instance
 */
export function createConfigLoader(
  env: Env,
  logger: Logger
): ConfigLoader {
  return new ConfigLoader(env, logger);
}
