#!/usr/bin/env tsx
/**
 * OpenAPI to JSONata Generator
 *
 * Analyzes two OpenAPI specifications and generates JSONata transformation
 * expressions to map between them.
 *
 * Usage:
 *   tsx tools/generate-jsonata.ts openapi/v1.yaml openapi/v2.yaml
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type {
  OpenApiSpec,
  JsonSchema,
  SchemaComparison,
  GenerationResult,
} from '../src/types';

interface FieldMapping {
  oldField: string;
  newField: string;
  type: string;
  confidence: number;
}

/**
 * Main generator function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx tools/generate-jsonata.ts <old-spec.yaml> <new-spec.yaml>');
    console.error('');
    console.error('Example:');
    console.error('  tsx tools/generate-jsonata.ts openapi/v1.yaml openapi/v2.yaml');
    process.exit(1);
  }

  const [oldSpecPath, newSpecPath] = args;

  console.log('🔍 Analyzing OpenAPI specifications...\n');
  console.log(`  Old: ${oldSpecPath}`);
  console.log(`  New: ${newSpecPath}\n`);

  // Load OpenAPI specs
  const oldSpec = loadSpec(oldSpecPath);
  const newSpec = loadSpec(newSpecPath);

  console.log('✅ Loaded specifications');
  console.log(`  Old version: ${oldSpec.info.version}`);
  console.log(`  New version: ${newSpec.info.version}\n`);

  // Compare schemas for each endpoint
  const transformations: Record<string, GenerationResult> = {};

  for (const [pathKey, pathItem] of Object.entries(oldSpec.paths)) {
    if (!newSpec.paths[pathKey]) {
      console.warn(`⚠️  Path ${pathKey} not found in new spec`);
      continue;
    }

    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const oldOp = (pathItem as any)[method];
      const newOp = (newSpec.paths[pathKey] as any)[method];

      if (!oldOp || !newOp) continue;

      console.log(`🔄 Processing ${method.toUpperCase()} ${pathKey}`);

      // Generate request transformation
      const requestResult = await generateTransformation(
        extractRequestSchema(oldOp),
        extractRequestSchema(newOp),
        'request'
      );

      // Generate response transformation
      const responseResult = await generateTransformation(
        extractResponseSchema(newOp),
        extractResponseSchema(oldOp),
        'response'
      );

      transformations[`${method}_${pathKey}`] = {
        expression: JSON.stringify(
          {
            request: requestResult.expression,
            response: responseResult.expression,
          },
          null,
          2
        ),
        comparison: requestResult.comparison,
        confidence: Math.min(requestResult.confidence, responseResult.confidence),
        requiresReview:
          requestResult.requiresReview || responseResult.requiresReview,
        annotations: [
          ...requestResult.annotations,
          ...responseResult.annotations,
        ],
      };
    }
  }

  // Output results
  console.log('\n📝 Generating transformation files...\n');

  const outputDir = path.join(process.cwd(), 'transformations');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write individual JSONata files
  const requestExpression = generateRequestJsonata(transformations);
  const responseExpression = generateResponseJsonata(transformations);

  fs.writeFileSync(
    path.join(outputDir, 'v1-to-v2-request.jsonata'),
    requestExpression
  );
  fs.writeFileSync(
    path.join(outputDir, 'v2-to-v1-response.jsonata'),
    responseExpression
  );

  // Write configuration file
  const config = {
    version: '1.0.0',
    defaultVersion: newSpec.info.version.split('.')[0] || 'v2',
    upstreamVersion: newSpec.info.version.split('.')[0] || 'v2',
    transformations: {
      [oldSpec.info.version.split('.')[0] || 'v1']: {
        request: {
          expression: requestExpression,
          description: `Transform ${oldSpec.info.version} request to ${newSpec.info.version}`,
          cacheTtl: 3600,
        },
        response: {
          expression: responseExpression,
          description: `Transform ${newSpec.info.version} response to ${oldSpec.info.version}`,
          cacheTtl: 3600,
        },
        targetVersion: newSpec.info.version.split('.')[0] || 'v2',
      },
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: 'generate-jsonata.ts',
      sourceSpecs: [oldSpecPath, newSpecPath],
    },
  };

  fs.writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  console.log('✅ Generated files:');
  console.log(`  ${path.join(outputDir, 'v1-to-v2-request.jsonata')}`);
  console.log(`  ${path.join(outputDir, 'v2-to-v1-response.jsonata')}`);
  console.log(`  ${path.join(outputDir, 'config.json')}`);
  console.log('\n✨ Done!\n');
}

/**
 * Load OpenAPI specification
 */
function loadSpec(filePath: string): OpenApiSpec {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath);

  if (ext === '.yaml' || ext === '.yml') {
    return YAML.parse(content);
  } else if (ext === '.json') {
    return JSON.parse(content);
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }
}

/**
 * Extract request schema from operation
 */
function extractRequestSchema(operation: any): JsonSchema | null {
  return (
    operation?.requestBody?.content?.['application/json']?.schema || null
  );
}

/**
 * Extract response schema from operation (200 response)
 */
function extractResponseSchema(operation: any): JsonSchema | null {
  return (
    operation?.responses?.['200']?.content?.['application/json']?.schema ||
    null
  );
}

/**
 * Generate transformation between two schemas
 */
async function generateTransformation(
  oldSchema: JsonSchema | null,
  newSchema: JsonSchema | null,
  direction: 'request' | 'response'
): Promise<GenerationResult> {
  if (!oldSchema || !newSchema) {
    return {
      expression: '$', // Pass-through
      comparison: {
        renamed: [],
        added: [],
        removed: [],
        typeChanged: [],
        structural: [],
      },
      confidence: 0,
      requiresReview: true,
      annotations: ['No schema available for comparison'],
    };
  }

  const comparison = compareSchemas(oldSchema, newSchema);
  const mappings = generateFieldMappings(comparison);

  // Build JSONata expression
  const expression = buildJsonataExpression(mappings, comparison);

  // Calculate confidence
  const confidence = calculateConfidence(comparison, mappings);

  // Determine if manual review is needed
  const requiresReview =
    confidence < 0.8 ||
    comparison.typeChanged.length > 0 ||
    comparison.structural.length > 0;

  // Generate annotations
  const annotations = generateAnnotations(comparison, mappings);

  return {
    expression,
    comparison,
    confidence,
    requiresReview,
    annotations,
  };
}

/**
 * Compare two JSON schemas
 */
function compareSchemas(
  oldSchema: JsonSchema,
  newSchema: JsonSchema
): SchemaComparison {
  const renamed: Array<{ from: string; to: string; type: string }> = [];
  const added: Array<{ field: string; type: string; required: boolean }> = [];
  const removed: Array<{ field: string; type: string }> = [];
  const typeChanged: Array<{ field: string; oldType: string; newType: string }> =
    [];

  const oldProps = oldSchema.properties || {};
  const newProps = newSchema.properties || {};

  const oldKeys = Object.keys(oldProps);
  const newKeys = Object.keys(newProps);

  // Find exact matches
  const exactMatches = new Set<string>();
  for (const key of oldKeys) {
    if (newProps[key]) {
      exactMatches.add(key);
      // Check for type changes
      if (oldProps[key].type !== newProps[key].type) {
        typeChanged.push({
          field: key,
          oldType: oldProps[key].type || 'unknown',
          newType: newProps[key].type || 'unknown',
        });
      }
    }
  }

  // Find renames (similar names, same types)
  const unmatchedOld = oldKeys.filter((k) => !exactMatches.has(k));
  const unmatchedNew = newKeys.filter((k) => !exactMatches.has(k));

  for (const oldKey of unmatchedOld) {
    const oldType = oldProps[oldKey].type;
    let bestMatch: { key: string; similarity: number } | null = null;

    for (const newKey of unmatchedNew) {
      const newType = newProps[newKey].type;
      if (oldType === newType) {
        const similarity = calculateSimilarity(oldKey, newKey);
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { key: newKey, similarity };
        }
      }
    }

    if (bestMatch && bestMatch.similarity > 0.5) {
      renamed.push({
        from: oldKey,
        to: bestMatch.key,
        type: oldType || 'unknown',
      });
      unmatchedNew.splice(unmatchedNew.indexOf(bestMatch.key), 1);
    } else {
      removed.push({ field: oldKey, type: oldType || 'unknown' });
    }
  }

  // Remaining unmatched new keys are additions
  for (const newKey of unmatchedNew) {
    added.push({
      field: newKey,
      type: newProps[newKey].type || 'unknown',
      required: newSchema.required?.includes(newKey) || false,
    });
  }

  return {
    renamed,
    added,
    removed,
    typeChanged,
    structural: [],
  };
}

/**
 * Calculate string similarity (simple Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/_/g, '').replace(/-/g, '');

  const s1 = normalize(str1);
  const s2 = normalize(str2);

  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Simple overlap check
  const overlap = [...s1].filter((c) => s2.includes(c)).length;
  return overlap / Math.max(s1.length, s2.length);
}

/**
 * Generate field mappings
 */
function generateFieldMappings(comparison: SchemaComparison): FieldMapping[] {
  return comparison.renamed.map((r) => ({
    oldField: r.from,
    newField: r.to,
    type: r.type,
    confidence: 1.0,
  }));
}

/**
 * Build JSONata expression from mappings
 */
function buildJsonataExpression(
  mappings: FieldMapping[],
  comparison: SchemaComparison
): string {
  if (mappings.length === 0 && comparison.added.length === 0) {
    return '$'; // Identity transformation
  }

  // Build object constructor
  const fields: string[] = [];

  for (const mapping of mappings) {
    fields.push(`  "${mapping.newField}": ${mapping.oldField}`);
  }

  // Add fields that don't need transformation (pass-through)
  // This would require more context; simplified here
  for (const added of comparison.added) {
    if (added.required) {
      fields.push(`  "${added.field}": null /* TODO: Set default value */`);
    }
  }

  return `{\n${fields.join(',\n')}\n}`;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  comparison: SchemaComparison,
  mappings: FieldMapping[]
): number {
  const totalChanges =
    comparison.renamed.length +
    comparison.added.length +
    comparison.removed.length +
    comparison.typeChanged.length;

  if (totalChanges === 0) return 1.0;

  // Reduce confidence for complex changes
  let confidence = 1.0;
  confidence -= comparison.typeChanged.length * 0.2;
  confidence -= comparison.added.filter((a) => a.required).length * 0.1;
  confidence -= comparison.structural.length * 0.3;

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Generate human-readable annotations
 */
function generateAnnotations(
  comparison: SchemaComparison,
  mappings: FieldMapping[]
): string[] {
  const annotations: string[] = [];

  if (comparison.renamed.length > 0) {
    annotations.push(
      `${comparison.renamed.length} field(s) renamed: ${comparison.renamed
        .map((r) => `${r.from} → ${r.to}`)
        .join(', ')}`
    );
  }

  if (comparison.added.length > 0) {
    annotations.push(
      `${comparison.added.length} field(s) added: ${comparison.added
        .map((a) => a.field)
        .join(', ')}`
    );
  }

  if (comparison.removed.length > 0) {
    annotations.push(
      `${comparison.removed.length} field(s) removed: ${comparison.removed
        .map((r) => r.field)
        .join(', ')}`
    );
  }

  if (comparison.typeChanged.length > 0) {
    annotations.push(
      `⚠️  ${comparison.typeChanged.length} type change(s) detected - requires manual review`
    );
  }

  return annotations;
}

/**
 * Generate request JSONata expression
 */
function generateRequestJsonata(
  transformations: Record<string, GenerationResult>
): string {
  // Simplified: use first transformation as template
  const first = Object.values(transformations)[0];
  if (!first) return '$';

  const parsed = JSON.parse(first.expression);
  return parsed.request || '$';
}

/**
 * Generate response JSONata expression
 */
function generateResponseJsonata(
  transformations: Record<string, GenerationResult>
): string {
  const first = Object.values(transformations)[0];
  if (!first) return '$';

  const parsed = JSON.parse(first.expression);
  return parsed.response || '$';
}

// Run main function
main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
