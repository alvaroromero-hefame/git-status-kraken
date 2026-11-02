import { test, expect } from 'vitest'
import { parseStatus, parseLog, parseRefs } from '../src/main/git/parse.js'

test('parseStatus: branch, ab, staged/modified/untracked/conflict, paths with spaces and ñ', () => {
  const raw = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
    '1 M. N... 100644 100644 100644 a a carpeta ñ/a b.txt',
    '1 .M N... 100644 100644 100644 a a src/x.js',
    '2 R. N... 100644 100644 100644 a a R100 new.txt', 'old.txt',
    'u UU N... 1 1 1 1 a a a conf.txt',
    '? nuevo fichero.md', ''].join('\0')
  expect(parseStatus(raw)).toEqual({ head: 'main', detached: false, upstream: 'origin/main', ahead: 2, behind: 1,
    staged: ['carpeta ñ/a b.txt', 'new.txt'], modified: ['src/x.js'], untracked: ['nuevo fichero.md'], conflicts: ['conf.txt'] })
})

test('parseStatus: entry both staged and modified goes in both lists', () => {
  const s = parseStatus(['# branch.head main', '1 MM N... 100644 100644 100644 a a f.txt', ''].join('\0'))
  expect(s.staged).toEqual(['f.txt']); expect(s.modified).toEqual(['f.txt'])
})

test('parseStatus: detached HEAD', () => {
  const s = parseStatus(['# branch.oid 1234567890abcdef', '# branch.head (detached)', ''].join('\0'))
  expect(s.detached).toBe(true); expect(s.head).toBe('1234567')
})

test('parseLog: parents, refs split, root commit has no parents', () => {
  const raw = 'b\x1fa\x1fAna\x1f2026-11-01T10:00:00+01:00\x1fHEAD -> main, origin/main, tag: v1\x1fsecond\x1e\n' +
              'a\x1f\x1fAna\x1f2026-10-31T10:00:00+01:00\x1f\x1ffirst\x1e\n'
  const [b, a] = parseLog(raw)
  expect(b.parents).toEqual(['a']); expect(b.refs).toEqual(['HEAD -> main', 'origin/main', 'tag: v1'])
  expect(a.parents).toEqual([]); expect(a.refs).toEqual([])
  expect(b).toMatchObject({ sha: 'b', author: 'Ana', date: '2026-11-01T10:00:00+01:00', subject: 'second' })
})

test('parseRefs groups heads, remotes (minus */HEAD), tags', () => {
  const raw = 'refs/heads/main\x1f1\nrefs/remotes/origin/HEAD\x1f1\nrefs/remotes/origin/dev\x1f2\nrefs/tags/v1\x1f3\n'
  expect(parseRefs(raw)).toEqual({ local: [{ name: 'main', sha: '1' }], remote: [{ name: 'origin/dev', sha: '2' }], tags: [{ name: 'v1', sha: '3' }] })
})

test('parseRefs uses the peeled commit for annotated tags', () => {
  expect(parseRefs('refs/tags/v2\x1ftagobj\x1fcommitsha\n').tags).toEqual([{ name: 'v2', sha: 'commitsha' }])
})
