/**
 * Process items in parallel with controlled concurrency
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param concurrency Maximum number of concurrent operations (default: 2)
 * @returns Array of results in the same order as input items
 */
export async function processInParallel<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number = 2,
): Promise<(R | Error)[]> {
  if (items.length === 0) return []
  if (concurrency <= 0) throw new Error('Concurrency must be greater than 0')
  if (concurrency >= items.length) {
    // If concurrency is greater than or equal to items count, process all in parallel
    return Promise.all(
      items.map(async (item, index) => {
        try {
          return await processor(item, index)
        } catch (error) {
          return error instanceof Error ? error : new Error(String(error))
        }
      }),
    )
  }

  const results: (R | Error)[] = new Array(items.length)
  const executing: Promise<void>[] = []
  let currentIndex = 0

  const processNext = async (): Promise<void> => {
    const index = currentIndex++
    if (index >= items.length) return

    const item = items[index]
    if (item === undefined) return

    try {
      results[index] = await processor(item, index)
    } catch (error) {
      results[index] = error instanceof Error ? error : new Error(String(error))
    }

    // Continue processing next item
    await processNext()
  }

  // Start initial concurrent operations
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    executing.push(processNext())
  }

  // Wait for all operations to complete
  await Promise.all(executing)
  return results
}

/**
 * Check if result is an error
 */
export function isError(result: unknown): result is Error {
  return result instanceof Error
}
