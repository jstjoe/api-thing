# Deployment Guide

Complete guide for deploying the JSONata API Gateway to Cloudflare Workers.

## Prerequisites

1. **Cloudflare Account**
   - Sign up at [cloudflare.com](https://cloudflare.com)
   - Enable Workers (free tier available)

2. **Domain** (optional for production)
   - Add your domain to Cloudflare
   - DNS managed by Cloudflare

3. **Development Environment**
   ```bash
   node --version  # v18 or higher
   npm --version   # v9 or higher
   ```

## Step 1: Configure Wrangler

### Login to Cloudflare

```bash
wrangler login
```

This opens a browser for authentication.

### Update wrangler.toml

Replace placeholder values in [wrangler.toml](./wrangler.toml):

```toml
# Update these fields
name = "your-gateway-name"

[env.production]
route = { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
```

## Step 2: Create KV Namespaces

### Development

```bash
wrangler kv:namespace create "TRANSFORMATIONS" --env dev
```

Copy the namespace ID to `wrangler.toml`:

```toml
[[env.dev.kv_namespaces]]
binding = "TRANSFORMATIONS"
id = "abc123..."  # Use the ID from command output
```

### Staging

```bash
wrangler kv:namespace create "TRANSFORMATIONS" --env staging
```

### Production

```bash
wrangler kv:namespace create "TRANSFORMATIONS" --env production
```

## Step 3: Configure Environment Variables

Edit [wrangler.toml](./wrangler.toml) to set your upstream API:

```toml
[vars]
UPSTREAM_API = "https://your-api.example.com"
LOG_LEVEL = "info"
```

### Secret Variables (optional)

For sensitive data like API keys:

```bash
# Development
wrangler secret put API_KEY --env dev

# Production
wrangler secret put API_KEY --env production
```

## Step 4: Prepare Transformations

### Option A: Use Existing Transformations

The project includes example transformations in [transformations/](./transformations/).

### Option B: Generate from OpenAPI Specs

```bash
# Place your OpenAPI specs in openapi/
npm run generate:transformations openapi/v1.yaml openapi/v2.yaml
```

### Validate Transformations

```bash
npm run validate:transformations
```

Expected output:
```
🔍 Validating JSONata transformations...

📄 Validating: v1-to-v2-request.jsonata
  ✅ Syntax valid
  🧪 Running 2 test(s)...
    ✓ Test 1 passed
    ✓ Test 2 passed

✅ All validations passed!
```

## Step 5: Deploy to Development

### Upload Configuration to KV

```bash
npm run upload:config -- --env dev
```

This uploads:
- `config.json` → KV key `config:main`
- All `.jsonata` files → KV keys `transformations/*.jsonata`

### Deploy Worker

```bash
npm run deploy
# or
wrangler deploy --env dev
```

### Test Deployment

```bash
# Get your worker URL from the deploy output
WORKER_URL="https://your-gateway.workers.dev"

# Test v2 (default, no transformation)
curl $WORKER_URL/users/1

# Test v1 (with transformation)
curl -H "API-Version: v1" $WORKER_URL/users/1

# Compare outputs
diff <(curl -s $WORKER_URL/users/1) \
     <(curl -s -H "API-Version: v1" $WORKER_URL/users/1)
```

## Step 6: Deploy to Staging

### Upload Configuration

```bash
npm run upload:config -- --env staging
```

### Deploy

```bash
npm run deploy:staging
```

### Smoke Tests

```bash
# Basic health check
curl https://api-staging.yourdomain.com/health

# Version test
curl -H "API-Version: v1" https://api-staging.yourdomain.com/users/1
curl -H "API-Version: v2" https://api-staging.yourdomain.com/users/1
```

## Step 7: Deploy to Production

### Pre-deployment Checklist

- [ ] All tests passing (`npm test`)
- [ ] Transformations validated (`npm run validate:transformations`)
- [ ] Staging deployment tested and working
- [ ] Monitoring/alerting configured
- [ ] Rollback plan prepared

### Upload Configuration

```bash
npm run upload:config -- --env production
```

### Deploy Worker

```bash
npm run deploy:production
```

### Verify Deployment

```bash
# Check worker is live
curl -I https://api.yourdomain.com/health

# Test transformations
curl -H "API-Version: v1" https://api.yourdomain.com/users/1
curl -H "API-Version: v2" https://api.yourdomain.com/users/1
```

## Step 8: Configure Monitoring

### Cloudflare Analytics

1. Go to Workers dashboard
2. Select your worker
3. View Analytics tab

### Custom Metrics

Add to [src/worker.ts](./src/worker.ts):

```typescript
// Log to external service
ctx.waitUntil(
  fetch('https://your-logging-service.com/log', {
    method: 'POST',
    body: JSON.stringify({
      requestId,
      version: apiVersion,
      duration: Date.now() - startTime,
      path: context.path,
    }),
  })
);
```

### Tail Logs

Watch real-time logs:

```bash
wrangler tail --env production
```

Filter by status:

```bash
wrangler tail --env production --status error
```

## Updating Transformations

### Without Redeploying Worker

Update only the transformations:

```bash
# Edit transformation files
vim transformations/v1-to-v2-request.jsonata

# Upload to KV
npm run upload:config -- --env production

# Configuration will be reloaded automatically based on CACHE_TTL_SECONDS
```

### With Worker Redeployment

For code changes:

```bash
npm run build
npm run deploy:production
```

## Rollback Strategy

### Quick Rollback

Revert to previous worker version:

```bash
# List deployments
wrangler deployments list --env production

# Rollback to specific version
wrangler rollback --env production --deployment-id abc123
```

### Configuration Rollback

```bash
# Restore previous config from backup
wrangler kv:key put --env production \
  --binding TRANSFORMATIONS \
  "config:main" \
  "$(cat backups/config-2024-01-20.json)"
```

## Performance Optimization

### 1. Bundle Size

Check bundle size:

```bash
npm run build
ls -lh dist/worker.js
```

Target: <1MB

### 2. Cache Tuning

Adjust cache TTL in [transformations/config.json](./transformations/config.json):

```json
{
  "transformations": {
    "v1": {
      "request": {
        "cacheTtl": 7200  // Increase for stable transformations
      }
    }
  }
}
```

### 3. Worker Limits

Configure resource limits in [wrangler.toml](./wrangler.toml):

```toml
[limits]
cpu_ms = 50  # CPU time limit per request
```

## Troubleshooting

### Error: "Namespace not found"

Create KV namespace:

```bash
wrangler kv:namespace create "TRANSFORMATIONS" --env production
```

### Error: "Transformation failed"

Check logs:

```bash
wrangler tail --env production --status error
```

Validate expression:

```bash
npm run validate:transformations
```

### High Latency

Profile transformations:

```bash
# Check X-Request-ID header in responses
curl -v https://api.yourdomain.com/users/1

# Review metrics in logs
wrangler tail --env production | grep metrics
```

### Cache Not Working

Clear worker cache:

```bash
# Update cache key in config
# Or force reload via API
curl -X POST https://api.yourdomain.com/__reload \
  -H "X-Admin-Key: your-secret"
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Validate transformations
        run: npm run validate:transformations

      - name: Deploy to Cloudflare
        run: npm run deploy:production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Best Practices

1. **Environment Parity**: Keep dev/staging/prod configs in sync
2. **Version Transformations**: Tag transformation configs in git
3. **Test Thoroughly**: Always test in staging first
4. **Monitor Actively**: Set up alerts for errors/latency
5. **Document Changes**: Update CHANGELOG.md for each deployment
6. **Backup Configs**: Store KV snapshots before major changes

## Security

### API Keys

Never commit secrets to git. Use Wrangler secrets:

```bash
wrangler secret put API_KEY --env production
```

### Rate Limiting

Add rate limiting in [src/worker.ts](./src/worker.ts):

```typescript
// Check rate limit
const rateLimitKey = `ratelimit:${clientIP}`;
const requests = await env.TRANSFORMATIONS.get(rateLimitKey);
if (parseInt(requests || '0') > 1000) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

### Authentication

Add authentication header validation:

```typescript
const apiKey = request.headers.get('X-API-Key');
if (!apiKey || apiKey !== env.API_KEY) {
  return new Response('Unauthorized', { status: 401 });
}
```

## Support

- Documentation: [README.md](./README.md)
- Issues: Open a GitHub issue
- Cloudflare Support: [workers-support@cloudflare.com](mailto:workers-support@cloudflare.com)
