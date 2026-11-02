const ICONS = {
  repo: <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9" />,
  commits: <><circle cx="12" cy="12" r="3" /><path d="M3 12h6M15 12h6" /></>,
  branches: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>
}

const ITEMS = [
  ['repo', 'Repo local'],
  ['commits', 'Mis commits'],
  ['branches', 'Buscar ramas'],
  ['settings', 'Ajustes']
]

export default function Sidebar({ active, onChange }) {
  return (
    <nav className="sidebar">
      {ITEMS.map(([key, label]) => (
        <button
          key={key}
          className={key === active ? 'nav-btn active' : 'nav-btn'}
          title={label}
          aria-label={label}
          aria-current={key === active ? 'page' : undefined}
          onClick={() => onChange(key)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[key]}
          </svg>
        </button>
      ))}
    </nav>
  )
}
