# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **JSONata API Gateway** for Cloudflare Workers that transforms API requests/responses between different OpenAPI specification versions using declarative JSONata expressions. The gateway acts as a transparent proxy that allows maintaining a single upstream API (v2) while supporting legacy client versions (v1) through automatic field-level transformations.

## Core Architecture

### Three-Layer System

1. **Worker Layer** (`src/worker.ts`)
   - Main Cloudflare Workers entry point
   - Detects API version from: header (`API-Version`), query param (`?api-version=v1`), or path prefix (`/v1/...`)
   - Routes requests through transformation pipeline
   - Handles errors and returns transformed responses

2. **Transformation Engine** (`src/transformer.ts`)
   - Compiles and caches JSONata expressions (LRU cache, configurable TTL)
   - Executes transformations with timeout protection (default 50ms)
   - Provides bidirectional transformation (request: v1→v2, response: v2→v1)
   - Returns metrics (duration, success/failure) for monitoring

3. **Configuration Loader** (`src/config-loader.ts`)
   - Loads transformation configs from Cloudflare KV with fallback to defaults
   - Caches configuration in memory (TTL-based)
   - Supports hot-reload without worker redeployment
   - Maps routes to supported API versions

### Data Flow

```
Client (v1) → Worker → Transform Request (v1→v2) → Upstream API (v2)
                          ↓
Client (v1) ← Transform Response (v2→v1) ← Upstream API (v2)
```

Key: Worker always calls upstream API in v2 format. Transformations are only applied for non-default versions.

## Development Commands

### Essential Commands

```bash
# Start local development server (hot reload enabled)
pnpm run dev

# Build worker bundle (uses esbuild, not tsc)
pnpm run build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check all files (src + tools + tests)
pnpm run type-check

# Type check only worker source code
pnpm run type-check:build
```

### Testing the Gateway

```bash
# Test v2 API (default, no transformation)
curl http://localhost:8787/users/1

# Test v1 API (with JSONata transformation)
curl -H "API-Version: v1" http://localhost:8787/users/1

# Compare outputs side-by-side
curl -s http://localhost:8787/users/1 | jq '{id, name, email}'
curl -s -H "API-Version: v1" http://localhost:8787/users/1 | jq '{user_id, full_name, email_address}'
```

Expected: v2 uses camelCase (`id`, `name`), v1 uses snake_case (`user_id`, `full_name`).

### Transformation Tools

```bash
# Validate JSONata expressions syntax and run tests
pnpm run validate:transformations

# Generate JSONata from OpenAPI spec comparison
pnpm run generate:transformations openapi/v1.yaml openapi/v2.yaml

# Upload configuration to Cloudflare KV
pnpm run upload:config -- --env dev
```

### Deployment

```bash
# Deploy to dev environment
pnpm run deploy

# Deploy to staging
pnpm run deploy:staging

# Deploy to production
pnpm run deploy:production
```

## TypeScript Configuration (CRITICAL)

This project uses **dual TypeScript configs** to separate build from type checking:

- **`tsconfig.json`**: Type checks ALL files (`src/`, `tools/`, `tests/`) with `noEmit: true`. No `rootDir` restriction. Used by IDEs and `pnpm run type-check`.

- **`tsconfig.build.json`**: Only for building worker code. Has `rootDir: "./src"`, includes only `src/**/*`. Used by `pnpm run build:types` (optional).

**Build Process**: The build uses **esbuild directly** (not tsc) via `build.js`. This is critical because:
- esbuild is 10-100x faster than tsc
- It transpiles TypeScript and bundles in one step
- Avoids `rootDir` conflicts with tools/tests directories

**If you see errors like "File not under rootDir"**: The build script is incorrectly calling `tsc`. It should only call `node build.js`. See `docs/TYPESCRIPT_SETUP.md` for full details.

## JSONata Transformations

### Writing Transformations

JSONata files are in `transformations/*.jsonata`. Key patterns:

```jsonata
// Simple field mapping
{ "id": user_id, "name": full_name }

// Handle arrays OR single objects
$isArray($) ?
  $map($, function($item) { { "id": $item.user_id } })
:
  { "id": $.user_id }

// Conditional logic
$exists(premium) ? { "tier": "premium" } : { "tier": "basic" }
```

**Testing JSONata**: Use [try.jsonata.org](https://try.jsonata.org) to test expressions interactively before deploying.

### Configuration Schema

`transformations/config.json` structure:

```json
{
  "version": "1.0.0",
  "defaultVersion": "v2",          // Latest API version
  "upstreamVersion": "v2",         // What upstream API speaks
  "transformations": {
    "v1": {
      "request": {
        "expression": "...",       // JSONata or "kv:path/to/file.jsonata"
        "cacheTtl": 3600
      },
      "response": { ... }
    }
  },
  "routing": {
    "/users": ["v1", "v2"]         // Supported versions per route
  }
}
```

## Key Implementation Details

### Request Handling (`src/worker.ts`)

**Critical Fix**: For GET requests, do NOT set `body: undefined` or force `Content-Type: application/json`. This causes upstream APIs to reject requests. The code now:
- Only sets `Content-Type` header when there's a request body
- Uses `body: null` instead of `body: undefined` for empty bodies

### Expression Caching (`src/transformer.ts`)

- LRU cache with configurable max size (default 100 expressions)
- TTL-based expiration (from config or default 3600s)
- Cache key is first 100 chars of expression (production should use hash)
- Call `clearCache()` to force reload

### Version Detection Priority

1. `API-Version` or `X-API-Version` header
2. `?api-version=v1` or `?version=v1` query parameter
3. Path prefix extraction (e.g., `/v1/users` → v1)
4. Falls back to `config.defaultVersion`

## File Structure

```
src/
  worker.ts           # Main entry point, request routing
  transformer.ts      # JSONata engine with caching
  config-loader.ts    # KV configuration management
  types.ts            # TypeScript definitions

transformations/
  config.json                # Transformation metadata
  v1-to-v2-request.jsonata  # Request transformations
  v2-to-v1-response.jsonata # Response transformations

tools/
  generate-jsonata.ts        # OpenAPI → JSONata generator
  validate-transformations.ts # Expression validator
  deploy.ts                  # KV upload automation

tests/
  transformer.test.ts        # Transformation engine tests
  config-loader.test.ts      # Config loader tests

docs/
  DEPLOYMENT.md              # Production deployment guide
  JSONATA_EXAMPLES.md        # Transformation patterns
  QUICKSTART.md              # 5-minute getting started
  TROUBLESHOOTING.md         # Common issues and solutions
  TYPESCRIPT_SETUP.md        # Build system explanation
```

## Common Patterns

### Adding a New API Version

1. Create OpenAPI spec: `openapi/v3.0.0.yaml`
2. Generate transformations: `pnpm run generate:transformations openapi/v2.yaml openapi/v3.yaml`
3. Add to `transformations/config.json`:
   ```json
   "v3": {
     "request": { "expression": "$" },
     "response": { "expression": "$" }
   }
   ```
4. Validate: `pnpm run validate:transformations`
5. Deploy: `pnpm run build && pnpm run deploy`

### Debugging Transformation Issues

1. Enable debug logging in `wrangler.toml`: `LOG_LEVEL = "debug"`
2. Check worker logs: `wrangler tail` (in separate terminal)
3. Validate expression: `pnpm run validate:transformations`
4. Test expression at [try.jsonata.org](https://try.jsonata.org)
5. Check response headers: `curl -v http://localhost:8787/users/1`

### Modifying Worker Code

When editing `src/worker.ts`, `src/transformer.ts`, or `src/config-loader.ts`:

1. Make changes
2. Run type check: `pnpm run type-check`
3. Run tests: `pnpm test`
4. Rebuild: `pnpm run build`
5. Test locally: `pnpm run dev` (auto-rebuilds on save)

## Environment Variables

Set in `wrangler.toml` `[vars]` section:

- `UPSTREAM_API`: Upstream API base URL (e.g., `https://jsonplaceholder.typicode.com`)
- `LOG_LEVEL`: Logging verbosity (`debug` | `info` | `warn` | `error`)
- `TRANSFORMATION_TIMEOUT_MS`: Max time for transformation (default `50`)
- `CACHE_TTL_SECONDS`: Config cache duration (default `3600`)

## Testing Strategy

- **Unit Tests**: Mock KV namespace, test transformation logic in isolation
- **Integration Tests**: Not yet implemented (would test against real upstream API)
- **Validation Tests**: `validate:transformations` tests JSONata syntax + sample data

When writing tests for KV operations, cast mocks with `as any` to bypass strict typing:
```typescript
const mockKV = { get: vi.fn() };
(mockKV.get as any).mockResolvedValue(null);
```

## Important Notes

- **No KV Required for Dev**: The worker falls back to inline config from `src/config-loader.ts` when KV is not available. This allows local development without Cloudflare KV setup.

- **Pass-through for Current Version**: When `apiVersion === config.upstreamVersion`, no transformation occurs (pass-through). This is optimized with expression check: `expression === '$'`.

- **Tools Run with tsx**: Scripts in `tools/` use `tsx` to run TypeScript directly without compilation. Don't try to compile them with `tsc`.

- **Error Response Format**: Always includes `X-Request-ID` header for tracing. Check this header when debugging production issues.

## Documentation References

- Full README: `README.md`
- Quick Start: `docs/QUICKSTART.md` (get running in 5 minutes)
- Production Deployment: `docs/DEPLOYMENT.md`
- TypeScript Setup: `docs/TYPESCRIPT_SETUP.md` (dual-config explanation)
- JSONata Examples: `docs/JSONATA_EXAMPLES.md` (20+ transformation patterns)
- Troubleshooting: `docs/TROUBLESHOOTING.md` (common issues and fixes)

## Performance Targets

- Transformation overhead: <1ms for simple field mappings
- Complex transformations: <10ms for nested/array operations
- Worker cold start: <5ms
- Memory usage: <20MB per worker instance
- Throughput: 1000+ req/s per worker
