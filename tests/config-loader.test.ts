/**
 * ConfigLoader Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigLoader, createConfigLoader } from '../src/config-loader';
import { createLogger } from '../src/transformer';
import type { Env } from '../src/types';
import type { KVNamespace } from '@cloudflare/workers-types';

// Mock KV namespace
const createMockKV = (): KVNamespace => {
  const mockKV = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  };
  return mockKV as any;
};

describe('ConfigLoader', () => {
  let env: Env;
  let loader: ConfigLoader;
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();

    env = {
      TRANSFORMATIONS: mockKV,
      UPSTREAM_API: 'https://api.example.com',
      LOG_LEVEL: 'error',
      CACHE_TTL_SECONDS: '60',
    };

    loader = createConfigLoader(env, createLogger('error'));
  });

  describe('loadConfig', () => {
    it('should load default config when KV is empty', async () => {
      (mockKV.get as any).mockResolvedValue(null);

      const config = await loader.loadConfig();

      expect(config).toBeDefined();
      expect(config.version).toBeDefined();
      expect(config.transformations).toBeDefined();
    });

    it('should load config from KV', async () => {
      const mockConfig = {
        version: '1.0.0',
        defaultVersion: 'v2',
        upstreamVersion: 'v2',
        transformations: {
          v1: {
            request: { expression: '$' },
            response: { expression: '$' },
          },
        },
      };

      (mockKV.get as any).mockResolvedValue(
        JSON.stringify(mockConfig)
      );

      const config = await loader.loadConfig();

      expect(config).toEqual(mockConfig);
    });

    it('should cache loaded config', async () => {
      const mockConfig = {
        version: '1.0.0',
        defaultVersion: 'v2',
        upstreamVersion: 'v2',
        transformations: {
          v1: {
            request: { expression: '$' },
            response: { expression: '$' },
          },
        },
      };

      (mockKV.get as any).mockResolvedValue(
        JSON.stringify(mockConfig)
      );

      // First call
      await loader.loadConfig();

      // Second call should use cache
      await loader.loadConfig();

      // KV should only be called once
      expect(mockKV.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getVersionTransformation', () => {
    it('should return transformation for valid version', async () => {
      const transformation = await loader.getVersionTransformation('v1');

      expect(transformation).toBeDefined();
      expect(transformation?.request).toBeDefined();
      expect(transformation?.response).toBeDefined();
    });

    it('should return null for invalid version', async () => {
      const transformation = await loader.getVersionTransformation('v99');

      expect(transformation).toBeNull();
    });
  });

  describe('isSupportedVersion', () => {
    it('should return true for supported versions', async () => {
      const supported = await loader.isSupportedVersion('v1');
      expect(supported).toBe(true);
    });

    it('should return false for unsupported versions', async () => {
      const supported = await loader.isSupportedVersion('v99');
      expect(supported).toBe(false);
    });
  });

  describe('getSupportedVersions', () => {
    it('should return all versions', async () => {
      const versions = await loader.getSupportedVersions('/test');
      expect(versions.length).toBeGreaterThan(0);
    });

    it('should return route-specific versions if configured', async () => {
      const versions = await loader.getSupportedVersions('/users');
      expect(versions).toContain('v1');
      expect(versions).toContain('v2');
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await loader.loadConfig();
      loader.clearCache();

      // Next call should hit KV again
      await loader.loadConfig();

      expect(mockKV.get).toHaveBeenCalledTimes(2);
    });

    it('should reload config', async () => {
      await loader.loadConfig();

      const reloaded = await loader.reload();

      expect(reloaded).toBeDefined();
    });
  });
});
