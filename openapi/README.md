# OpenAPI Specifications

This directory contains OpenAPI 3.0 specifications for different API versions.

## Files

- **v1.0.0.yaml**: Legacy API version using snake_case field names
- **v2.0.0.yaml**: Current API version using camelCase field names

## Key Differences Between v1 and v2

### Field Naming Convention

| v1 (snake_case)  | v2 (camelCase) |
|------------------|----------------|
| `user_id`        | `id`           |
| `full_name`      | `name`         |
| `user_name`      | `username`     |
| `email_address`  | `email`        |
| `phone_number`   | `phone`        |

### Structural Changes

None - the structure remains the same, only field names changed.

## Using These Specs

### Generate Transformations

```bash
npm run generate:transformations openapi/v1.0.0.yaml openapi/v2.0.0.yaml
```

This will analyze the differences and generate JSONata transformation expressions.

### Validate Specs

```bash
# Using openapi-validator (install separately)
npx @redocly/cli lint openapi/v1.0.0.yaml
npx @redocly/cli lint openapi/v2.0.0.yaml
```

### Generate Documentation

```bash
# Using Redoc (install separately)
npx @redocly/cli build-docs openapi/v2.0.0.yaml -o docs/api-v2.html
```

## Adding New Versions

1. Create a new spec file: `openapi/v3.0.0.yaml`
2. Generate transformations for all version pairs:
   ```bash
   npm run generate:transformations openapi/v1.0.0.yaml openapi/v3.0.0.yaml
   npm run generate:transformations openapi/v2.0.0.yaml openapi/v3.0.0.yaml
   ```
3. Update [transformations/config.json](../transformations/config.json) with the new version
4. Test and deploy

## Best Practices

1. **Semantic Versioning**: Use major.minor.patch format
2. **Breaking Changes**: Only in major versions (v1 → v2)
3. **Deprecation**: Announce 6 months before removing old versions
4. **Documentation**: Keep specs in sync with actual API
5. **Validation**: Validate specs in CI/CD pipeline
