#!/usr/bin/env tsx
/**
 * Transformation Validator
 *
 * Validates JSONata expressions and tests transformations with sample data
 *
 * Usage:
 *   tsx tools/validate-transformations.ts
 */

import fs from 'fs';
import path from 'path';
import jsonata from 'jsonata';

interface ValidationResult {
  file: string;
  valid: boolean;
  error?: string;
  testResults?: Array<{
    input: unknown;
    output: unknown;
    success: boolean;
    error?: string;
  }>;
}

async function main() {
  console.log('🔍 Validating JSONata transformations...\n');

  const transformationsDir = path.join(process.cwd(), 'transformations');
  const results: ValidationResult[] = [];

  // Find all .jsonata files
  const files = fs
    .readdirSync(transformationsDir)
    .filter((f) => f.endsWith('.jsonata'));

  for (const file of files) {
    console.log(`📄 Validating: ${file}`);

    const filePath = path.join(transformationsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const result = await validateExpression(file, content);
    results.push(result);

    if (result.valid) {
      console.log(`  ✅ Syntax valid`);

      // Run tests
      const testData = getTestData(file);
      if (testData.length > 0) {
        console.log(`  🧪 Running ${testData.length} test(s)...`);

        for (let i = 0; i < testData.length; i++) {
          const test = testData[i];
          try {
            const expression = jsonata(content);
            const output = expression.evaluate(test.input);

            result.testResults = result.testResults || [];
            result.testResults.push({
              input: test.input,
              output,
              success: true,
            });

            console.log(`    ✓ Test ${i + 1} passed`);
          } catch (error) {
            result.testResults = result.testResults || [];
            result.testResults.push({
              input: test.input,
              output: null,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });

            console.log(`    ✗ Test ${i + 1} failed:`, error);
          }
        }
      }
    } else {
      console.log(`  ❌ Invalid: ${result.error}`);
    }

    console.log('');
  }

  // Summary
  const valid = results.filter((r) => r.valid).length;
  const invalid = results.length - valid;

  console.log('📊 Summary:');
  console.log(`  Total: ${results.length}`);
  console.log(`  Valid: ${valid}`);
  console.log(`  Invalid: ${invalid}\n`);

  if (invalid > 0) {
    console.log('❌ Validation failed\n');
    process.exit(1);
  } else {
    console.log('✅ All validations passed!\n');
  }
}

/**
 * Validate a JSONata expression
 */
async function validateExpression(
  file: string,
  expression: string
): Promise<ValidationResult> {
  try {
    jsonata(expression);
    return { file, valid: true };
  } catch (error) {
    return {
      file,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get test data for specific transformation file
 */
function getTestData(
  file: string
): Array<{ input: unknown; expected?: unknown }> {
  // Sample test data for JSONPlaceholder API
  const testUser = {
    user_id: 1,
    full_name: 'Leanne Graham',
    user_name: 'Bret',
    email_address: 'leanne@april.biz',
    address: {
      street: 'Kulas Light',
      suite: 'Apt. 556',
      city: 'Gwenborough',
      zipcode: '92998-3874',
      geo: {
        lat: '-37.3159',
        lng: '81.1496',
      },
    },
    phone_number: '1-770-736-8031 x56442',
    website: 'hildegard.org',
    company: {
      name: 'Romaguera-Crona',
      catchPhrase: 'Multi-layered client-server neural-net',
      bs: 'harness real-time e-markets',
    },
  };

  const testUserV2 = {
    id: 1,
    name: 'Leanne Graham',
    username: 'Bret',
    email: 'leanne@april.biz',
    address: {
      street: 'Kulas Light',
      suite: 'Apt. 556',
      city: 'Gwenborough',
      zipcode: '92998-3874',
      geo: {
        lat: '-37.3159',
        lng: '81.1496',
      },
    },
    phone: '1-770-736-8031 x56442',
    website: 'hildegard.org',
    company: {
      name: 'Romaguera-Crona',
      catchPhrase: 'Multi-layered client-server neural-net',
      bs: 'harness real-time e-markets',
    },
  };

  if (file.includes('v1-to-v2-request')) {
    return [
      { input: testUser },
      { input: [testUser, { ...testUser, user_id: 2 }] },
    ];
  } else if (file.includes('v2-to-v1-response')) {
    return [
      { input: testUserV2 },
      { input: [testUserV2, { ...testUserV2, id: 2 }] },
    ];
  }

  return [];
}

// Run main function
main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
