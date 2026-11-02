import { useState, useCallback } from 'react'
import BranchPanel from '../components/BranchPanel.jsx'
import GraphView from '../components/GraphView.jsx'
import CommitDetail from '../components/CommitDetail.jsx'
import WipHeader from '../components/WipHeader.jsx'

export default function RepoView() {
  const [repoPath, setRepoPath] = useState(null)
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await window.api.repo.load())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  async function choose() {
    const res = await window.api.repo.choose()
    if (!res) return
    if (res.error) {
      setError(res.error)
      return
    }
    setRepoPath(res.path)
    setSelected(null)
    await load()
  }

  const repoName = repoPath ? repoPath.split(/[\/]/).pop() : null

  return (
    <div className="view">
      <div className="topbar">
        <button className="btn primary" onClick={choose}>Abrir repositorio</button>
        {repoName && <h1 title={repoPath}>{repoName}</h1>}
        {repoPath && <button className="btn" onClick={load} disabled={loading}>{loading ? 'Cargando…' : 'Refrescar'}</button>}
        {error && <span className="error" role="alert">{error}</span>}
      </div>
      {!data ? (
        <div className="empty">Abre una carpeta con un repositorio git para ver su estado y su gráfico de ramas.</div>
      ) : (
        <div className="repo-layout">
          <BranchPanel refs={data.refs} onSelect={setSelected} />
          <div className="repo-center">
            <WipHeader status={data.status} />
            <GraphView commits={data.log} remotes={data.refs.remote} selected={selected} onSelect={setSelected} />
          </div>
          <CommitDetail sha={selected} />
        </div>
      )}
    </div>
  )
}
