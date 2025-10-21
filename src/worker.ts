/**
 * JSONata API Gateway - Cloudflare Worker
 *
 * Main entry point for the API gateway that transforms requests and responses
 * between different API versions using JSONata expressions.
 */

import { JsonataTransformer, createLogger } from './transformer';
import { createConfigLoader } from './config-loader';
import type {
  Env,
  RequestContext,
  ApiVersion,
  Logger,
} from './types';

/**
 * Main request handler
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const logger = createLogger(env.LOG_LEVEL || 'info');
    const requestId = crypto.randomUUID();

    try {
      // Parse request context
      const context = await parseRequestContext(request, requestId, logger);

      // Initialize services
      const configLoader = createConfigLoader(env, logger);
      const transformer = new JsonataTransformer({
        defaultTimeout: parseInt(env.TRANSFORMATION_TIMEOUT_MS || '50', 10),
        logger,
      });

      // Load configuration
      const config = await configLoader.loadConfig();

      // Determine API version (header > query > path > default)
      const apiVersion = context.apiVersion || config.defaultVersion;

      logger.info(
        `[${requestId}] ${context.method} ${context.path} - Version: ${apiVersion}`
      );

      // Check if version is supported
      if (!(await configLoader.isSupportedVersion(apiVersion))) {
        return createErrorResponse(
          {
            error: 'Unsupported API version',
            message: `Version '${apiVersion}' is not supported`,
            supportedVersions: await configLoader.getSupportedVersions(
              context.path
            ),
          },
          400,
          apiVersion
        );
      }

      // Get transformation configuration for this version
      const versionTransform = await configLoader.getVersionTransformation(
        apiVersion
      );

      if (!versionTransform) {
        return createErrorResponse(
          {
            error: 'Configuration error',
            message: `No transformation found for version '${apiVersion}'`,
          },
          500,
          apiVersion
        );
      }

      // Transform request body (if applicable)
      let upstreamBody = context.body;
      if (
        context.body &&
        apiVersion !== config.upstreamVersion &&
        versionTransform.request.expression !== '$'
      ) {
        const transformResult = await transformer.transform(
          context.body,
          versionTransform.request,
          {
            fromVersion: apiVersion,
            toVersion: config.upstreamVersion,
            direction: 'request',
          }
        );

        if (!transformResult.success) {
          logger.error(
            `[${requestId}] Request transformation failed:`,
            transformResult.error
          );
          return createErrorResponse(
            {
              error: 'Request transformation failed',
              message: transformResult.error || 'Unknown transformation error',
            },
            400,
            apiVersion
          );
        }

        upstreamBody = transformResult.data;
        logger.debug(
          `[${requestId}] Request transformed in ${transformResult.metrics?.durationMs}ms`
        );
      }

      // Forward request to upstream API
      const upstreamUrl = new URL(context.url.pathname + context.url.search, env.UPSTREAM_API);

      // Build headers
      const upstreamHeaders: Record<string, string> = {
        'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
        'X-Request-ID': requestId,
      };

      // Only add Content-Type if we have a body
      if (upstreamBody) {
        upstreamHeaders['Content-Type'] = 'application/json';
      }

      const upstreamRequest = new Request(upstreamUrl, {
        method: context.method,
        headers: upstreamHeaders,
        body: upstreamBody ? JSON.stringify(upstreamBody) : null,
      });

      const upstreamResponse = await fetch(upstreamRequest);

      // Parse upstream response
      let responseData: unknown;
      const contentType = upstreamResponse.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        try {
          responseData = await upstreamResponse.json();
        } catch {
          responseData = null;
        }
      } else {
        // Non-JSON response, pass through
        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: {
            ...Object.fromEntries(upstreamResponse.headers),
            'X-API-Version': apiVersion,
            'X-Request-ID': requestId,
          },
        });
      }

      // Transform response (if needed)
      let transformedResponse = responseData;
      if (
        responseData &&
        apiVersion !== config.upstreamVersion &&
        versionTransform.response.expression !== '$'
      ) {
        const transformResult = await transformer.transform(
          responseData,
          versionTransform.response,
          {
            fromVersion: config.upstreamVersion,
            toVersion: apiVersion,
            direction: 'response',
          }
        );

        if (!transformResult.success) {
          logger.error(
            `[${requestId}] Response transformation failed:`,
            transformResult.error
          );
          // Return original response on transformation failure
          transformedResponse = responseData;
        } else {
          transformedResponse = transformResult.data;
          logger.debug(
            `[${requestId}] Response transformed in ${transformResult.metrics?.durationMs}ms`
          );
        }
      }

      // Return transformed response
      return new Response(JSON.stringify(transformedResponse, null, 2), {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Version': apiVersion,
          'X-Upstream-Version': config.upstreamVersion,
          'X-Request-ID': requestId,
          'X-Powered-By': 'JSONata-API-Gateway',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      logger.error(`[${requestId}] Unhandled error:`, error);

      return createErrorResponse(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : String(error),
          requestId,
        },
        500
      );
    }
  },
};

/**
 * Parse request context
 */
async function parseRequestContext(
  request: Request,
  requestId: string,
  logger: Logger
): Promise<RequestContext> {
  const url = new URL(request.url);

  // Detect API version from multiple sources
  let apiVersion: ApiVersion | undefined;

  // 1. Check header
  const versionHeader = request.headers.get('API-Version') ||
                       request.headers.get('X-API-Version');
  if (versionHeader) {
    apiVersion = versionHeader;
  }

  // 2. Check query parameter
  if (!apiVersion) {
    const versionParam = url.searchParams.get('api-version') ||
                        url.searchParams.get('version');
    if (versionParam) {
      apiVersion = versionParam;
    }
  }

  // 3. Check path prefix (e.g., /v1/users)
  if (!apiVersion) {
    const pathMatch = url.pathname.match(/^\/(v\d+)\//);
    if (pathMatch) {
      apiVersion = pathMatch[1];
    }
  }

  // Parse request body
  let body: unknown = null;
  if (
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    request.headers.get('content-type')?.includes('application/json')
  ) {
    try {
      body = await request.json();
    } catch (error) {
      logger.warn('Failed to parse request body:', error);
    }
  }

  return {
    url,
    method: request.method,
    headers: request.headers,
    apiVersion: apiVersion || '',
    path: url.pathname,
    body,
    requestId,
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  error: {
    error: string;
    message: string;
    [key: string]: unknown;
  },
  status: number,
  apiVersion?: string
): Response {
  return new Response(JSON.stringify(error, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(apiVersion && { 'X-API-Version': apiVersion }),
      'X-Powered-By': 'JSONata-API-Gateway',
    },
  });
}

/**
 * Handle CORS preflight requests
 * Note: Currently not used, but available for future CORS handling
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, API-Version, X-API-Version',
      'Access-Control-Max-Age': '86400',
    },
  });
}
/* eslint-enable @typescript-eslint/no-unused-vars */
