const SECTIONS = [['local', 'Local'], ['remote', 'Remoto'], ['tags', 'Tags']]

export default function BranchPanel({ refs, onSelect }) {
  return (
    <aside className="branch-panel">
      {SECTIONS.map(([key, label]) => (
        <details key={key} open={key !== 'tags'}>
          <summary>{label} <span className="muted">{refs[key].length}</span></summary>
          <ul>
            {refs[key].map(r => (
              <li key={r.name}>
                <button className="ref-btn" title={r.name} onClick={() => onSelect(r.sha)}>{r.name}</button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </aside>
  )
}
