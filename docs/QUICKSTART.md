# Quick Start Guide

Get the JSONata API Gateway running in 5 minutes.

## 1. Install Dependencies

```bash
npm install
```

## 2. Test Locally (Development Mode)

```bash
# Start the local development server
npm run dev
```

The worker will be available at `http://localhost:8787`

## 3. Try It Out

Open a new terminal and test the endpoints:

```bash
# Test v2 API (default, no transformation)
curl http://localhost:8787/users/1

# Test v1 API (with JSONata transformation)
curl -H "API-Version: v1" http://localhost:8787/users/1

# Compare the outputs
echo "=== V2 Response ===" && curl -s http://localhost:8787/users/1 | jq .
echo "=== V1 Response ===" && curl -s -H "API-Version: v1" http://localhost:8787/users/1 | jq .
```

You should see:
- **v2**: Field names like `id`, `name`, `email`
- **v1**: Field names like `user_id`, `full_name`, `email_address`

## 4. Customize Transformations

Edit the JSONata expressions in [transformations/](./transformations/):

```bash
# Edit request transformation
vim transformations/v1-to-v2-request.jsonata

# Edit response transformation
vim transformations/v2-to-v1-response.jsonata
```

### Example Change

Add a new computed field in `v2-to-v1-response.jsonata`:

```jsonata
{
  "user_id": $.id,
  "full_name": $.name,
  "email_address": $.email,
  "has_website": $exists($.website)  /* New field! */
}
```

Restart the dev server to see changes:
```bash
# Press Ctrl+C to stop
# Then restart
npm run dev
```

## 5. Validate Your Transformations

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

## 6. Test Transformations

Run the automated test suite:

```bash
npm test
```

## 7. Deploy to Cloudflare (Optional)

### Prerequisites

- Cloudflare account
- Wrangler CLI configured

### Deploy Steps

```bash
# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv:namespace create "TRANSFORMATIONS" --env dev

# Update wrangler.toml with the namespace ID from above

# Deploy
npm run deploy
```

Your gateway will be available at:
```
https://jsonata-api-gateway-dev.your-subdomain.workers.dev
```

## Common Tasks

### Add a New API Version

1. Create OpenAPI spec: `openapi/v3.0.0.yaml`
2. Generate transformations:
   ```bash
   npm run generate:transformations openapi/v2.0.0.yaml openapi/v3.0.0.yaml
   ```
3. Update `transformations/config.json`
4. Test and validate
5. Deploy

### Debug Transformation Issues

Enable debug logging:

```bash
# Edit wrangler.toml
[vars]
LOG_LEVEL = "debug"

# Restart dev server
npm run dev

# Watch logs
wrangler tail --env dev
```

### Test with Real Data

Use the included test fixtures:

```bash
# Create a test request
cat > test-request.json << EOF
{
  "user_id": 999,
  "full_name": "Test User",
  "email_address": "test@example.com"
}
EOF

# Send to local gateway
curl -X POST \
  -H "API-Version: v1" \
  -H "Content-Type: application/json" \
  -d @test-request.json \
  http://localhost:8787/users
```

### Update Upstream API

Edit the upstream API URL in `wrangler.toml`:

```toml
[vars]
UPSTREAM_API = "https://your-actual-api.com"
```

## Troubleshooting

### Issue: "Module not found"

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Issue: "KV namespace not found"

Create the namespace:
```bash
wrangler kv:namespace create "TRANSFORMATIONS" --env dev
```

Then update `wrangler.toml` with the ID.

### Issue: "Transformation failed"

Check the JSONata syntax:
```bash
npm run validate:transformations
```

Or test at [try.jsonata.org](https://try.jsonata.org)

### Issue: "Port 8787 already in use"

Kill the existing process:
```bash
lsof -ti:8787 | xargs kill -9
```

Or use a different port:
```bash
wrangler dev --port 8788
```

## Next Steps

- Read the full [README.md](./README.md)
- Check out [JSONATA_EXAMPLES.md](./JSONATA_EXAMPLES.md) for transformation patterns
- Review [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Explore [transformations/](./transformations/) for example expressions

## Getting Help

- 📖 [JSONata Documentation](https://docs.jsonata.org/)
- 🧪 [JSONata Exerciser](https://try.jsonata.org/)
- 📚 [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- 💬 Open an issue on GitHub

---

**Ready to go?** Start with `npm run dev` and try the curl commands above! 🚀
