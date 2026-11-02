import { test, expect } from 'vitest'
import { mergeStatus, summarizeSnapshots, isSnapshotBranch, chunkSize } from '../src/main/github/branches.js'

test('behindBy 0 -> merged', () => expect(mergeStatus({ behindBy: 0 })).toBe('merged'))
test('behindBy > 0 -> not-merged', () => expect(mergeStatus({ behindBy: 3 })).toBe('not-merged'))
test('missing base -> missing', () => expect(mergeStatus(null)).toBe('missing'))

test('snapshot: merged into some snapshot branches lists them', () => {
  expect(summarizeSnapshots([
    { name: 'v1.0.0/snapshot/rc1', comparison: { behindBy: 2 } },
    { name: 'v1.1.0/snapshot/rc1', comparison: { behindBy: 0 } },
    { name: 'v1.1.0/snapshot/rc2', comparison: { behindBy: 0 } }
  ])).toEqual({ status: 'merged', mergedInto: ['v1.1.0/snapshot/rc1', 'v1.1.0/snapshot/rc2'] })
})

test('snapshot: none merged -> not-merged', () => {
  expect(summarizeSnapshots([{ name: 'snapshots/0.5.0-SNAPSHOT', comparison: { behindBy: 4 } }]))
    .toEqual({ status: 'not-merged', mergedInto: [] })
})

test('snapshot: repo without snapshot branches -> missing', () => {
  expect(summarizeSnapshots([])).toEqual({ status: 'missing', mergedInto: [] })
})

test('snapshot: a compare that failed (null) is unknown, never merged', () => {
  expect(summarizeSnapshots([{ name: 'x-snapshot', comparison: null }])).toEqual({ status: 'unknown', mergedInto: [] })
})

test('isSnapshotBranch is case-insensitive', () => {
  expect(isSnapshotBranch('snapshots/0.5.0-SNAPSHOT')).toBe(true)
  expect(isSnapshotBranch('v1.2.0/snapshot/rc3')).toBe(true)
  expect(isSnapshotBranch('v1.2.0/release')).toBe(false)
})

test('chunkSize keeps compares per query around 100 and never below 1', () => {
  expect(chunkSize(4)).toBe(20)
  expect(chunkSize(500)).toBe(1)
})
