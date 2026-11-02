import { test, expect } from 'vitest'
import { assignLanes } from '../src/renderer/src/graph/lanes.js'

const C = (sha, ...parents) => ({ sha, parents })

test('linear history stays in lane 0', () => {
  const r = assignLanes([C('c', 'b'), C('b', 'a'), C('a')])
  expect(r.rows.map(x => x.lane)).toEqual([0, 0, 0]); expect(r.laneCount).toBe(1)
})

test('merge commit opens lane 1 for second parent and it closes back into lane 0', () => {
  const r = assignLanes([C('m', 'a', 'b'), C('b', 'a'), C('a')])
  expect(r.rows.map(x => x.lane)).toEqual([0, 1, 0])
  expect(r.edges).toEqual([
    { fromRow: 0, fromLane: 0, travelLane: 0, toRow: 2, toLane: 0 },
    { fromRow: 0, fromLane: 0, travelLane: 1, toRow: 1, toLane: 1 },
    { fromRow: 1, fromLane: 1, travelLane: 1, toRow: 2, toLane: 0 }])
})

test('two branch tips sharing a parent get separate lanes', () => {
  expect(assignLanes([C('x', 'a'), C('y', 'a'), C('a')]).rows.map(r => r.lane)).toEqual([0, 1, 0])
})

test('parent outside window leaves toRow null', () => {
  expect(assignLanes([C('b', 'zzz')]).edges[0].toRow).toBeNull()
})

test('empty input', () => {
  expect(assignLanes([])).toEqual({ rows: [], edges: [], laneCount: 0 })
})
