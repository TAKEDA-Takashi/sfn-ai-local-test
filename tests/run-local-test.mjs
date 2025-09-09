#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { StateMachineExecutor } from '../src/core/interpreter/executor.js'

const testFile = process.argv[2]
const inputFile = process.argv[3]

try {
  const definition = JSON.parse(readFileSync(testFile, 'utf8'))
  const input = inputFile ? JSON.parse(readFileSync(inputFile, 'utf8')) : {}

  // Check if this is a single state definition (for test-states API format)
  let asl
  if (definition.Type && !definition.States) {
    // Single state definition - wrap in a state machine
    asl = {
      Comment: definition.Comment || 'Test state',
      StartAt: 'TestState',
      QueryLanguage: definition.QueryLanguage,
      States: {
        TestState: definition,
      },
    }
  } else {
    // Already a state machine definition
    asl = definition
  }

  const executor = new StateMachineExecutor(asl)
  const result = await executor.execute(input)

  console.log(JSON.stringify(result.output))
  process.exit(0)
} catch (e) {
  console.error(`ERROR:${e.message}`)
  if (e.stack) {
    console.error(`STACK:${e.stack}`)
  }
  process.exit(1)
}
