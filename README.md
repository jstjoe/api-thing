# JSONata API Gateway

A production-ready Cloudflare Workers API gateway that uses JSONata expressions to declaratively transform API requests and responses between different OpenAPI specifications.

## Features

- **Declarative Transformations**: Use JSONata expressions instead of imperative code
- **OpenAPI-Driven**: Generate transformations automatically from OpenAPI spec diffs
- **High Performance**: <1ms transformation overhead for simple mappings
- **Edge Deployment**: Runs on Cloudflare Workers with global distribution
- **Hot Reloadable**: Update transformations without redeploying the worker
- **Type Safe**: Full TypeScript support with type definitions
- **Comprehensive Testing**: Unit and integration tests included
- **Developer Friendly**: Rich CLI tools for generation, validation, and deployment

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│   Client    │      │  CF Worker       │      │  Upstream   │
│   (v1 API)  │─────▶│  + JSONata       │─────▶│  API (v2)   │
│             │◀─────│  Transformations │◀─────│             │
└─────────────┘      └──────────────────┘      └─────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ Cloudflare KV   │
                     │ (Transform      │
                     │  Configs)       │
                     └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers access
- Wrangler CLI installed (`npm install -g wrangler`)

### Installation

```bash
# Clone or navigate to the project
cd api-thing

# Install dependencies
pnpm install

# Login to Cloudflare
wrangler login
```

### Development

```bash
# Run locally
pnpm run dev

# Test the API
curl http://localhost:8787/users/1
curl -H "API-Version: v1" http://localhost:8787/users/1
```

### Deployment

```bash
# Validate transformations
pnpm run validate:transformations

# Build the worker
pnpm run build

# Deploy to dev environment
pnpm run deploy

# Deploy to production
pnpm run deploy:production
```

## JSONata Transformations

### Example: Simple Field Mapping

Transform v1 field names to v2:

```jsonata
{
  "id": user_id,
  "name": full_name,
  "email": email_address
}
```

### Example: Nested Object Restructuring

```jsonata
{
  "user": {
    "id": $.userId,
    "profile": {
      "name": $.name,
      "email": $.email
    }
  },
  "metadata": {
    "created": $toMillis($.createdAt),
    "active": $.status = "active"
  }
}
```

### Example: Array Transformations

```jsonata
$map(users, function($user) {
  {
    "id": $user.user_id,
    "name": $user.full_name,
    "isActive": $user.status = "active"
  }
})
```

## Configuration

### Transformation Config (`transformations/config.json`)

```json
{
  "version": "1.0.0",
  "defaultVersion": "v2",
  "upstreamVersion": "v2",
  "transformations": {
    "v1": {
      "request": {
        "expression": "kv:transformations/v1-to-v2-request.jsonata",
        "description": "Transform v1 request to v2",
        "cacheTtl": 3600
      },
      "response": {
        "expression": "kv:transformations/v2-to-v1-response.jsonata",
        "description": "Transform v2 response to v1",
        "cacheTtl": 3600
      }
    }
  },
  "routing": {
    "/users": ["v1", "v2"],
    "/posts": ["v1", "v2"]
  }
}
```

## CLI Tools

### Generate Transformations from OpenAPI

Automatically generate JSONata expressions by comparing OpenAPI specs:

```bash
pnpm run generate:transformations openapi/v1.yaml openapi/v2.yaml
```

Output:
- `transformations/v1-to-v2-request.jsonata`
- `transformations/v2-to-v1-response.jsonata`
- `transformations/config.json`

### Validate Transformations

Test JSONata expressions with sample data:

```bash
pnpm run validate:transformations
```

### Deploy to Cloudflare

Upload configurations to KV and deploy worker:

```bash
# Deploy to dev
pnpm run upload:config -- --env dev
pnpm run deploy

# Deploy to production
pnpm run upload:config -- --env production
pnpm run deploy:production
```

## API Version Detection

The gateway detects the API version from multiple sources (in order of priority):

1. **Header**: `API-Version: v1` or `X-API-Version: v1`
2. **Query Parameter**: `?api-version=v1` or `?version=v1`
3. **Path Prefix**: `/v1/users` (extracts `v1`)
4. **Default**: Falls back to `defaultVersion` from config

## Project Structure

```
api-thing/
├── src/
│   ├── worker.ts              # Main Cloudflare Worker
│   ├── transformer.ts         # JSONata transformation engine
│   ├── config-loader.ts       # KV configuration loader
│   └── types.ts               # TypeScript definitions
├── transformations/
│   ├── config.json            # Transformation configuration
│   ├── v1-to-v2-request.jsonata
│   └── v2-to-v1-response.jsonata
├── tools/
│   ├── generate-jsonata.ts    # OpenAPI → JSONata generator
│   ├── validate-transformations.ts
│   └── deploy.ts              # Deployment automation
├── tests/
│   ├── transformer.test.ts
│   └── config-loader.test.ts
├── openapi/                   # OpenAPI specifications
├── wrangler.toml              # Cloudflare Workers config
├── package.json
└── README.md
```

## Performance

Target metrics:

- **Transformation Overhead**: <1ms for simple field mappings
- **Complex Transformations**: <10ms for nested/array operations
- **Cold Start**: <5ms worker initialization
- **Memory**: <20MB per worker instance
- **Throughput**: 1000+ req/s per worker

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm run test:watch

# Integration tests
pnpm run test:integration

# Type checking
pnpm run type-check
```

## Monitoring

The gateway includes built-in observability:

- Request ID tracking (`X-Request-ID` header)
- Version usage metrics
- Transformation performance metrics
- Error logging with context
- Cloudflare Analytics integration

## Supported JSONata Features

- **Path navigation**: `address.city`, `users[0].name`
- **Array operations**: `$map()`, `$filter()`, `$reduce()`
- **Predicates**: `users[age > 18]`
- **Aggregation**: `$sum()`, `$count()`, `$average()`
- **String functions**: `$uppercase()`, `$substring()`, `$contains()`
- **Conditionals**: `status = 'active' ? 'yes' : 'no'`
- **Object construction**: `{ "newField": oldField }`
- **Type coercion**: `$number()`, `$string()`, `$boolean()`

## Advanced Usage

### Custom Functions

Add custom JSONata functions in your configuration:

```json
{
  "customFunctions": {
    "formatDate": "function($date) { $fromMillis($toMillis($date), '[Y0001]-[M01]-[D01]') }"
  }
}
```

### Conditional Transformations

Different transformations based on data:

```jsonata
$exists(premium) ?
  { "type": "premium", "features": premium.features }
:
  { "type": "basic", "features": [] }
```

### Nested Array Processing

```jsonata
{
  "users": users.$map(function($u) {
    {
      "id": $u.userId,
      "posts": $u.posts.$map(function($p) {
        { "title": $p.postTitle, "date": $p.createdAt }
      })
    }
  })
}
```

## Troubleshooting

### Transformation Errors

Check the logs for detailed error messages:

```bash
wrangler tail --env production
```

### Cache Issues

Clear the cache by reloading the configuration:

```bash
# This will be handled automatically on next request
# Or manually trigger via API endpoint
curl -X POST https://your-worker.workers.dev/__reload
```

### Performance Optimization

1. **Keep expressions simple**: Complex expressions slow down transformation
2. **Use caching**: Set appropriate `cacheTtl` values
3. **Minimize KV calls**: Store expressions inline when possible
4. **Profile transformations**: Use the metrics in responses

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run validation: `pnpm test && pnpm run validate:transformations`
6. Submit a pull request

## Resources

- [JSONata Documentation](https://docs.jsonata.org/)
- [JSONata Exerciser](https://try.jsonata.org/) - Interactive playground
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)

## License

MIT

## Support

For issues and questions:
- Open an issue on GitHub
- Check the [implementation_guide.md](./implementation_guide.md) for detailed architecture
- Review example transformations in [transformations/](./transformations/)
