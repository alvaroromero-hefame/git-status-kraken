import { useEffect, useState } from 'react'
import { formatDate } from '../util/time.js'

export default function CommitDetail({ sha }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setError(null)
    if (sha) {
      window.api.repo.detail(sha)
        .then(d => alive && setDetail(d))
        .catch(err => alive && setError(err.message))
    }
    return () => { alive = false }
  }, [sha])

  if (!sha) return <aside className="detail-panel muted">Selecciona un commit</aside>
  if (error) return <aside className="detail-panel error">{error}</aside>
  if (!detail) return <aside className="detail-panel muted">Cargando…</aside>

  return (
    <aside className="detail-panel">
      <div className="detail-sha">
        <code>{detail.sha.slice(0, 10)}</code>
        <button className="btn small" onClick={() => navigator.clipboard.writeText(detail.sha)}>Copiar SHA</button>
      </div>
      <p className="detail-msg">{detail.message}</p>
      <p className="muted">{detail.author} &lt;{detail.email}&gt;<br />{formatDate(detail.date)}</p>
      <h2>Ficheros ({detail.files.length})</h2>
      <ul className="file-list">
        {detail.files.map(f => (
          <li key={f.path}><span className={`badge s-${f.status}`}>{f.status}</span>{f.path}</li>
        ))}
      </ul>
    </aside>
  )
}
