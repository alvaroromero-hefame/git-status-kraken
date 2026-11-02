import { useMemo, useState } from 'react'

/** columns: [{ key, label, render?(row), value?(row) }]. value() feeds sorting and the quick filter. */
export default function ResultsTable({ columns, rows, emptyText }) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState(null) // { key, dir }

  const visible = useMemo(() => {
    const valueOf = (col, row) => String(col.value ? col.value(row) : row[col.key] ?? '')
    const f = filter.trim().toLowerCase()
    let out = f ? rows.filter(r => columns.some(c => valueOf(c, r).toLowerCase().includes(f))) : rows
    if (sort) {
      const col = columns.find(c => c.key === sort.key)
      out = [...out].sort((a, b) => valueOf(col, a).localeCompare(valueOf(col, b), 'es', { numeric: true }) * sort.dir)
    }
    return out
  }, [rows, columns, filter, sort])

  const toggleSort = key => setSort(s => (s?.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))

  return (
    <div className="results">
      <div className="results-bar">
        <input type="text" placeholder="Filtrar resultados…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtrar resultados" />
        <span className="muted">{visible.length} de {rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} aria-sort={sort?.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                    <button onClick={() => toggleSort(c.key)}>
                      {c.label}{sort?.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id ?? i}>
                  {columns.map(c => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
