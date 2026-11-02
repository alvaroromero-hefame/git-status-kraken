// Assigns each commit a column ("lane") for the branch graph.
// Input: commits in topo order, newest first ({ sha, parents }).
// Output edges describe a line from a commit down to its parent: it leaves the commit,
// moves to `travelLane` on the next row, runs straight down, and bends into the parent's lane.

function firstFree(active) {
  const i = active.indexOf(null)
  return i === -1 ? active.length : i
}

export function assignLanes(commits) {
  const active = [] // active[i] = sha that lane i is waiting for, or null
  const pending = new Map() // parent sha -> indexes of edges waiting for it
  const rows = []
  const edges = []
  let maxLane = -1

  commits.forEach((c, row) => {
    let lane = active.indexOf(c.sha)
    if (lane === -1) lane = firstFree(active)

    // Other lanes waiting for this commit converge here.
    for (let i = 0; i < active.length; i++) {
      if (i !== lane && active[i] === c.sha) active[i] = null
    }
    for (const e of pending.get(c.sha) ?? []) {
      edges[e].toRow = row
      edges[e].toLane = lane
    }
    pending.delete(c.sha)
    active[lane] = null

    c.parents.forEach((p, k) => {
      let travel
      if (k === 0) travel = lane
      else {
        travel = active.indexOf(p)
        if (travel === -1) travel = firstFree(active)
      }
      active[travel] = p
      edges.push({ fromRow: row, fromLane: lane, travelLane: travel, toRow: null, toLane: null })
      if (!pending.has(p)) pending.set(p, [])
      pending.get(p).push(edges.length - 1)
      maxLane = Math.max(maxLane, travel)
    })

    rows.push({ sha: c.sha, lane })
    maxLane = Math.max(maxLane, lane)
  })

  return { rows, edges, laneCount: maxLane + 1 }
}
