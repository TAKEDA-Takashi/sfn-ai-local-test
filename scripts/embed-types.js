#!/usr/bin/env node
/**
 * Build-time script to embed type definitions into source code
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const projectRoot = join(__dirname, '..')

// Read type definition files
const testTypes = readFileSync(join(projectRoot, 'src/types/test.ts'), 'utf-8')
const mockTypes = readFileSync(join(projectRoot, 'src/types/mock.ts'), 'utf-8')

// Create the embedded types constant
const embeddedTypes = `/**
 * AUTO-GENERATED: Type definitions embedded at build time
 * DO NOT EDIT - Edit src/types/*.ts instead
 */
export const EMBEDDED_TYPE_DEFINITIONS = \`
## Test Suite Type Definition (TypeScript):
${testTypes.replace(/`/g, '\\`').replace(/\$/g, '\\$')}

## Mock Configuration Type Definition (TypeScript):
${mockTypes.replace(/`/g, '\\`').replace(/\$/g, '\\$')}
\`
`

// Write to a new file that will be imported
const outputPath = join(projectRoot, 'src/ai/agents/embedded-types.ts')
writeFileSync(outputPath, embeddedTypes, 'utf-8')

console.log('✅ Type definitions embedded successfully at:', outputPath)
