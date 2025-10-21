#!/usr/bin/env tsx
/**
 * Deployment Tool
 *
 * Uploads transformation configurations and JSONata expressions to Cloudflare KV
 *
 * Usage:
 *   tsx tools/deploy.ts [--env dev|staging|production]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface DeployOptions {
  env: 'dev' | 'staging' | 'production';
  dryRun: boolean;
}

async function main() {
  const args = process.argv.slice(2);

  const options: DeployOptions = {
    env: 'dev',
    dryRun: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      options.env = args[i + 1] as DeployOptions['env'];
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }

  console.log('🚀 Deploying to Cloudflare Workers\n');
  console.log(`  Environment: ${options.env}`);
  console.log(`  Dry run: ${options.dryRun}\n`);

  // Load configuration
  const configPath = path.join(process.cwd(), 'transformations/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  console.log('📦 Configuration loaded:');
  console.log(`  Version: ${config.version}`);
  console.log(`  Default version: ${config.defaultVersion}`);
  console.log(
    `  Transformations: ${Object.keys(config.transformations).join(', ')}\n`
  );

  // Upload configuration to KV
  console.log('📤 Uploading to Cloudflare KV...\n');

  try {
    // Upload main config
    await uploadToKV(
      'config:main',
      JSON.stringify(config),
      options.env,
      options.dryRun
    );

    // Upload JSONata expressions
    const transformationsDir = path.join(process.cwd(), 'transformations');
    const files = fs.readdirSync(transformationsDir);

    for (const file of files) {
      if (file.endsWith('.jsonata')) {
        const filePath = path.join(transformationsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const key = `transformations/${file}`;

        await uploadToKV(key, content, options.env, options.dryRun);
      }
    }

    console.log('\n✅ Upload complete!\n');

    // Deploy worker
    if (!options.dryRun) {
      console.log('🔧 Deploying worker...\n');
      const deployCmd =
        options.env === 'production'
          ? 'wrangler deploy --env production'
          : options.env === 'staging'
          ? 'wrangler deploy --env staging'
          : 'wrangler deploy --env dev';

      execSync(deployCmd, { stdio: 'inherit' });
      console.log('\n✅ Worker deployed!\n');
    } else {
      console.log('ℹ️  Skipping worker deployment (dry run)\n');
    }

    console.log('🎉 Deployment complete!\n');
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

/**
 * Upload key-value pair to Cloudflare KV
 */
async function uploadToKV(
  key: string,
  value: string,
  env: string,
  dryRun: boolean
): Promise<void> {
  console.log(`  Uploading: ${key}`);

  if (dryRun) {
    console.log(`    (dry run - would upload ${value.length} bytes)`);
    return;
  }

  try {
    const cmd = `wrangler kv:key put --env ${env} --binding TRANSFORMATIONS "${key}" "${value.replace(/"/g, '\\"')}"`;
    execSync(cmd, { stdio: 'pipe' });
    console.log(`    ✓ Uploaded (${value.length} bytes)`);
  } catch (error) {
    console.error(`    ✗ Failed:`, error);
    throw error;
  }
}

// Run main function
main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
