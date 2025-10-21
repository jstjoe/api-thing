# Troubleshooting Guide

Common issues and their solutions.

## Issue: Getting `null` response from curl

**Symptoms:**
```bash
curl http://localhost:8787/users/1
null%
```

**Cause:**
The Request object was being created with `body: undefined` for GET requests, which can cause issues with the Fetch API. Also, forcing `Content-Type: application/json` for all requests (including GET) could cause upstream APIs to reject the request.

**Solution:**
Fixed in [src/worker.ts](./src/worker.ts:119-137):
- Only set `body` to non-null when there's actual data to send
- Only add `Content-Type` header when there's a body
- Use `null` instead of `undefined` for empty body

**After fixing, rebuild:**
```bash
npm run build
# Restart dev server (Ctrl+C, then npm run dev)
```

**Verify it works:**
```bash
# Should return JSON data
curl http://localhost:8787/users/1

# Should transform field names
curl -H "API-Version: v1" http://localhost:8787/users/1
```

## Issue: TypeScript build errors with rootDir

**Symptoms:**
```
error TS6059: File '/path/to/tests/file.test.ts' is not under 'rootDir'
```

**Solution:**
See [TYPESCRIPT_SETUP.md](./TYPESCRIPT_SETUP.md) - we use separate configs:
- `tsconfig.json` - For type checking all files
- `tsconfig.build.json` - For building only worker code

The build process uses esbuild directly, not tsc.

## Issue: Transformations not working

**Symptoms:**
- Both v1 and v2 return the same data
- Field names aren't being transformed

**Debug steps:**

1. **Check the logs:**
   ```bash
   # Look for transformation errors
   wrangler tail
   ```

2. **Verify transformation expressions:**
   ```bash
   npm run validate:transformations
   ```

3. **Check if KV is configured:**
   The default config in [src/config-loader.ts](./src/config-loader.ts) includes working transformations, so KV isn't required for basic testing.

4. **Test JSONata expression directly:**
   Go to [try.jsonata.org](https://try.jsonata.org) and test your expression with sample data.

## Issue: Worker won't start

**Symptoms:**
```
Error: Could not resolve "jsonata"
```

**Solution:**
```bash
# Clean install
rm -rf node_modules dist
npm install
npm run build
npm run dev
```

## Issue: KV namespace not found

**Symptoms:**
```
Error: KV namespace 'TRANSFORMATIONS' not found
```

**Solution:**
The worker falls back to default config when KV isn't available. For local development, this is fine. To set up KV:

```bash
# Create KV namespace
wrangler kv:namespace create "TRANSFORMATIONS" --preview

# Update wrangler.toml with the ID
[[kv_namespaces]]
binding = "TRANSFORMATIONS"
id = "YOUR_NAMESPACE_ID"
```

## Testing Checklist

When making changes, verify:

- [ ] Build succeeds: `npm run build`
- [ ] Type check passes: `npm run type-check`
- [ ] Tests pass: `npm test`
- [ ] Dev server starts: `npm run dev`
- [ ] v2 endpoint works: `curl http://localhost:8787/users/1`
- [ ] v1 transformation works: `curl -H "API-Version: v1" http://localhost:8787/users/1`
- [ ] Validation passes: `npm run validate:transformations`

## Quick Verification Script

```bash
#!/bin/bash
# test-gateway.sh

echo "Testing API Gateway..."

# Test v2 (default)
echo -e "\n=== V2 (no transformation) ==="
curl -s http://localhost:8787/users/1 | jq '{id, name, email}'

# Test v1 (with transformation)
echo -e "\n=== V1 (with transformation) ==="
curl -s -H "API-Version: v1" http://localhost:8787/users/1 | jq '{user_id, full_name, email_address}'

# Test array endpoint
echo -e "\n=== V2 Array ==="
curl -s http://localhost:8787/users | jq '.[0] | {id, name}'

echo -e "\n=== V1 Array ==="
curl -s -H "API-Version: v1" http://localhost:8787/users | jq '.[0] | {user_id, full_name}'
```

Make it executable:
```bash
chmod +x test-gateway.sh
./test-gateway.sh
```

## Common curl Examples

```bash
# Test default version (v2)
curl http://localhost:8787/users/1

# Test specific version via header
curl -H "API-Version: v1" http://localhost:8787/users/1

# Test with query parameter
curl "http://localhost:8787/users/1?api-version=v1"

# Test with verbose output
curl -v -H "API-Version: v1" http://localhost:8787/users/1

# Test array endpoint
curl http://localhost:8787/users

# Test with pretty JSON
curl -s http://localhost:8787/users/1 | jq .
```

## Performance Testing

```bash
# Test transformation performance
time curl -s -H "API-Version: v1" http://localhost:8787/users/1 > /dev/null

# Load test with ab (Apache Bench)
ab -n 1000 -c 10 http://localhost:8787/users/1

# Check bundle size
ls -lh dist/worker.js
```

## Debugging Tips

### Enable Debug Logging

Edit [wrangler.toml](./wrangler.toml):
```toml
[vars]
LOG_LEVEL = "debug"
```

Then restart dev server.

### Watch Logs

```bash
# In separate terminal
wrangler tail
```

### Inspect Request/Response

```bash
# See all headers
curl -v http://localhost:8787/users/1

# See specific headers
curl -I http://localhost:8787/users/1
```

### Test Transformation Locally

```bash
# Validate syntax
npm run validate:transformations

# Run tests
npm test
```

## Getting Help

1. Check this troubleshooting guide
2. Review [README.md](./README.md)
3. Check [QUICKSTART.md](./QUICKSTART.md)
4. Look at example transformations in [transformations/](./transformations/)
5. Test JSONata at [try.jsonata.org](https://try.jsonata.org)
6. Open an issue on GitHub
