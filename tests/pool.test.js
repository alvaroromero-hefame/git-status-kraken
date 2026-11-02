import { test, expect } from 'vitest'
import { mapLimit } from '../src/main/github/pool.js'

test('mapLimit never exceeds limit and keeps order', async () => {
  let running = 0, peak = 0
  const { results } = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async n => {
    running++; peak = Math.max(peak, running)
    await new Promise(r => setTimeout(r, 5))
    running--
    return n * 2
  })
  expect(peak).toBe(3); expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
})

test('failures are collected, others still resolve', async () => {
  const { results, failures } = await mapLimit([1, 2, 3], 2, async n => { if (n === 2) throw new Error('x'); return n })
  expect(results.filter(r => r !== undefined)).toEqual([1, 3]); expect(failures.map(f => f.item)).toEqual([2])
})

test('abort stops starting new items', async () => {
  const ac = new AbortController(); const seen = []
  await mapLimit([1, 2, 3, 4], 1, async n => { seen.push(n); if (n === 2) ac.abort() }, ac.signal)
  expect(seen).toEqual([1, 2])
})

test('empty input resolves immediately', async () => {
  expect(await mapLimit([], 5, async () => 1)).toEqual({ results: [], failures: [] })
})
