import { useEffect, useState } from 'react'

const DEFAULT_ORGS = ['HefameMicroservices', 'HefamePortalesB2B']
const STORAGE_KEY = 'selectedOrgs'

function readStored() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return Array.isArray(v) && v.length ? v : DEFAULT_ORGS
  } catch {
    return DEFAULT_ORGS
  }
}

/** Selected orgs, remembered between sessions. */
export function useSelectedOrgs() {
  const [selected, setSelected] = useState(readStored)
  const update = next => {
    setSelected(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable: keep the selection in memory only
    }
  }
  return [selected, update]
}

export default function OrgPicker({ selected, onChange }) {
  const [available, setAvailable] = useState(DEFAULT_ORGS)
  const [extra, setExtra] = useState('')

  useEffect(() => {
    const load = () => window.api.gh.orgs().then(res => res.data && setAvailable(res.data))
    load()
    window.addEventListener('auth-changed', load)
    return () => window.removeEventListener('auth-changed', load)
  }, [])

  const all = [...new Set([...available, ...selected])]
  const toggle = org => onChange(selected.includes(org) ? selected.filter(o => o !== org) : [...selected, org])

  function add() {
    const org = extra.trim()
    if (org && !selected.includes(org)) onChange([...selected, org])
    setExtra('')
  }

  return (
    <fieldset className="org-picker">
      <legend>Organizaciones</legend>
      {all.map(org => (
        <label key={org} className="chip">
          <input type="checkbox" checked={selected.includes(org)} onChange={() => toggle(org)} /> {org}
        </label>
      ))}
      <span className="org-add">
        <input type="text" value={extra} onChange={e => setExtra(e.target.value)} placeholder="+ añadir"
          aria-label="Añadir organización"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
      </span>
    </fieldset>
  )
}
