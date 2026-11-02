import { useEffect, useState } from 'react'
import OrgPicker, { useSelectedOrgs } from '../components/OrgPicker.jsx'
import ResultsTable from '../components/ResultsTable.jsx'
import JobProgress from '../components/JobProgress.jsx'
import SearchFooter from '../components/SearchFooter.jsx'
import { useJob } from '../util/useJob.js'
import { formatDate } from '../util/time.js'

const isoDay = d => d.toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'org', label: 'Org' },
  { key: 'repo', label: 'Repo' },
  { key: 'branches', label: 'Rama(s)', value: r => r.branches.join(', '),
    render: r => r.branches.map(b => <span key={b} className="pill local">{b}</span>) },
  { key: 'date', label: 'Fecha', render: r => formatDate(r.date) },
  { key: 'message', label: 'Mensaje' },
  { key: 'sha', label: 'SHA', render: r => <button className="link" onClick={() => window.api.gh.openExternal(r.url)}>{r.sha.slice(0, 7)}</button> }
]

export default function CommitsView() {
  const [orgs, setOrgs] = useSelectedOrgs()
  const [login, setLogin] = useState('')
  const [since, setSince] = useState(() => isoDay(new Date(Date.now() - 30 * 864e5)))
  const [until, setUntil] = useState(() => isoDay(new Date()))
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const job = useJob()

  useEffect(() => {
    const load = () => window.api.auth.status().then(res => res.data && setLogin(l => l || res.data.login))
    load()
    window.addEventListener('auth-changed', load)
    return () => window.removeEventListener('auth-changed', load)
  }, [])

  async function search(e, confirmed = false) {
    e?.preventDefault()
    setError(null)
    const params = {
      orgs, login: login.trim(), confirmed,
      // Whole local days: from 00:00 of "since" to 23:59:59 of "until".
      since: new Date(`${since}T00:00:00`).toISOString(),
      until: new Date(`${until}T23:59:59`).toISOString()
    }
    const res = await job.start(jobId => window.api.gh.searchCommits(jobId, params))
    if (res.error) return setError(res.error.message)
    if (res.data.needsConfirm) {
      if (window.confirm(`Esta búsqueda puede hacer unas ${res.data.estimate} peticiones a GitHub. ¿Continuar?`)) search(null, true)
      return
    }
    setResult({ ...res.data, login: params.login })
  }

  const canSearch = orgs.length && login.trim() && since && until && since <= until && !job.running

  return (
    <div className="view">
      <div className="topbar"><h1>Mis commits</h1></div>
      <form className="search-form" onSubmit={search}>
        <OrgPicker selected={orgs} onChange={setOrgs} />
        <label className="field">Usuario
          <input type="text" value={login} onChange={e => setLogin(e.target.value)} placeholder="login de GitHub" />
        </label>
        <label className="field">Desde
          <input type="date" value={since} onChange={e => setSince(e.target.value)} />
        </label>
        <label className="field">Hasta
          <input type="date" value={until} onChange={e => setUntil(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!canSearch}>Buscar</button>
      </form>
      {job.running && <JobProgress progress={job.progress} onCancel={job.cancel} />}
      {error && <p className="error" role="alert" style={{ padding: '0 14px' }}>{error}</p>}
      {result && (
        <>
          <ResultsTable columns={COLUMNS} rows={result.rows.map(r => ({ ...r, id: `${r.org}/${r.repo}@${r.sha}` }))}
            emptyText={`No hay commits de @${result.login} en ese rango`} />
          <SearchFooter result={result} />
        </>
      )}
    </div>
  )
}
