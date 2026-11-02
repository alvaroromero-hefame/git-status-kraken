import { test, expect } from 'vitest'
import { dedupeCommits } from '../src/main/github/commits.js'

test('dedupeCommits merges same sha across branches and sorts newest first', () => {
  const base = { org: 'o', repo: 'r', message: 'm', url: 'u' }
  const out = dedupeCommits([
    { ...base, branch: 'snapshot', sha: 'a', date: '2026-10-01T00:00:00Z' },
    { ...base, branch: 'feature/x', sha: 'a', date: '2026-10-01T00:00:00Z' },
    { ...base, branch: 'master', sha: 'b', date: '2026-10-05T00:00:00Z' }])
  expect(out.map(c => c.sha)).toEqual(['b', 'a']); expect(out[1].branches).toEqual(['feature/x', 'snapshot'])
})

test('same sha in two different repos (fork/mirror) stays as two rows', () => {
  const out = dedupeCommits([
    { org: 'o', repo: 'r1', branch: 'master', sha: 'a', date: '2026-10-01T00:00:00Z', message: 'm', url: 'u1' },
    { org: 'o', repo: 'r2', branch: 'master', sha: 'a', date: '2026-10-01T00:00:00Z', message: 'm', url: 'u2' }])
  expect(out).toHaveLength(2)
})
