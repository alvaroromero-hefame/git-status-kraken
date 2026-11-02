import { useState } from 'react'
import OrgPicker, { useSelectedOrgs } from '../components/OrgPicker.jsx'
import ResultsTable from '../components/ResultsTable.jsx'
import JobProgress from '../components/JobProgress.jsx'
import SearchFooter from '../components/SearchFooter.jsx'
import { useJob } from '../util/useJob.js'
import { formatDate } from '../util/time.js'

const STATUS = {
  merged: { icon: '✅', label: 'Mergeada' },
  'not-merged': { icon: '❌', label: 'No mergeada' },
  missing: { icon: '—', label: 'No existe' },
  unknown: { icon: '⚠️', label: 'No se pudo comparar' }
}

const StatusIcon = ({ status, detail }) => (
  <span className="status-cell" aria-label={STATUS[status].label} title={detail || STATUS[status].label}>
    {STATUS[status].icon} {detail && <span className="muted">{detail}</span>}
  </span>
)

function snapshotDetail(s) {
  if (s.status !== 'merged') return ''
  const [first, ...rest] = s.mergedInto
  return rest.length ? `${first} (+${rest.length})` : first
}

const COLUMNS = [
  { key: 'org', label: 'Org' },
  { key: 'repo', label: 'Repo' },
  { key: 'branch', label: 'Rama' },
  { key: 'lastCommit', label: 'Último commit', render: r => (r.lastCommit ? formatDate(r.lastCommit) : '—') },
  { key: 'snapshot', label: 'Snapshot', value: r => r.snapshot.status,
    render: r => <span title={r.snapshot.mergedInto.join('\n')}><StatusIcon status={r.snapshot.status} detail={snapshotDetail(r.snapshot)} /></span> },
  { key: 'release', label: 'Principal (master/main)', value: r => r.release,
    render: r => <StatusIcon status={r.release} detail={r.defaultBranch ?? ''} /> }
]

export default function BranchesView() {
  const [orgs, setOrgs] = useSelectedOrgs()
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const job = useJob()

  async function search(e, confirmed = false) {
    e?.preventDefault()
    setError(null)
    const params = { orgs, text: text.trim(), confirmed }
    const res = await job.start(jobId => window.api.gh.searchBranches(jobId, params))
    if (res.error) return setError(res.error.message)
    if (res.data.needsConfirm) {
      if (window.confirm(`Esta búsqueda puede hacer unas ${res.data.estimate} peticiones a GitHub. ¿Continuar?`)) search(null, true)
      return
    }
    setResult({ ...res.data, text: params.text })
  }

  const tooShort = text.trim().length < 2

  return (
    <div className="view">
      <div className="topbar"><h1>Buscar ramas</h1></div>
      <form className="search-form" onSubmit={search}>
        <OrgPicker selected={orgs} onChange={setOrgs} />
        <label className="field">Texto en el nombre de la rama
          <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="p. ej. TEC-3516" />
        </label>
        <button className="btn primary" disabled={!orgs.length || tooShort || job.running}>Buscar</button>
        {text && tooShort && <span className="muted">Escribe al menos 2 caracteres</span>}
      </form>
      {job.running && <JobProgress progress={job.progress} onCancel={job.cancel} />}
      {error && <p className="error" role="alert" style={{ padding: '0 14px' }}>{error}</p>}
      {result && (
        <>
          <ResultsTable columns={COLUMNS} rows={result.rows.map(r => ({ ...r, id: `${r.org}/${r.repo}:${r.branch}` }))}
            emptyText={`Ninguna rama contiene "${result.text}"`} />
          <SearchFooter result={result} />
        </>
      )}
    </div>
  )
}
