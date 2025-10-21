/**
 * Build script for Cloudflare Workers
 *
 * Uses esbuild to bundle the worker with all dependencies
 * TypeScript is transpiled by esbuild (faster than tsc)
 */

import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

try {
  // Build the worker bundle
  await esbuild.build({
    entryPoints: ['./src/worker.ts'],
    bundle: true,
    outfile: './dist/worker.js',
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: process.env.NODE_ENV === 'production',
    sourcemap: true,
    external: [],
    define: {
      'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'production'}"`,
      'process.env.VERSION': `"${packageJson.version}"`,
    },
    banner: {
      js: '// JSONata API Gateway - Built with esbuild',
    },
    logLevel: 'info',
  });

  console.log('✅ Build complete!');
  console.log(`   Output: dist/worker.js`);
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
