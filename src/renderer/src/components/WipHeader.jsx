const GROUPS = [['staged', 'Preparados'], ['modified', 'Modificados'], ['untracked', 'Sin seguimiento'], ['conflicts', 'Conflictos']]

export default function WipHeader({ status }) {
  const branch = status.detached ? `HEAD detached at ${status.head}` : status.head
  const total = GROUPS.reduce((n, [k]) => n + status[k].length, 0)
  return (
    <section className="wip">
      <div className="wip-head">
        <strong>{branch}</strong>
        {status.upstream && <span className="muted">→ {status.upstream} ↑{status.ahead} ↓{status.behind}</span>}
        <span className="wip-tag">{total ? `WIP · ${total} ficheros` : 'Árbol de trabajo limpio'}</span>
      </div>
      {total > 0 && (
        <div className="wip-groups">
          {GROUPS.filter(([k]) => status[k].length).map(([k, label]) => (
            <details key={k} className={`wip-group ${k}`}>
              <summary>{label} ({status[k].length})</summary>
              <ul>{status[k].map(p => <li key={p}>{p}</li>)}</ul>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
