import { useEffect, useMemo, useRef } from 'react'
import { assignLanes } from '../graph/lanes.js'
import { relativeTime } from '../util/time.js'

const ROW = 28
const LANE = 16
const x = lane => 12 + lane * LANE
const y = row => row * ROW + ROW / 2
const color = lane => `var(--lane-${lane % 8})`

// Smooth vertical bend between two points.
const bend = (x1, y1, x2, y2) => `C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`

function edgePath(e, rowCount) {
  const toRow = e.toRow ?? rowCount // parent outside the window: run to the bottom
  const toLane = e.toLane ?? e.travelLane
  let d = `M ${x(e.fromLane)} ${y(e.fromRow)} `
  if (toRow === e.fromRow + 1) return d + bend(x(e.fromLane), y(e.fromRow), x(toLane), y(toRow))
  d += bend(x(e.fromLane), y(e.fromRow), x(e.travelLane), y(e.fromRow + 1))
  d += ` L ${x(e.travelLane)} ${y(toRow - 1)} `
  d += bend(x(e.travelLane), y(toRow - 1), x(toLane), y(toRow))
  return d
}

function RefPills({ refs, remoteNames }) {
  return refs.map(raw => {
    let name = raw
    let kind = 'local'
    if (raw.startsWith('tag: ')) { name = raw.slice(5); kind = 'tag' }
    else if (raw.startsWith('HEAD -> ')) { name = raw.slice(8); kind = 'head' }
    else if (raw === 'HEAD') kind = 'head'
    else if (remoteNames.has(raw)) kind = 'remote'
    return <span key={raw} className={`pill ${kind}`} title={raw}>{kind === 'tag' ? '🏷 ' : ''}{name}</span>
  })
}

export default function GraphView({ commits, remotes, selected, onSelect }) {
  const graph = useMemo(() => assignLanes(commits), [commits])
  const remoteNames = useMemo(() => new Set(remotes.map(r => r.name)), [remotes])
  const listRef = useRef(null)
  const width = Math.max(graph.laneCount, 1) * LANE + 16

  const selectedIndex = commits.findIndex(c => c.sha === selected)

  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return
    listRef.current.querySelector(`[data-row="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  function onKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const next = Math.min(commits.length - 1, Math.max(0, selectedIndex + (e.key === 'ArrowDown' ? 1 : -1)))
    if (commits[next]) onSelect(commits[next].sha)
  }

  if (!commits.length) return <div className="graph empty">Sin commits</div>

  return (
    <div className="graph" ref={listRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Gráfico de commits">
      <div className="graph-inner" style={{ height: commits.length * ROW }}>
        <svg className="graph-svg" width={width} height={commits.length * ROW} aria-hidden="true">
          {graph.edges.map((e, i) => (
            <path key={i} d={edgePath(e, commits.length)} stroke={color(e.travelLane)} strokeWidth="2" fill="none" />
          ))}
          {graph.rows.map((r, i) => (
            <circle key={r.sha} cx={x(r.lane)} cy={y(i)} r={commits[i].parents.length > 1 ? 4 : 5}
              fill={color(r.lane)} stroke="var(--bg)" strokeWidth="2" />
          ))}
        </svg>
        {commits.map((c, i) => (
          <div
            key={c.sha}
            data-row={i}
            className={c.sha === selected ? 'graph-row selected' : 'graph-row'}
            style={{ top: i * ROW, height: ROW, paddingLeft: width }}
            onClick={() => onSelect(c.sha)}
          >
            <span className="graph-refs"><RefPills refs={c.refs} remoteNames={remoteNames} /></span>
            <span className="graph-subject" title={c.subject}>{c.subject}</span>
            <span className="graph-author">{c.author}</span>
            <span className="graph-date" title={c.date}>{relativeTime(c.date)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
