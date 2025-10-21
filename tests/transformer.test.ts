/**
 * Transformer Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  JsonataTransformer,
  createLogger,
  validateExpression,
  createPassthroughExpression,
} from '../src/transformer';
import type { TransformationExpression } from '../src/types';

describe('JsonataTransformer', () => {
  let transformer: JsonataTransformer;

  beforeEach(() => {
    transformer = new JsonataTransformer({
      cacheSize: 10,
      defaultTimeout: 100,
      logger: createLogger('error'), // Suppress logs during tests
    });
  });

  describe('transform', () => {
    it('should perform simple field mapping', async () => {
      const expression: TransformationExpression = {
        expression: '{ "newField": oldField }',
      };

      const input = { oldField: 'test value' };

      const result = await transformer.transform(input, expression, {
        fromVersion: 'v1',
        toVersion: 'v2',
        direction: 'request',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ newField: 'test value' });
    });

    it('should handle array transformations', async () => {
      const expression: TransformationExpression = {
        expression: '$map($, function($item) { { "id": $item.user_id } })',
      };

      const input = [{ user_id: 1 }, { user_id: 2 }];

      const result = await transformer.transform(input, expression, {
        fromVersion: 'v1',
        toVersion: 'v2',
        direction: 'request',
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as any)[0]).toEqual({ id: 1 });
      expect((result.data as any)[1]).toEqual({ id: 2 });
    });

    it('should handle pass-through transformation', async () => {
      const expression = createPassthroughExpression();
      const input = { test: 'data' };

      const result = await transformer.transform(input, expression, {
        fromVersion: 'v2',
        toVersion: 'v2',
        direction: 'request',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    it('should handle transformation errors gracefully', async () => {
      const expression: TransformationExpression = {
        expression: '{ invalid syntax',
      };

      const result = await transformer.transform({}, expression, {
        fromVersion: 'v1',
        toVersion: 'v2',
        direction: 'request',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return metrics', async () => {
      const expression: TransformationExpression = {
        expression: '$',
      };

      const result = await transformer.transform({}, expression, {
        fromVersion: 'v1',
        toVersion: 'v2',
        direction: 'request',
      });

      expect(result.metrics).toBeDefined();
      expect(result.metrics?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics?.fromVersion).toBe('v1');
      expect(result.metrics?.toVersion).toBe('v2');
    });

    it('should cache compiled expressions', async () => {
      const expression: TransformationExpression = {
        expression: '{ "test": value }',
        cacheTtl: 60,
      };

      // First call
      const result1 = await transformer.transform(
        { value: 1 },
        expression,
        {
          fromVersion: 'v1',
          toVersion: 'v2',
          direction: 'request',
        }
      );

      // Second call should use cached expression
      const result2 = await transformer.transform(
        { value: 2 },
        expression,
        {
          fromVersion: 'v1',
          toVersion: 'v2',
          direction: 'request',
        }
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(transformer.getCacheStats().size).toBeGreaterThan(0);
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      transformer.clearCache();
      expect(transformer.getCacheStats().size).toBe(0);
    });

    it('should provide cache statistics', () => {
      const stats = transformer.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
    });
  });
});

describe('validateExpression', () => {
  it('should validate correct expressions', () => {
    const result = validateExpression('{ "test": value }');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should detect invalid expressions', () => {
    const result = validateExpression('{ invalid }');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('createLogger', () => {
  it('should create logger with correct level', () => {
    const logger = createLogger('debug');
    expect(logger).toHaveProperty('debug');
    expect(logger).toHaveProperty('info');
    expect(logger).toHaveProperty('warn');
    expect(logger).toHaveProperty('error');
  });
});
