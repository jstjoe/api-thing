# TypeScript Configuration

This project uses a dual TypeScript configuration approach to separate build concerns from type checking.

## Configuration Files

### `tsconfig.json` - Main Configuration
Used for:
- IDE/editor intellisense and type checking
- The `npm run type-check` command
- Checking all files including `src/`, `tools/`, and `tests/`

Key settings:
- `noEmit: true` - No compilation output, just type checking
- Includes all TypeScript files in the project
- No `rootDir` restriction

### `tsconfig.build.json` - Build Configuration
Used for:
- Building type declarations if needed
- The `npm run build:types` command
- Type checking only the worker source code

Key settings:
- Extends `tsconfig.json`
- `rootDir: "./src"` - Only compiles worker code
- `outDir: "./dist"` - Output for type declarations
- Includes only `src/**/*`
- Excludes `tests/` and `tools/`

## Build Process

### Worker Bundle (`npm run build`)
```bash
node build.js
```

Uses **esbuild** to:
- Bundle `src/worker.ts` and dependencies
- Transpile TypeScript (faster than tsc)
- Minify code for production
- Generate source maps
- Output: `dist/worker.js`

**Why esbuild instead of tsc?**
- Much faster (10-100x)
- Better for bundling worker code
- Native to Cloudflare Workers tooling
- TypeScript checking happens separately

### Type Checking

```bash
# Check all files (src + tools + tests)
npm run type-check

# Check only worker source code
npm run type-check:build
```

### Type Declarations (Optional)

```bash
# Generate .d.ts files for src/
npm run build:types
```

## Tool Scripts

Scripts in `tools/` are executed directly with `tsx`:

```bash
npm run generate:transformations  # tsx tools/generate-jsonata.ts
npm run validate:transformations  # tsx tools/validate-transformations.ts
npm run upload:config             # tsx tools/deploy.ts
```

**tsx** runs TypeScript files directly without compilation:
- Type checking at runtime
- No build step needed
- Perfect for CLI tools

## Test Files

Tests in `tests/` use Vitest:

```bash
npm test           # Run tests
npm run test:watch # Watch mode
```

Vitest handles TypeScript automatically, no compilation needed.

## Workflow

### Development
```bash
npm run dev        # Starts wrangler dev with hot reload
```

Wrangler calls `npm run build` which uses esbuild only.

### Before Commit
```bash
npm run type-check # Type check everything
npm test           # Run tests
```

### Production Build
```bash
npm run build      # Bundle worker with esbuild
npm run deploy     # Deploy to Cloudflare
```

## Why This Approach?

### Problem with Single Config
The original setup had:
```json
{
  "rootDir": "./src",
  "include": ["src/**/*", "tools/**/*", "tests/**/*"]
}
```

This caused errors because `rootDir` requires all included files to be under `src/`, but we include `tools/` and `tests/`.

### Solution
1. **Main tsconfig.json**: No `rootDir`, checks all files
2. **tsconfig.build.json**: Has `rootDir: ./src`, only for building worker
3. **Build process**: Uses esbuild (not tsc) for bundling
4. **Tools/Tests**: Run directly with tsx/vitest

### Benefits
- ✅ Clean separation of concerns
- ✅ Fast builds with esbuild
- ✅ Type checking for all files
- ✅ Tools run without compilation
- ✅ Tests run without compilation
- ✅ No conflicting `rootDir` issues

## CI/CD Integration

```yaml
# .github/workflows/deploy.yml
- name: Type Check
  run: npm run type-check

- name: Run Tests
  run: npm test

- name: Build Worker
  run: npm run build

- name: Deploy
  run: npm run deploy:production
```

## Troubleshooting

### Error: File not under rootDir
If you see this error, make sure:
1. `wrangler.toml` uses `build` script (not directly calling tsc)
2. `package.json` build script is `node build.js` (not `tsc && node build.js`)

### Type Errors in Editor
Run:
```bash
npm run type-check
```

The editor uses `tsconfig.json` which checks all files.

### Build Failures
Check esbuild output:
```bash
npm run build
```

For type errors in build:
```bash
npm run type-check:build
```

## References

- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [esbuild Documentation](https://esbuild.github.io/)
- [Wrangler Custom Builds](https://developers.cloudflare.com/workers/wrangler/custom-builds/)
