/**
 * Runs fn over items with at most `limit` in flight. Results keep input order.
 * A rejected item goes to `failures` instead of aborting the rest.
 * Once `signal` is aborted, no new items start (running ones finish).
 */
export async function mapLimit(items, limit, fn, signal) {
  const results = new Array(items.length)
  const failures = []
  let next = 0

  async function worker() {
    while (next < items.length && !signal?.aborted) {
      const i = next++
      try {
        results[i] = await fn(items[i], i)
      } catch (error) {
        failures.push({ item: items[i], error })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return { results, failures }
}
