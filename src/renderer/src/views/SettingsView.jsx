import { useEffect, useState } from 'react'

export default function SettingsView() {
  const [login, setLogin] = useState(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.auth.status().then(res => {
      if (res.error) setError(res.error.message)
      else setLogin(res.data?.login ?? null)
    })
  }, [])

  async function connect(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await window.api.auth.save(token)
    setBusy(false)
    if (res.error) return setError(res.error.message)
    setLogin(res.data.login)
    setToken('')
    window.dispatchEvent(new Event('auth-changed'))
  }

  async function disconnect() {
    await window.api.auth.clear()
    setLogin(null)
    window.dispatchEvent(new Event('auth-changed'))
  }

  return (
    <div className="view">
      <div className="topbar"><h1>Ajustes</h1></div>
      <div className="settings">
        <h2>Conexión con GitHub</h2>
        {login ? (
          <p>Conectado como <strong>@{login}</strong> <button className="btn" onClick={disconnect}>Desconectar</button></p>
        ) : (
          <form onSubmit={connect} className="token-form">
            <label htmlFor="token">Token personal (PAT)</label>
            <input id="token" type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder="ghp_…" autoComplete="off" spellCheck="false" />
            <button className="btn primary" disabled={!token.trim() || busy}>{busy ? 'Comprobando…' : 'Conectar'}</button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="help">
          <p>El token se guarda cifrado con el cifrado de Windows y nunca sale de esta máquina salvo hacia GitHub.</p>
          <p>Crea un <strong>token clásico</strong> en GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic), con los permisos <code>repo</code> y <code>read:org</code>.</p>
          <p>Si la organización usa SSO, pulsa <em>Configure SSO</em> junto al token y autorízalo para cada organización.</p>
        </div>
      </div>
    </div>
  )
}
