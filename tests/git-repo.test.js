import { test, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { getStatus, getLog, getRefs, getCommitDetail, resolveRepoRoot } from '../src/main/git/repo.js'

let dir
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsk-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
})

test('empty repo: no commits, no untracked, no crash', async () => {
  expect(await getLog(dir)).toEqual([])
  expect((await getStatus(dir)).untracked).toEqual([])
  expect(await getRefs(dir)).toEqual({ local: [], remote: [], tags: [] })
})

test('untracked file, then commit, then detail', async () => {
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hola')
  expect((await getStatus(dir)).untracked).toEqual(['a.txt'])
  execFileSync('git', ['add', 'a.txt'], { cwd: dir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first'], { cwd: dir })
  const log = await getLog(dir)
  expect(log).toHaveLength(1)
  const detail = await getCommitDetail(dir, log[0].sha)
  expect(detail.files).toEqual([{ status: 'A', path: 'a.txt' }])
  expect(detail).toMatchObject({ sha: log[0].sha, author: 't', email: 't@t', message: 'first' })
  expect((await getRefs(dir)).local).toEqual([{ name: 'main', sha: log[0].sha }])
})

test('resolveRepoRoot returns null outside a repo and the root inside one', async () => {
  expect(await resolveRepoRoot(os.tmpdir())).toBeNull()
  expect(path.resolve(await resolveRepoRoot(dir))).toBe(fs.realpathSync.native(dir))
})

test('getCommitDetail rejects option-like input', async () => {
  await expect(getCommitDetail(dir, '--output=x')).rejects.toThrow('SHA inválido')
})
