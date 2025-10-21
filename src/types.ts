/**
 * Type definitions for the JSONata API Gateway
 */

import type { KVNamespace } from '@cloudflare/workers-types';

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  TRANSFORMATIONS: KVNamespace;
  UPSTREAM_API: string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  TRANSFORMATION_TIMEOUT_MS?: string;
  CACHE_TTL_SECONDS?: string;
}

/**
 * API version identifier
 */
export type ApiVersion = string; // e.g., 'v1', 'v2', '2024-01-15'

/**
 * Transformation direction
 */
export type TransformDirection = 'request' | 'response';

/**
 * JSONata expression metadata
 */
export interface TransformationExpression {
  /** JSONata expression string or reference to KV key */
  expression: string;
  /** Pre-compiled JSONata expression (cached in memory) */
  compiled?: unknown;
  /** Cache TTL in seconds */
  cacheTtl?: number;
  /** Description of what this transformation does */
  description?: string;
  /** Version when this transformation was added */
  since?: string;
}

/**
 * Transformation configuration for a specific API version
 */
export interface VersionTransformation {
  /** Transform incoming requests from this version to upstream version */
  request: TransformationExpression;
  /** Transform upstream responses back to this version */
  response: TransformationExpression;
  /** Target API version to transform to (usually latest) */
  targetVersion?: string;
}

/**
 * Complete transformation configuration
 */
export interface TransformationConfig {
  /** Config schema version */
  version: string;
  /** Default/latest API version */
  defaultVersion: string;
  /** Upstream API version */
  upstreamVersion: string;
  /** Transformations per version */
  transformations: Record<ApiVersion, VersionTransformation>;
  /** Route-specific transformation overrides */
  routing?: Record<string, ApiVersion[]>;
  /** Custom JSONata functions */
  customFunctions?: Record<string, string>;
  /** Metadata */
  metadata?: {
    generatedAt?: string;
    generatedBy?: string;
    sourceSpecs?: string[];
  };
}

/**
 * Transformation result
 */
export interface TransformationResult<T = unknown> {
  /** Transformed data */
  data: T;
  /** Transformation successful */
  success: boolean;
  /** Error message if transformation failed */
  error?: string;
  /** Performance metrics */
  metrics?: {
    durationMs: number;
    fromVersion: ApiVersion;
    toVersion: ApiVersion;
    direction: TransformDirection;
  };
}

/**
 * Request context
 */
export interface RequestContext {
  /** Original request URL */
  url: URL;
  /** HTTP method */
  method: string;
  /** Request headers */
  headers: Headers;
  /** API version from header/query/path */
  apiVersion: ApiVersion;
  /** Request path */
  path: string;
  /** Request body (if applicable) */
  body?: unknown;
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Transformation cache entry
 */
export interface CacheEntry {
  /** Compiled JSONata expression */
  expression: unknown;
  /** When this was cached */
  cachedAt: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * OpenAPI operation schema
 */
export interface OperationSchema {
  /** Request body schema */
  requestBody?: {
    content: {
      'application/json'?: {
        schema: JsonSchema;
      };
    };
  };
  /** Response schemas */
  responses?: {
    [statusCode: string]: {
      content?: {
        'application/json'?: {
          schema: JsonSchema;
        };
      };
    };
  };
}

/**
 * JSON Schema (simplified)
 */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  $ref?: string;
  required?: string[];
  enum?: unknown[];
  format?: string;
  description?: string;
}

/**
 * OpenAPI specification (simplified)
 */
export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, OperationSchema>>;
  components?: {
    schemas?: Record<string, JsonSchema>;
  };
}

/**
 * Schema comparison result
 */
export interface SchemaComparison {
  /** Fields renamed */
  renamed: Array<{ from: string; to: string; type: string }>;
  /** Fields added in new version */
  added: Array<{ field: string; type: string; required: boolean }>;
  /** Fields removed in new version */
  removed: Array<{ field: string; type: string }>;
  /** Type changes */
  typeChanged: Array<{ field: string; oldType: string; newType: string }>;
  /** Structural changes (nesting, flattening) */
  structural: Array<{ description: string; pattern: string }>;
}

/**
 * JSONata generation result
 */
export interface GenerationResult {
  /** Generated JSONata expression */
  expression: string;
  /** Comparison details */
  comparison: SchemaComparison;
  /** Confidence score (0-1) */
  confidence: number;
  /** Manual review required for complex cases */
  requiresReview: boolean;
  /** Comments/annotations */
  annotations: string[];
}
