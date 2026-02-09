/**
 * Specialized prompts for Parallel, Map, and DistributedMap states
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ItemReader } from '../../../types/asl'

export function getParallelSpecializedPrompt(promptsDir: string): string {
  try {
    return fs.readFileSync(path.join(promptsDir, 'parallel-specialized.md'), 'utf-8')
  } catch {
    return getDefaultParallelPrompt()
  }
}

export function getMapSpecializedPrompt(promptsDir: string): string {
  try {
    return fs.readFileSync(path.join(promptsDir, 'map-specialized.md'), 'utf-8')
  } catch {
    return getDefaultMapPrompt()
  }
}

export function getDistributedMapSpecializedPrompt(promptsDir: string): string {
  try {
    return fs.readFileSync(path.join(promptsDir, 'distributed-map-specialized.md'), 'utf-8')
  } catch {
    return getDefaultDistributedMapPrompt()
  }
}

function getDefaultParallelPrompt(): string {
  return `## Parallel State Guidance

### ⚠️ CRITICAL: Parallel State Mock Pattern ⚠️

**Parallel states execute branches INDEPENDENTLY and IN PARALLEL.**

**How to mock Parallel state tasks:**
1. **DO NOT mock the Parallel state itself** - it's a control flow state
2. **MOCK INDIVIDUAL TASK STATES INSIDE EACH BRANCH** - these are the actual execution points
3. **Use state name ONLY** - e.g., "CheckServiceA", NOT "ParallelChecks.Branch[0].CheckServiceA"

**Example for a Parallel state with 2 branches:**
\`\`\`yaml
# Branch 1 has task "CheckServiceA"
- state: "CheckServiceA"
  type: "fixed"
  response:
    Payload:
      status: "healthy"

# Branch 2 has tasks "CheckServiceB" and "ProcessServiceBResult"
- state: "CheckServiceB"
  type: "fixed"
  response:
    Payload:
      status: "degraded"

- state: "ProcessServiceBResult"
  type: "fixed"
  response:
    Payload:
      processed: true
\`\`\`

**Runtime behavior:**
- Parallel state collects outputs from all branches into an array
- Output: [branch1_result, branch2_result, ...]
- Each branch runs independently with its own mocks`
}

function getDefaultMapPrompt(): string {
  return `## Map State Guidance
- Can mock entire Map state or individual nested states inside Map
- For nested states: use ONLY the state name (e.g., "ProcessItem" NOT "MapState.ItemProcessor.ProcessItem")
- Output is an array of processed items
- Consider using conditional mocks for item-specific logic`
}

function getDefaultDistributedMapPrompt(): string {
  return `## Distributed Map Guidance

### ⚠️⚠️⚠️ CRITICAL: DistributedMap REQUIRES TWO MOCKS ⚠️⚠️⚠️

**EVERY DistributedMap needs BOTH:**
1. **ItemReader mock (MANDATORY)** - for input data
2. **State result mock** - for output metadata

### 🔴 CRITICAL: ItemReader Data MUST Match ItemProcessor Requirements

**Each item from ItemReader becomes the input to ItemProcessor states!**

Before creating the ItemReader mock, you MUST:
1. **Analyze the ItemProcessor's first state** - What fields does it expect?
2. **Check Choice conditions** - Variables like \`$.orderId\` indicate required fields
3. **Look at Parameters/ItemSelector** - These show field transformations
4. **Generate matching data** - Each item must have the required fields

Example: If ItemProcessor has a Choice checking \`$.status\` and \`$.amount\`:
\`\`\`yaml
- state: "ProcessOrders"
  type: "itemReader"
  dataFile: "orders.json"
  # Generated file MUST contain: [{"status": "pending", "amount": 100}, ...]
\`\`\`

### MANDATORY ItemReader Mock:
**⚠️ YOU MUST ALWAYS INCLUDE THIS FOR DISTRIBUTEDMAP WITH ITEMREADER ⚠️**
\`\`\`yaml
- state: "YourDistributedMapStateName"
  type: "itemReader"
  dataFile: "your-items.jsonl"  # External file with test data
  dataFormat: "jsonl"  # Match the ItemReader.ReaderConfig.InputType
\`\`\`

### DistributedMap Output (Automatically Generated):
The DistributedMap executor automatically generates the output based on ItemReader data:
- **Without ResultWriter**: Returns an array of processed results
- **With ResultWriter**: Returns metadata object with ProcessedItemCount and ResultWriterDetails

**⚠️ DO NOT CREATE A FIXED MOCK FOR DISTRIBUTEDMAP OUTPUT ⚠️**
The executor handles this automatically based on ItemReader processing.

### ItemReader Requirements:
- **S3:listObjectsV2**: Mock S3 object list
- **S3:getObject with InputType: JSONL**: Mock JSONL file content
- **S3:getObject with InputType: CSV**: Mock CSV data
- **S3:getObject with InputType: JSON**: Mock JSON array
- **S3:getObject with InputType: MANIFEST**: Mock S3 inventory manifest

**⚠️ NEVER SKIP THE ITEMREADER MOCK FOR DISTRIBUTEDMAP ⚠️**`
}

export function getParallelTestGuidance(): string {
  return `## Testing Parallel States

🔴 **CRITICAL: NEVER use stateExpectations for states inside Parallel branches!** 🔴

For Parallel states in your tests:
1. The Parallel state output is an ARRAY with one element per branch
2. Each array element contains the output from that branch
3. Always use outputMatching: "partial" for flexibility
4. Test the combined output at the Parallel state level using stateExpectations
5. **Use parallelExpectations to test branch execution paths**

**CORRECT STRUCTURE:**
\`\`\`yaml
# Test the Parallel state output
stateExpectations:
  - state: "ParallelProcessing"  # The Parallel state itself
    outputMatching: "partial"
    output: [result1, result2]  # Array of branch results

# Test the branch execution paths
parallelExpectations:
  - state: "ParallelProcessing"
    branchCount: 2
    branchPaths:
      0: ["BranchATask1", "BranchATask2"]
      1: ["BranchBTask1", "BranchBTask2"]
\`\`\`

❌ **NEVER DO THIS:**
\`\`\`yaml
stateExpectations:
  - state: "BranchATask1"  # WRONG! This is inside Parallel
    output: {...}
\`\`\``
}

export function getMapTestGuidance(): string {
  return `## Testing Map States

🔴 **CRITICAL: NEVER use stateExpectations for states inside Map ItemProcessor!** 🔴

For Map states in your tests:
1. The Map state output is an ARRAY of processed items
2. Each array element is the result of processing one input item
3. Test both empty arrays and multiple items
4. Consider MaxConcurrency effects on execution order
5. **Use mapExpectations to test iteration behavior**

**CORRECT STRUCTURE:**
\`\`\`yaml
# Test the Map state output
stateExpectations:
  - state: "ProcessItems"  # The Map state itself
    outputMatching: "partial"
    output: [item1Result, item2Result]  # Array of results

# Test the iteration behavior
mapExpectations:
  - state: "ProcessItems"
    iterationCount: 2
    iterationPaths:
      all: ["ValidateItem", "TransformItem", "SaveItem"]
\`\`\`

❌ **NEVER DO THIS:**
\`\`\`yaml
stateExpectations:
  - state: "ValidateItem"  # WRONG! This is inside Map
    output: {...}
\`\`\``
}

export function getDistributedMapTestGuidance(): string {
  return `## Testing Distributed Map States

🔴 **CRITICAL: NEVER use stateExpectations for states inside DistributedMap ItemProcessor!** 🔴

For Distributed Map states:
1. Output contains execution metadata (ProcessedItemCount, FailedItemCount, etc.)
2. NOT an array like regular Map
3. Test ResultWriterDetails for S3 output location
4. Consider testing with different batch sizes
5. **Use mapExpectations to test processor behavior**

**CORRECT STRUCTURE:**
\`\`\`yaml
# Test the DistributedMap state output
stateExpectations:
  - state: "BatchProcessing"  # The DistributedMap state itself
    outputMatching: "partial"
    output:
      ProcessedItemCount: 100
      FailedItemCount: 0

# Test the processor behavior
mapExpectations:
  - state: "BatchProcessing"
    iterationCount: 100
    iterationPaths:
      samples:
        0: ["LoadItem", "ProcessItem", "StoreResult"]
\`\`\`

❌ **NEVER DO THIS:**
\`\`\`yaml
stateExpectations:
  - state: "ProcessItem"  # WRONG! This is inside DistributedMap
    output: {...}
\`\`\``
}

export function getMockableStatesGuidance(mockableStates: string[]): string {
  return `## Mockable States for This State Machine

The following states can be mocked:
${mockableStates.map((s) => `- ${s}`).join('\n')}

**Important for Parallel States**:
- Mock states inside Parallel branches using their state name ONLY (e.g., "CheckServiceA", NOT "ParallelChecks.CheckServiceA")
- Each branch state needs its own mock definition
- The Parallel state itself does NOT need a mock

**Important for Map States**:
- For inline Map: Mock the Map state itself OR individual states inside ItemProcessor
- For distributed Map: Mock the Map state for ItemReader data, and individual processor states as needed`
}

export function getItemReaderMandatorySection(
  itemReaderStates: Array<{
    name: string
    itemReader: ItemReader
    hasResultWriter: boolean
  }>,
): string {
  const sections: string[] = []

  sections.push('## ⚠️⚠️⚠️ MANDATORY ITEMREADER MOCKS AND DATA FILES ⚠️⚠️⚠️')
  sections.push('')
  sections.push('**THE FOLLOWING ITEMREADER MOCKS AND DATA FILES ARE REQUIRED:**')
  sections.push('')

  itemReaderStates.forEach(({ name, itemReader }) => {
    const readerConfig = itemReader.ReaderConfig || {}
    const inputType = readerConfig.InputType || 'JSONL'
    const resource = itemReader.Resource || ''
    const dataFileName = `${name.toLowerCase().replace(/\s+/g, '-')}-items.${inputType.toLowerCase()}`

    sections.push(`### State: "${name}"`)
    sections.push(`- Resource: ${resource}`)
    sections.push(`- InputType: ${inputType}`)
    sections.push('')

    // Data file content requirements
    sections.push(`**1. CREATE DATA FILE: "${dataFileName}"**`)
    sections.push(`\`\`\`${inputType.toLowerCase()}`)

    if (inputType === 'JSONL') {
      sections.push('{"id": "item-1", "name": "First Item", "value": 100}')
      sections.push('{"id": "item-2", "name": "Second Item", "value": 200}')
      sections.push('{"id": "item-3", "name": "Third Item", "value": 300}')
    } else if (inputType === 'JSON') {
      sections.push('[')
      sections.push('  {"id": "item-1", "name": "First Item", "value": 100},')
      sections.push('  {"id": "item-2", "name": "Second Item", "value": 200},')
      sections.push('  {"id": "item-3", "name": "Third Item", "value": 300}')
      sections.push(']')
    } else if (inputType === 'CSV') {
      sections.push('id,name,value')
      sections.push('item-1,First Item,100')
      sections.push('item-2,Second Item,200')
      sections.push('item-3,Third Item,300')
    } else if (inputType === 'MANIFEST') {
      sections.push('{"Bucket": "my-bucket", "Key": "object1.json", "Size": 1024}')
      sections.push('{"Bucket": "my-bucket", "Key": "object2.json", "Size": 2048}')
      sections.push('{"Bucket": "my-bucket", "Key": "object3.json", "Size": 3072}')
    }

    sections.push('```')
    sections.push('')

    sections.push('**2. ADD ITEMREADER MOCK IN YAML:**')
    sections.push('```yaml')
    sections.push(`- state: "${name}"`)
    sections.push('  type: "itemReader"')
    sections.push(`  dataFile: "${dataFileName}"`)
    sections.push(`  dataFormat: "${inputType.toLowerCase()}"`)
    sections.push('```')
    sections.push('')

    // Note: DistributedMap result is automatically generated by the executor
    // No need for a separate fixed mock
    sections.push(
      '**NOTE:** The DistributedMap result (ProcessedItemCount, ResultWriterDetails, etc.)',
    )
    sections.push('is automatically generated by the executor based on the ItemReader data.')
    sections.push('DO NOT create a separate fixed mock for DistributedMap states.')
    sections.push('')
  })

  sections.push('## IMPORTANT NOTES:')
  sections.push('1. **Include the ItemReader mocks in your YAML output**')
  sections.push('2. **Reference the data file names correctly in dataFile field**')
  sections.push(
    '3. **Data files shown above are examples - actual files will be generated separately**',
  )
  sections.push('')
  sections.push('**⚠️ YOUR YAML MUST INCLUDE ALL ITEMREADER MOCKS SHOWN ABOVE ⚠️**')

  return sections.join('\n')
}
