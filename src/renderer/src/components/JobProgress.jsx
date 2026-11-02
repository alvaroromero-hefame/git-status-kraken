export default function JobProgress({ progress, onCancel }) {
  const { done = 0, total = 0 } = progress ?? {}
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="job-progress" role="status">
      <span>{total ? `Repo ${done}/${total}` : 'Listando repositorios…'}</span>
      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
      <button className="btn small" onClick={onCancel}>Cancelar</button>
    </div>
  )
}
